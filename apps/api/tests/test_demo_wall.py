"""The demo wall: demo accounts see only demo content, and nobody else ever sees it.

Content is made by real accounts first, then its author is moved into the demo, because demo
accounts cannot write through the API.
"""

from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, update

from app import config
from app.models import IdeaRoleNeed, Role, User, UserRole, VerificationSession, VerificationStatus
from tests.hub_support import auth, make_hub, make_user, run
from tests.test_matches import hold, new_idea, verify


def to_demo(*users: User) -> None:
    async def work(session):
        await session.execute(
            update(User).where(User.id.in_([user.id for user in users])).values(is_demo=True)
        )
        await session.commit()

    run(work)


def post_by(client: TestClient, author: User) -> str:
    made = client.post("/v1/posts", headers=auth(author), json={"body": "Hello from Dakar"})
    assert made.status_code == 201, made.text
    post_id = made.json()["data"]["id"]
    commented = client.post(
        f"/v1/posts/{post_id}/comments", headers=auth(author), json={"body": "First"}
    )
    assert commented.status_code == 201, commented.text
    return post_id


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


@pytest.fixture(autouse=True)
def demo_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)


@pytest.fixture
def role() -> Generator[Role]:
    """An active role only this test uses, removed afterwards with everything that uses it."""

    async def make(session):
        name = f"test-wall-{uuid4().hex[:12]}"
        made = Role(slug=name, name=name.replace("-", " ").title())
        session.add(made)
        await session.commit()
        return made

    made = run(make)
    yield made

    async def clean(session):
        for model in (VerificationSession, IdeaRoleNeed, UserRole):
            await session.execute(delete(model).where(model.role_id == made.id))
        await session.execute(delete(Role).where(Role.id == made.id))
        await session.commit()

    run(clean)


def test_posts_and_comments_stay_on_their_side(client: TestClient) -> None:
    demo_author, real_author, demo_viewer, real_viewer = (make_user() for _ in range(4))
    demo_post, real_post = post_by(client, demo_author), post_by(client, real_author)
    to_demo(demo_author, demo_viewer)

    for viewer, mine, theirs in (
        (demo_viewer, demo_post, real_post),
        (real_viewer, real_post, demo_post),
    ):
        listed = ids(client.get("/v1/posts", headers=auth(viewer), params={"limit": 50}))
        assert mine in listed and theirs not in listed
        feed = ids(client.get("/v1/feed", headers=auth(viewer), params={"limit": 50}))
        assert theirs not in feed
        assert client.get(f"/v1/posts/{mine}", headers=auth(viewer)).status_code == 200
        for url in (f"/v1/posts/{theirs}", f"/v1/posts/{theirs}/comments"):
            assert client.get(url, headers=auth(viewer)).status_code == 404, url
        comment = client.get(f"/v1/posts/{mine}/comments", headers=auth(viewer)).json()
        comment_id = comment["data"][0]["id"]
        assert client.get(f"/v1/comments/{comment_id}", headers=auth(viewer)).status_code == 200
    # a real developer pasting a demo comment's address
    demo_comment = client.get(f"/v1/posts/{demo_post}/comments", headers=auth(demo_viewer))
    hidden = demo_comment.json()["data"][0]["id"]
    for url in (f"/v1/comments/{hidden}", f"/v1/comments/{hidden}/replies"):
        assert client.get(url, headers=auth(real_viewer)).status_code == 404, url
    by_name = client.get(
        "/v1/posts", headers=auth(real_viewer), params={"author": demo_author.username}
    )
    assert ids(by_name) == []


def test_ideas_and_hubs_stay_on_their_side(client: TestClient) -> None:
    demo_owner, real_owner, demo_viewer, real_viewer = (make_user() for _ in range(4))
    demo_hub, real_hub = make_hub(demo_owner), make_hub(real_owner)
    to_demo(demo_owner, demo_viewer)

    for viewer, mine, theirs in (
        (demo_viewer, demo_hub, real_hub),
        (real_viewer, real_hub, demo_hub),
    ):
        listed = ids(client.get("/v1/ideas", headers=auth(viewer), params={"limit": 50}))
        assert str(mine.idea_id) in listed and str(theirs.idea_id) not in listed
        assert client.get(f"/v1/ideas/{mine.idea_id}", headers=auth(viewer)).status_code == 200
        assert client.get(f"/v1/hubs/{mine.id}", headers=auth(viewer)).status_code == 200
        for url in (
            f"/v1/ideas/{theirs.idea_id}",
            f"/v1/hubs/{theirs.id}",
            f"/v1/hubs/{theirs.id}/agreement",
        ):
            assert client.get(url, headers=auth(viewer)).status_code == 404, url

    asked = client.post(f"/v1/hubs/{demo_hub.id}/join-requests", headers=auth(real_viewer))
    assert asked.status_code == 404
    invited = client.post(
        f"/v1/hubs/{real_hub.id}/invitations",
        headers=auth(real_owner),
        json={"username": demo_viewer.username},
    )
    assert (invited.status_code, invited.json()["detail"]["code"]) == (404, "USER_NOT_FOUND")


def test_matching_stays_on_its_side(client: TestClient, role: Role) -> None:
    demo_owner, real_owner, demo_dev, real_dev = (make_user() for _ in range(4))
    demo_idea, real_idea = new_idea(client, demo_owner, role), new_idea(client, real_owner, role)
    verify(demo_dev, role)
    verify(real_dev, role)
    to_demo(demo_owner, demo_dev)

    for developer, idea in ((demo_dev, demo_idea), (real_dev, real_idea)):
        matched = client.get("/v1/me/matches", headers=auth(developer)).json()["data"]
        assert [item["idea"]["id"] for item in matched] == [idea]
    people = client.get(f"/v1/me/ideas/{real_idea}/matches", headers=auth(real_owner))
    assert ids(people) == [str(real_dev.id)]


def test_the_review_queue_stays_on_its_side(client: TestClient, role: Role) -> None:
    demo_applicant, real_applicant, demo_reviewer, real_reviewer = (make_user() for _ in range(4))
    verify(demo_reviewer, role)
    verify(real_reviewer, role)
    sessions: dict[str, UUID] = {}
    for name, applicant in (("demo", demo_applicant), ("real", real_applicant)):
        hold(applicant, role, verified_at=None)

        async def work(session, applicant=applicant):
            attempt = VerificationSession(user_id=applicant.id, role_id=role.id)
            session.add(attempt)
            await session.commit()
            # a new attempt always starts pending, so move it on the way the worker would
            attempt.status = VerificationStatus.AWAITING_REVIEW
            await session.commit()
            return attempt.id

        sessions[name] = run(work)
    to_demo(demo_applicant, demo_reviewer)

    for reviewer, mine, theirs in (
        (demo_reviewer, sessions["demo"], sessions["real"]),
        (real_reviewer, sessions["real"], sessions["demo"]),
    ):
        queue = ids(client.get("/v1/reviews/verifications", headers=auth(reviewer)))
        assert str(mine) in queue and str(theirs) not in queue
        hidden = client.get(f"/v1/reviews/verifications/{theirs}", headers=auth(reviewer))
        assert hidden.status_code == 404
