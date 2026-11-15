"""A feed post when a hub moves forward a phase.

Why: docs/decisions/2026-11-15-hub-milestone-posts.md
"""

from io import BytesIO
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, update

from app import config
from app.models import Hub, Idea, Post, PostType, User
from tests.hub_support import auth, make_hub, make_user, run


def confirm(client: TestClient, hub: Hub, owner: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/team/confirm", headers=auth(owner))


def move(client: TestClient, hub: Hub, owner: User, phase: str) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/phase", headers=auth(owner), json={"phase": phase})


def milestones(client: TestClient, viewer: User, hub: Hub) -> list[dict[str, Any]]:
    page = client.get("/v1/posts", headers=auth(viewer), params={"type": "hub_milestone"})
    assert page.status_code == 200, page.text
    return [post for post in page.json()["data"] if post["milestone"]["hub_id"] == str(hub.id)]


def count_posts(hub: Hub) -> int:
    async def work(session):
        return await session.scalar(
            select(func.count()).select_from(Post).where(Post.hub_id == hub.id)
        )

    return run(work)


def idea_text(hub: Hub) -> tuple[str, str]:
    async def work(session):
        idea = await session.get(Idea, hub.idea_id)
        return idea.title, idea.summary

    return run(work)


def test_confirming_and_each_forward_move_post_one_milestone(client: TestClient) -> None:
    owner, reader = make_user(), make_user()
    hub = make_hub(owner)

    assert confirm(client, hub, owner).status_code == 200
    assert move(client, hub, owner, "design").status_code == 200

    posts = milestones(client, reader, hub)
    assert [post["milestone"]["phase"] for post in posts] == ["design", "brainstorm"]
    newest = posts[0]
    assert newest["type"] == "hub_milestone"
    assert newest["author"]["username"] == owner.username
    assert newest["milestone"]["hub_name"] == hub.name
    assert newest["body"] == f"{hub.name} moved to Design and architecture."
    assert newest["topics"] == []
    title, summary = idea_text(hub)
    for post in posts:
        assert title not in post["body"] and summary not in post["body"]
        assert post["title"] is None


def test_moving_back_posts_nothing(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)
    move(client, hub, owner, "design")

    assert move(client, hub, owner, "brainstorm").status_code == 200
    assert count_posts(hub) == 2
    assert move(client, hub, owner, "design").status_code == 200
    assert count_posts(hub) == 3


def test_a_refused_move_posts_nothing(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)

    assert move(client, hub, owner, "build").status_code == 409  # not one step
    assert move(client, hub, member, "design").status_code == 403
    assert confirm(client, hub, owner).status_code == 409
    assert count_posts(hub) == 1


def test_milestones_show_in_the_feed_and_follow_a_rename(client: TestClient) -> None:
    owner, reader = make_user(), make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)

    feed = client.get("/v1/feed", headers=auth(reader)).json()["data"]
    assert any(post["milestone"] and post["milestone"]["hub_id"] == str(hub.id) for post in feed)
    ordinary = [post for post in feed if post["type"] != "hub_milestone"]
    assert all(post["milestone"] is None for post in ordinary)

    async def rename(session):
        await session.execute(update(Hub).where(Hub.id == hub.id).values(name="Market Day Hub"))
        await session.commit()

    run(rename)
    assert milestones(client, reader, hub)[0]["milestone"]["hub_name"] == "Market Day Hub"


def _png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_people_cannot_post_or_edit_a_milestone(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # storage configured, so the upload reaches the milestone check
    monkeypatch.setattr(config, "UPLOADS_S3_BUCKET", "test-images")
    monkeypatch.setattr(config, "UPLOADS_PUBLIC_BASE_URL", "https://images.example.test")
    owner = make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)
    post = milestones(client, owner, hub)[0]

    made = client.post(
        "/v1/posts", headers=auth(owner), json={"type": "hub_milestone", "body": "We shipped"}
    )
    assert made.status_code == 422
    assert made.json()["detail"]["code"] == "HUB_MILESTONE_NOT_SUPPORTED"
    edit = client.patch(f"/v1/posts/{post['id']}", headers=auth(owner), json={"body": "Other"})
    assert edit.status_code == 409
    assert edit.json()["detail"]["code"] == "MILESTONE_NOT_EDITABLE"
    picture = client.post(
        "/v1/uploads",
        headers=auth(owner),
        data={"post_id": post["id"]},
        files={"file": ("a.png", _png(), "image/png")},
    )
    assert picture.status_code == 409
    assert picture.json()["detail"]["code"] == "MILESTONE_NOT_EDITABLE"
    assert client.delete(f"/v1/posts/{post['id']}", headers=auth(owner)).status_code == 204
    assert milestones(client, owner, hub) == []


def test_a_demo_hubs_milestones_stay_in_the_demo(client: TestClient) -> None:
    owner, real_reader = make_user(), make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)

    async def make_demo(session):
        await session.execute(update(User).where(User.id == owner.id).values(is_demo=True))
        await session.commit()

    run(make_demo)
    assert milestones(client, real_reader, hub) == []
    assert count_posts(hub) == 1


def test_a_post_type_filter_of_hub_milestone_returns_only_milestones(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    confirm(client, hub, owner)
    client.post("/v1/posts", headers=auth(owner), json={"body": "An ordinary post from Accra"})

    page = client.get("/v1/posts", headers=auth(owner), params={"type": "hub_milestone"})
    assert page.status_code == 200
    assert {post["type"] for post in page.json()["data"]} == {PostType.HUB_MILESTONE.value}
