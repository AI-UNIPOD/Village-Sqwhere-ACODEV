import asyncio
from collections.abc import Generator
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text, update

from app.main import app
from app.models import DeletionReason, PlatformRole, Post, PostRevision, User
from tests.conftest import test_async_session as db_session


def _truncate_posts() -> None:
    async def _clean() -> None:
        async with db_session() as session:
            await session.execute(
                text("TRUNCATE posts, post_topics, post_likes, saved_posts, post_revisions CASCADE")
            )
            await session.commit()

    asyncio.run(_clean())


@pytest.fixture(autouse=True)
def cleanup_posts() -> Generator[None]:
    _truncate_posts()
    try:
        yield
    finally:
        _truncate_posts()


def _set_user_role(user_id: UUID, role: PlatformRole) -> None:
    async def _set() -> None:
        async with db_session() as session:
            await session.execute(update(User).where(User.id == user_id).values(platform_role=role))
            await session.commit()

    asyncio.run(_set())


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Tests -----------------------------------------------------------------------------------


def test_create_and_get_post(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    ada_auth = _bearer(ada["access_token"])
    moussa_auth = _bearer(moussa["access_token"])

    create_payload = {
        "type": "general",
        "title": "Building offline apps",
        "body": "Tips for local data persistence in Africa.",
        "link_url": "https://example.com/guide",
        "topics": ["python", "react"],
    }
    create_resp = client.post("/v1/posts", headers=ada_auth, json=create_payload)
    assert create_resp.status_code == 201, create_resp.text
    post_data = create_resp.json()["data"]

    assert post_data["type"] == "general"
    assert post_data["title"] == "Building offline apps"
    assert post_data["body"] == "Tips for local data persistence in Africa."
    assert post_data["link_url"] == "https://example.com/guide"
    assert [t["slug"] for t in post_data["topics"]] == ["python", "react"]
    assert post_data["author"]["username"] == "ada-lagos"
    assert post_data["like_count"] == 0
    assert post_data["comment_count"] == 0
    assert post_data["liked_by_me"] is False
    assert post_data["saved_by_me"] is False

    post_id = post_data["id"]

    # GET by author
    get_resp = client.get(f"/v1/posts/{post_id}", headers=ada_auth)
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == post_id

    # GET by other user
    get_other = client.get(f"/v1/posts/{post_id}", headers=moussa_auth)
    assert get_other.status_code == 200
    assert get_other.json()["data"]["author"]["username"] == "ada-lagos"
    assert get_other.json()["data"]["liked_by_me"] is False
    assert get_other.json()["data"]["saved_by_me"] is False


def test_create_post_fails_with_hub_milestone(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={"type": "hub_milestone", "body": "Milestone achieved"},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == {
        "code": "HUB_MILESTONE_NOT_SUPPORTED",
        "message": "A hub posts its own milestones when its owner moves it to a new phase.",
    }


def test_create_post_fails_with_unknown_topic(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={"body": "Post body", "topics": ["python", "unknown-slug-xyz"]},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == {
        "code": "UNKNOWN_TOPIC",
        "message": "Unknown topic slug: unknown-slug-xyz",
    }


def test_create_post_fails_with_too_many_topics(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={
            "body": "Post body",
            "topics": ["python", "react", "vue", "go", "rust", "nodejs"],
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == {
        "code": "TOO_MANY_TOPICS",
        "message": "A post may have at most 5 topics",
    }


def test_create_post_with_five_topics_succeeds(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={
            "body": "Post with 5 topics",
            "topics": ["python", "react", "vue", "go", "rust"],
        },
    )
    assert resp.status_code == 201, resp.text
    topics = resp.json()["data"]["topics"]
    assert len(topics) == 5
    assert [t["slug"] for t in topics] == ["go", "python", "react", "rust", "vue"]


def test_create_post_fails_with_duplicate_topics(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={"body": "Post body", "topics": ["python", "react", "python"]},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == {
        "code": "DUPLICATE_TOPICS",
        "message": "Topics must not contain duplicates",
    }


def test_create_post_fails_with_whitespace_body(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post("/v1/posts", headers=auth, json={"body": "   "})
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_create_post_rfc_without_title_fails(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post("/v1/posts", headers=auth, json={"type": "rfc", "body": "RFC Body"})
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_create_post_stray_field_fails(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    resp = client.post(
        "/v1/posts",
        headers=auth,
        json={"body": "Post body", "hub_id": str(uuid4())},
    )
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_patch_post_by_author_succeeds_and_creates_revision(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])

    create_resp = client.post(
        "/v1/posts",
        headers=auth,
        json={
            "title": "Original Title",
            "body": "Original Body",
            "link_url": "https://example.com/v1",
        },
    )
    post_id = create_resp.json()["data"]["id"]

    patch_resp = client.patch(
        f"/v1/posts/{post_id}",
        headers=auth,
        json={"title": "Updated Title", "body": "Updated Body"},
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched_data = patch_resp.json()["data"]
    assert patched_data["title"] == "Updated Title"
    assert patched_data["body"] == "Updated Body"
    assert patched_data["link_url"] == "https://example.com/v1"
    assert patched_data["edited_at"] is not None

    async def _get_revisions() -> list[PostRevision]:
        async with db_session() as session:
            rows = (
                (
                    await session.execute(
                        select(PostRevision).where(PostRevision.post_id == UUID(post_id))
                    )
                )
                .scalars()
                .all()
            )
            return list(rows)

    revisions = asyncio.run(_get_revisions())
    assert len(revisions) == 1
    assert revisions[0].title == "Original Title"
    assert revisions[0].body == "Original Body"
    assert revisions[0].link_url == "https://example.com/v1"


def test_patch_post_by_non_author_returns_403(client: TestClient, sign_in) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])

    create_resp = client.post("/v1/posts", headers=ada_auth, json={"body": "Ada's post"})
    post_id = create_resp.json()["data"]["id"]

    patch_resp = client.patch(
        f"/v1/posts/{post_id}",
        headers=moussa_auth,
        json={"body": "Hacked body"},
    )
    assert patch_resp.status_code == 403
    assert patch_resp.json()["detail"] == {
        "code": "NOT_POST_AUTHOR",
        "message": "Only the author may edit this post",
    }


def test_patch_post_empty_update_returns_422(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    create_resp = client.post("/v1/posts", headers=auth, json={"body": "Body"})
    post_id = create_resp.json()["data"]["id"]

    patch_resp = client.patch(f"/v1/posts/{post_id}", headers=auth, json={})
    assert patch_resp.status_code == 422
    assert patch_resp.json()["detail"] == {
        "code": "EMPTY_UPDATE",
        "message": "At least one field must be provided",
    }


def test_patch_post_clearing_title(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])

    # Non-RFC post with title can clear title
    create_gen = client.post(
        "/v1/posts",
        headers=auth,
        json={"title": "General Title", "body": "General Body"},
    )
    gen_id = create_gen.json()["data"]["id"]

    patch_gen = client.patch(f"/v1/posts/{gen_id}", headers=auth, json={"title": None})
    assert patch_gen.status_code == 200
    assert patch_gen.json()["data"]["title"] is None

    # RFC post cannot clear title
    create_rfc = client.post(
        "/v1/posts",
        headers=auth,
        json={"type": "rfc", "title": "RFC Title", "body": "RFC Body"},
    )
    rfc_id = create_rfc.json()["data"]["id"]

    patch_rfc = client.patch(f"/v1/posts/{rfc_id}", headers=auth, json={"title": None})
    assert patch_rfc.status_code == 422
    assert patch_rfc.json()["detail"] == {
        "code": "RFC_TITLE_REQUIRED",
        "message": "RFC posts must have a title",
    }


def test_patch_post_body_null_returns_422(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    create_resp = client.post("/v1/posts", headers=auth, json={"body": "Body"})
    post_id = create_resp.json()["data"]["id"]

    patch_resp = client.patch(f"/v1/posts/{post_id}", headers=auth, json={"body": None})
    assert patch_resp.status_code == 422
    assert isinstance(patch_resp.json()["detail"], list)


def test_delete_post_by_author(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    ada_auth = _bearer(ada["access_token"])

    create_resp = client.post("/v1/posts", headers=ada_auth, json={"body": "Post to delete"})
    post_id = create_resp.json()["data"]["id"]

    del_resp = client.delete(f"/v1/posts/{post_id}", headers=ada_auth)
    assert del_resp.status_code == 204
    assert del_resp.text == ""

    # Verify database record
    async def _get_post() -> Post:
        async with db_session() as session:
            return (
                await session.execute(select(Post).where(Post.id == UUID(post_id)))
            ).scalar_one()

    db_post = asyncio.run(_get_post())
    assert db_post.deleted_at is not None
    assert db_post.deletion_reason == "author"
    assert str(db_post.deleted_by) == ada["user"]["id"]

    # GET after delete is 404
    get_resp = client.get(f"/v1/posts/{post_id}", headers=ada_auth)
    assert get_resp.status_code == 404
    assert get_resp.json()["detail"]["code"] == "POST_NOT_FOUND"

    # PATCH after delete is 404
    patch_resp = client.patch(f"/v1/posts/{post_id}", headers=ada_auth, json={"body": "New body"})
    assert patch_resp.status_code == 404
    assert patch_resp.json()["detail"]["code"] == "POST_NOT_FOUND"


def test_delete_post_by_moderator(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    ada_auth = _bearer(ada["access_token"])
    moussa_auth = _bearer(moussa["access_token"])
    moussa_id = UUID(moussa["user"]["id"])

    create_resp = client.post("/v1/posts", headers=ada_auth, json={"body": "Ada post"})
    post_id = create_resp.json()["data"]["id"]

    # Moussa as normal member fails 403
    del_member = client.delete(f"/v1/posts/{post_id}", headers=moussa_auth)
    assert del_member.status_code == 403
    assert del_member.json()["detail"]["code"] == "NOT_POST_AUTHOR"

    # Promote Moussa to moderator
    _set_user_role(moussa_id, PlatformRole.MODERATOR)
    try:
        del_mod = client.delete(f"/v1/posts/{post_id}", headers=moussa_auth)
        assert del_mod.status_code == 204

        async def _get_post() -> Post:
            async with db_session() as session:
                return (
                    await session.execute(select(Post).where(Post.id == UUID(post_id)))
                ).scalar_one()

        db_post = asyncio.run(_get_post())
        assert db_post.deleted_at is not None
        assert db_post.deletion_reason == "moderator"
        assert db_post.deleted_by == moussa_id
    finally:
        _set_user_role(moussa_id, PlatformRole.MEMBER)


def test_delete_post_by_author_who_is_also_moderator(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    ada_auth = _bearer(ada["access_token"])
    ada_id = UUID(ada["user"]["id"])

    _set_user_role(ada_id, PlatformRole.MODERATOR)
    try:
        create_resp = client.post("/v1/posts", headers=ada_auth, json={"body": "Mod author post"})
        post_id = create_resp.json()["data"]["id"]

        del_resp = client.delete(f"/v1/posts/{post_id}", headers=ada_auth)
        assert del_resp.status_code == 204

        async def _get_post() -> Post:
            async with db_session() as session:
                return (
                    await session.execute(select(Post).where(Post.id == UUID(post_id)))
                ).scalar_one()

        db_post = asyncio.run(_get_post())
        # Author reason wins when author is moderator
        assert db_post.deletion_reason == "author"
    finally:
        _set_user_role(ada_id, PlatformRole.MEMBER)


def test_posts_endpoints_require_authentication(client: TestClient) -> None:
    dummy_id = str(uuid4())
    assert client.get(f"/v1/posts/{dummy_id}").status_code == 401
    assert client.post("/v1/posts", json={"body": "test"}).status_code == 401
    assert client.patch(f"/v1/posts/{dummy_id}", json={"body": "test"}).status_code == 401
    assert client.delete(f"/v1/posts/{dummy_id}").status_code == 401


def test_get_or_delete_missing_post_returns_404(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    missing_id = str(uuid4())

    get_resp = client.get(f"/v1/posts/{missing_id}", headers=auth)
    assert get_resp.status_code == 404
    assert get_resp.json()["detail"]["code"] == "POST_NOT_FOUND"

    del_resp = client.delete(f"/v1/posts/{missing_id}", headers=auth)
    assert del_resp.status_code == 404
    assert del_resp.json()["detail"]["code"] == "POST_NOT_FOUND"


def test_link_url_is_capped_at_2048_characters(client: TestClient, sign_in) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    longest = "https://example.com/" + "a" * (2048 - len("https://example.com/"))

    post_id = _create(client, ada_auth, "A long link", link_url=longest)
    too_long = client.post(
        "/v1/posts", headers=ada_auth, json={"body": "Too long", "link_url": longest + "a"}
    )
    patched = client.patch(
        f"/v1/posts/{post_id}", headers=ada_auth, json={"link_url": longest + "a"}
    )

    assert too_long.status_code == 422
    assert patched.status_code == 422


def _while_a_delete_is_uncommitted(post_id: str, deleter_id: str, request) -> httpx.Response:
    """Send a request while another transaction has deleted the post but not yet committed,
    then commit that delete and return the request's answer."""

    async def run() -> httpx.Response:
        async with db_session() as deleting:
            await deleting.execute(
                update(Post)
                .where(Post.id == UUID(post_id))
                .values(
                    deleted_at=func.now(),
                    deleted_by=UUID(deleter_id),
                    deletion_reason=DeletionReason.AUTHOR,
                )
            )
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
                pending = asyncio.create_task(request(http))
                async with db_session() as watcher:
                    for _ in range(200):
                        waiting = await watcher.scalar(
                            text(
                                "SELECT count(*) FROM pg_stat_activity"
                                " WHERE wait_event_type = 'Lock'"
                            )
                        )
                        if waiting or pending.done():
                            break
                        await asyncio.sleep(0.02)
                await deleting.commit()
                return await pending

    return asyncio.run(run())


def test_an_edit_that_waits_on_a_delete_answers_404(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    ada_auth = _bearer(ada["access_token"])
    post_id = _create(client, ada_auth, "Ajo savings tracker")

    resp = _while_a_delete_is_uncommitted(
        post_id,
        ada["user"]["id"],
        lambda http: http.patch(f"/v1/posts/{post_id}", headers=ada_auth, json={"body": "Edited"}),
    )

    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"]["code"] == "POST_NOT_FOUND"


def test_a_second_delete_that_waits_on_the_first_answers_404(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    moussa_id = UUID(moussa["user"]["id"])
    post_id = _create(client, _bearer(ada["access_token"]), "Ajo savings tracker")

    _set_user_role(moussa_id, PlatformRole.MODERATOR)
    try:
        resp = _while_a_delete_is_uncommitted(
            post_id,
            ada["user"]["id"],
            lambda http: http.delete(
                f"/v1/posts/{post_id}", headers=_bearer(moussa["access_token"])
            ),
        )
    finally:
        _set_user_role(moussa_id, PlatformRole.MEMBER)

    async def reason() -> str | None:
        async with db_session() as session:
            return await session.scalar(
                select(Post.deletion_reason).where(Post.id == UUID(post_id))
            )

    assert resp.status_code == 404, resp.text
    assert asyncio.run(reason()) == DeletionReason.AUTHOR


# --- Lists and the feed ----------------------------------------------------------------------


def _create(client: TestClient, auth: dict[str, str], body: str, **fields: object) -> str:
    resp = client.post("/v1/posts", headers=auth, json={"body": body, **fields})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["id"]


def _bodies(resp) -> list[str]:
    assert resp.status_code == 200, resp.text
    return [post["body"] for post in resp.json()["data"]]


def test_list_posts_pages_newest_first_and_hides_deleted_posts(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    auth = _bearer(ada["access_token"])
    for body in ("Lagos", "Dakar", "Nairobi"):
        _create(client, auth, body)
    gone = _create(client, auth, "Deleted")
    assert client.delete(f"/v1/posts/{gone}", headers=auth).status_code == 204

    first = client.get("/v1/posts", headers=auth, params={"limit": 2})
    assert _bodies(first) == ["Nairobi", "Dakar"]
    assert first.json()["next_offset"] == 2
    last = client.get("/v1/posts", headers=auth, params={"limit": 2, "offset": 2})
    assert _bodies(last) == ["Lagos"]
    assert last.json()["next_offset"] is None


def test_list_posts_filters_by_type_topic_and_author(client: TestClient, sign_in) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    _create(client, ada_auth, "Ada asks", type="question", topics=["python"])
    _create(client, ada_auth, "Ada shares", topics=["rust"])
    _create(client, moussa_auth, "Moussa asks", type="question", topics=["rust"])

    def bodies(**params: str) -> list[str]:
        return _bodies(client.get("/v1/posts", headers=ada_auth, params=params))

    assert bodies(type="question") == ["Moussa asks", "Ada asks"]
    assert bodies(topic="rust") == ["Moussa asks", "Ada shares"]
    assert bodies(author="ADA-lagos") == ["Ada shares", "Ada asks"]
    assert bodies(type="question", topic="rust") == ["Moussa asks"]
    assert bodies(topic="no-such-topic") == []
    assert bodies(author="nobody-here") == []
    for bad in (
        {"type": "meme"},
        {"topic": "a" + chr(0)},
        {"author": "a" + chr(0)},
        {"offset": 10**20},
    ):
        assert client.get("/v1/posts", headers=ada_auth, params=bad).status_code == 422, bad


def test_list_posts_matches_any_of_several_topics_once(client: TestClient, sign_in) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    _create(client, ada_auth, "Python only", topics=["python"])
    _create(client, moussa_auth, "Rust only", topics=["rust"])
    _create(client, moussa_auth, "Python and Rust", topics=["python", "rust"])
    _create(client, ada_auth, "No topic")

    def bodies(*topics: str) -> list[str]:
        params = [("topic", topic) for topic in topics]
        return _bodies(client.get("/v1/posts", headers=ada_auth, params=params))

    assert bodies("rust", "python") == ["Python and Rust", "Rust only", "Python only"]
    assert bodies("python", "python") == ["Python and Rust", "Python only"]
    assert bodies("no-such-topic", "rust") == ["Python and Rust", "Rust only"]


def test_list_posts_refuses_more_than_ten_topics_or_a_malformed_one(
    client: TestClient, sign_in
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])

    too_many = [("topic", "python")] * 11
    assert client.get("/v1/posts", headers=auth, params=too_many[:10]).status_code == 200
    assert client.get("/v1/posts", headers=auth, params=too_many).status_code == 422

    malformed = [("topic", "python"), ("topic", "Not_A_Slug")]
    assert client.get("/v1/posts", headers=auth, params=malformed).status_code == 422


def test_feed_shows_my_topics_and_my_own_posts(client: TestClient, sign_in) -> None:
    ada = sign_in("github-code-ada")
    ada_auth = _bearer(ada["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    _create(client, moussa_auth, "Moussa on Python", topics=["python"])
    _create(client, moussa_auth, "Moussa on Rust", topics=["rust"])
    _create(client, ada_auth, "Ada with no topic")

    def feed_with(topics: list[str]) -> list[str]:
        resp = client.put("/v1/me/feed-topics", headers=ada_auth, json={"technologies": topics})
        assert resp.status_code == 200, resp.text
        return _bodies(client.get("/v1/feed", headers=ada_auth))

    try:
        assert feed_with([]) == ["Ada with no topic", "Moussa on Rust", "Moussa on Python"]
        assert feed_with(["python", "docker"]) == ["Ada with no topic", "Moussa on Python"]
    finally:
        feed_with([])


def test_lists_require_authentication(client: TestClient) -> None:
    assert client.get("/v1/posts").status_code == 401
    assert client.get("/v1/feed").status_code == 401


# --- Likes and saves -------------------------------------------------------------------------


def test_like_is_counted_once_per_developer_and_shown_to_each_viewer(
    client: TestClient, sign_in
) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    post_id = _create(client, moussa_auth, "Offline sync with CRDTs")

    for _ in range(2):
        assert client.put(f"/v1/posts/{post_id}/like", headers=ada_auth).status_code == 204
    ada_view = client.get(f"/v1/posts/{post_id}", headers=ada_auth).json()["data"]
    assert (ada_view["like_count"], ada_view["liked_by_me"]) == (1, True)
    moussa_view = client.get("/v1/posts", headers=moussa_auth).json()["data"][0]
    assert (moussa_view["like_count"], moussa_view["liked_by_me"]) == (1, False)

    for _ in range(2):
        assert client.delete(f"/v1/posts/{post_id}/like", headers=ada_auth).status_code == 204
    ada_view = client.get("/v1/feed", headers=ada_auth).json()["data"][0]
    assert (ada_view["like_count"], ada_view["liked_by_me"]) == (0, False)


def test_saved_posts_list_newest_save_first_for_me_only(client: TestClient, sign_in) -> None:
    ada_auth = _bearer(sign_in("github-code-ada")["access_token"])
    moussa_auth = _bearer(sign_in("github-code-moussa")["access_token"])
    older = _create(client, moussa_auth, "Older post")
    newer = _create(client, moussa_auth, "Newer post")
    gone = _create(client, moussa_auth, "Deleted later")
    unsaved = _create(client, moussa_auth, "Unsaved later")
    for post_id in (newer, older, gone, unsaved, older):
        assert client.put(f"/v1/posts/{post_id}/save", headers=ada_auth).status_code == 204
    assert client.delete(f"/v1/posts/{unsaved}/save", headers=ada_auth).status_code == 204
    assert client.delete(f"/v1/posts/{gone}", headers=moussa_auth).status_code == 204

    saved = client.get("/v1/me/saved-posts", headers=ada_auth)
    assert _bodies(saved) == ["Older post", "Newer post"]
    assert all(post["saved_by_me"] for post in saved.json()["data"])
    assert _bodies(client.get("/v1/me/saved-posts", headers=moussa_auth)) == []


def test_like_and_save_refuse_missing_and_deleted_posts(client: TestClient, sign_in) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    gone = _create(client, auth, "Soon deleted")
    assert client.delete(f"/v1/posts/{gone}", headers=auth).status_code == 204

    for post_id in (gone, str(uuid4())):
        for action in ("like", "save"):
            for method in (client.put, client.delete):
                resp = method(f"/v1/posts/{post_id}/{action}", headers=auth)
                assert resp.status_code == 404, (action, method)
                assert resp.json()["detail"]["code"] == "POST_NOT_FOUND"


def test_likes_and_saves_require_authentication(client: TestClient) -> None:
    post_id = uuid4()
    assert client.put(f"/v1/posts/{post_id}/like").status_code == 401
    assert client.delete(f"/v1/posts/{post_id}/like").status_code == 401
    assert client.put(f"/v1/posts/{post_id}/save").status_code == 401
    assert client.delete(f"/v1/posts/{post_id}/save").status_code == 401
    assert client.get("/v1/me/saved-posts").status_code == 401


def test_post_text_with_a_null_character_fails(client: TestClient, sign_in) -> None:
    # PostgreSQL text cannot hold "\x00", so without the check these answered 500.
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create(client, auth, "Clean post")
    for field, value in (
        ("title", "A\x00B"),
        ("body", "A\x00B"),
        ("link_url", "https://a.b/\x00"),
        ("topics", ["py\x00thon"]),
    ):
        created = client.post("/v1/posts", headers=auth, json={"body": "Post", field: value})
        assert created.status_code == 422, field
        if field != "topics":
            patched = client.patch(f"/v1/posts/{post_id}", headers=auth, json={field: value})
            assert patched.status_code == 422, field
