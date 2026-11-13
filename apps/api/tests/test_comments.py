import asyncio
from collections.abc import Generator
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.main import app
from app.models import Comment, CommentRevision, PlatformRole, Post, PostType
from tests.conftest import test_async_session as db_session
from tests.test_hub_models import create_committed_hub
from tests.test_posts import _bearer, _create, _set_user_role, _while_a_delete_is_uncommitted


def _truncate() -> None:
    async def clean() -> None:
        async with db_session() as session:
            await session.execute(text("TRUNCATE posts, comments CASCADE"))
            await session.commit()

    asyncio.run(clean())


@pytest.fixture(autouse=True)
def cleanup() -> Generator[None]:
    _truncate()
    yield
    _truncate()


def _comment(client: TestClient, auth: dict[str, str], post_id: str, body: str, **fields):
    return client.post(f"/v1/posts/{post_id}/comments", headers=auth, json={"body": body, **fields})


def _comment_id(client: TestClient, auth: dict[str, str], post_id: str, body: str, **fields) -> str:
    resp = _comment(client, auth, post_id, body, **fields)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


def _stored(comment_id: str) -> Comment:
    async def load() -> Comment:
        async with db_session() as session:
            return await session.get_one(Comment, UUID(comment_id))

    return asyncio.run(load())


def _hub_post(author_id: str) -> str:
    async def add() -> str:
        hub_id = await create_committed_hub()
        async with db_session() as session:
            post = Post(
                author_id=UUID(author_id),
                type=PostType.HUB_MILESTONE,
                body="Hub only",
                hub_id=hub_id,
            )
            session.add(post)
            await session.commit()
            return str(post.id)

    return asyncio.run(add())


def _insert_comment(post_id: str, author_id: str) -> str:
    """A comment the API would refuse to create, such as one on a hub post."""

    async def add() -> str:
        async with db_session() as session:
            comment_id = uuid4()
            session.add(
                Comment(
                    id=comment_id,
                    post_id=UUID(post_id),
                    root_id=comment_id,
                    author_id=UUID(author_id),
                    body="Inside the hub",
                )
            )
            await session.commit()
            return str(comment_id)

    return asyncio.run(add())


def _error(resp, status: int) -> str:
    assert resp.status_code == status, resp.text
    return resp.json()["detail"]["code"]


def test_comment_and_reply_build_a_thread_and_keep_the_counts(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    ada_auth, moussa_auth = _bearer(ada["access_token"]), _bearer(moussa["access_token"])
    post_id = _create(client, ada_auth, "Which Postgres host works best from Lagos?")

    top = _comment(client, moussa_auth, post_id, "We run ours in Johannesburg.")
    assert top.status_code == 201, top.text
    comment = top.json()["data"]
    assert comment["post_id"] == post_id
    assert comment["parent_id"] is None
    assert comment["depth"] == 0
    assert comment["author"]["username"] == "moussa-dakar"
    assert comment["body"] == "We run ours in Johannesburg."
    assert (comment["like_count"], comment["reply_count"], comment["liked_by_me"]) == (0, 0, False)
    assert comment["edited_at"] is None

    reply = _comment(client, ada_auth, post_id, "How is the latency?", parent_id=comment["id"])
    assert reply.status_code == 201, reply.text
    assert reply.json()["data"]["parent_id"] == comment["id"]
    assert reply.json()["data"]["depth"] == 1
    deeper = _comment_id(
        client, moussa_auth, post_id, "About 40 ms.", parent_id=reply.json()["data"]["id"]
    )

    assert _stored(deeper).root_id == UUID(comment["id"])
    assert _stored(deeper).depth == 2
    got = client.get(f"/v1/comments/{comment['id']}", headers=ada_auth).json()["data"]
    assert got["reply_count"] == 1
    assert client.get(f"/v1/posts/{post_id}", headers=ada_auth).json()["data"]["comment_count"] == 3


def test_a_reply_needs_a_live_parent_on_the_same_post(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create(client, auth, "Mobile money APIs")
    other_post = _create(client, auth, "Offline sync")
    elsewhere = _comment_id(client, auth, other_post, "On the other post")
    removed = _comment_id(client, auth, post_id, "Removed soon")
    assert client.delete(f"/v1/comments/{removed}", headers=auth).status_code == 204

    for parent in (elsewhere, removed, str(uuid4())):
        resp = _comment(client, auth, post_id, "A reply", parent_id=parent)
        assert _error(resp, 422) == "PARENT_NOT_FOUND", parent


def test_comments_are_refused_on_missing_deleted_and_hub_posts(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    deleted = _create(client, auth, "Gone")
    assert client.delete(f"/v1/posts/{deleted}", headers=auth).status_code == 204

    for post_id in (str(uuid4()), deleted, _hub_post(ada["user"]["id"])):
        assert _error(_comment(client, auth, post_id, "Hello"), 404) == "POST_NOT_FOUND"


def test_comment_body_rules(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create(client, auth, "Rules")

    assert _comment(client, auth, post_id, "a" * 5000).status_code == 201
    for bad in ("", "   ", "a" * 5001, "bad" + chr(0)):
        assert _comment(client, auth, post_id, bad).status_code == 422, bad
    extra = _comment(client, auth, post_id, "Hi", author_id=str(uuid4()))
    assert extra.status_code == 422


def test_editing_a_comment_keeps_a_revision_and_only_the_author_may(
    client: TestClient, sign_in
) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    post_id = _create(client, ada_auth, "Edits")
    comment_id = _comment_id(client, ada_auth, post_id, "First version")

    other = client.patch(f"/v1/comments/{comment_id}", headers=moussa_auth, json={"body": "Mine"})
    assert _error(other, 403) == "NOT_COMMENT_AUTHOR"
    edited = client.patch(f"/v1/comments/{comment_id}", headers=ada_auth, json={"body": "Second"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["body"] == "Second"
    assert edited.json()["data"]["edited_at"] is not None
    for bad in ({}, {"body": " "}, {"body": None}):
        assert (
            client.patch(f"/v1/comments/{comment_id}", headers=ada_auth, json=bad).status_code
            == 422
        )

    async def revisions() -> list[str]:
        async with db_session() as session:
            return list(
                await session.scalars(
                    select(CommentRevision.body).where(
                        CommentRevision.comment_id == UUID(comment_id)
                    )
                )
            )

    assert asyncio.run(revisions()) == ["First version"]


def test_deleting_a_comment_by_author_or_moderator(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    ada_auth, moussa_auth = _bearer(ada["access_token"]), _bearer(moussa["access_token"])
    post_id = _create(client, ada_auth, "Deletes")
    mine = _comment_id(client, ada_auth, post_id, "Mine")
    theirs = _comment_id(client, ada_auth, post_id, "Moderated")

    assert _error(client.delete(f"/v1/comments/{theirs}", headers=moussa_auth), 403) == (
        "NOT_COMMENT_AUTHOR"
    )
    assert client.delete(f"/v1/comments/{mine}", headers=ada_auth).status_code == 204
    _set_user_role(UUID(moussa["user"]["id"]), PlatformRole.MODERATOR)
    try:
        assert client.delete(f"/v1/comments/{theirs}", headers=moussa_auth).status_code == 204
    finally:
        _set_user_role(UUID(moussa["user"]["id"]), PlatformRole.MEMBER)

    assert (_stored(mine).deletion_reason, _stored(theirs).deletion_reason) == (
        "author",
        "moderator",
    )
    assert str(_stored(theirs).deleted_by) == moussa["user"]["id"]
    assert client.get(f"/v1/posts/{post_id}", headers=ada_auth).json()["data"]["comment_count"] == 0
    for request in (client.get, client.delete):
        assert _error(request(f"/v1/comments/{mine}", headers=ada_auth), 404) == "COMMENT_NOT_FOUND"
    gone_edit = client.patch(f"/v1/comments/{mine}", headers=ada_auth, json={"body": "Back"})
    assert _error(gone_edit, 404) == "COMMENT_NOT_FOUND"


def test_comments_on_deleted_and_hub_posts_are_gone(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    post_id = _create(client, auth, "Soon deleted")
    on_deleted_post = _comment_id(client, auth, post_id, "Still here?")
    assert client.delete(f"/v1/posts/{post_id}", headers=auth).status_code == 204
    on_hub_post = _insert_comment(_hub_post(ada["user"]["id"]), ada["user"]["id"])

    for comment_id in (on_deleted_post, on_hub_post):
        url = f"/v1/comments/{comment_id}"
        assert _error(client.get(url, headers=auth), 404) == "COMMENT_NOT_FOUND"
        edit = client.patch(url, headers=auth, json={"body": "Edited"})
        assert _error(edit, 404) == "COMMENT_NOT_FOUND"
        assert _error(client.delete(url, headers=auth), 404) == "COMMENT_NOT_FOUND"


def test_a_reply_at_the_deepest_level_is_refused(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    post_id = _create(client, auth, "A very long chain")
    top = _comment_id(client, auth, post_id, "Depth 0")

    async def chain() -> tuple[str, str]:
        # 1000 replies, each to the one before, built in the database to keep the test fast.
        async with db_session() as session:
            ids = [UUID(top)]
            for _ in range(1000):
                reply = Comment(
                    id=uuid4(),
                    post_id=UUID(post_id),
                    parent_id=ids[-1],
                    root_id=UUID(top),
                    depth=len(ids),
                    author_id=UUID(ada["user"]["id"]),
                    body="Deeper",
                )
                session.add(reply)
                await session.flush()
                ids.append(reply.id)
            await session.commit()
            return str(ids[-2]), str(ids[-1])

    depth_999, depth_1000 = asyncio.run(chain())

    assert _comment(client, auth, post_id, "Fits", parent_id=depth_999).status_code == 201
    too_deep = _comment(client, auth, post_id, "Too deep", parent_id=depth_1000)
    assert _error(too_deep, 422) == "MAX_DEPTH_EXCEEDED"


def test_a_comment_delete_locks_the_post_before_the_comment(client: TestClient, sign_in) -> None:
    # A reply locks the post, then its parent. The delete's count trigger updates the post, so
    # a delete that locked the comment first could deadlock with a reply to that comment.
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    post_id = _create(client, auth, "Lock order")
    comment_id = _comment_id(client, auth, post_id, "To delete")

    async def run() -> int:
        async with db_session() as holder:
            await holder.execute(
                text("SELECT id FROM posts WHERE id = :id FOR UPDATE"), {"id": post_id}
            )
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
                pending = asyncio.create_task(
                    http.delete(f"/v1/comments/{comment_id}", headers=auth)
                )
                async with db_session() as probe:
                    for _ in range(200):
                        waiting = await probe.scalar(
                            text(
                                "SELECT count(*) FROM pg_stat_activity"
                                " WHERE wait_event_type = 'Lock'"
                            )
                        )
                        if waiting or pending.done():
                            break
                        await asyncio.sleep(0.02)
                    # While the delete waits for the post, nobody holds the comment.
                    await probe.execute(
                        text("SELECT id FROM comments WHERE id = :id FOR UPDATE NOWAIT"),
                        {"id": comment_id},
                    )
                    await probe.rollback()
                await holder.rollback()
                return (await pending).status_code

    assert asyncio.run(run()) == 204


def test_a_comment_that_waits_on_a_post_delete_answers_404(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    post_id = _create(client, auth, "Racing")

    resp = _while_a_delete_is_uncommitted(
        post_id,
        ada["user"]["id"],
        lambda http: http.post(
            f"/v1/posts/{post_id}/comments", headers=auth, json={"body": "Too late"}
        ),
    )

    assert _error(resp, 404) == "POST_NOT_FOUND"


def test_comment_routes_need_sign_in(client: TestClient) -> None:
    some_id = uuid4()
    assert client.post(f"/v1/posts/{some_id}/comments", json={"body": "Hi"}).status_code == 401
    assert client.get(f"/v1/comments/{some_id}").status_code == 401
    assert client.patch(f"/v1/comments/{some_id}", json={"body": "Hi"}).status_code == 401
    assert client.delete(f"/v1/comments/{some_id}").status_code == 401
