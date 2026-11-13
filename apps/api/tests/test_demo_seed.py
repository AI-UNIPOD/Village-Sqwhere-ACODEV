import asyncio

import pytest
from fastapi.testclient import TestClient

from app import config, database
from app.demo_seed import PEOPLE, main, seed
from tests.conftest import test_async_session as db_session


def _seed() -> bool:
    async def go() -> bool:
        async with db_session() as session:
            return await seed(session)

    return asyncio.run(go())


@pytest.fixture
def visitor(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Signed in to the seeded demo, the way the landing page's button does it."""
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    _seed()
    signed_in = client.post("/v1/auth/demo")
    assert signed_in.status_code == 200, signed_in.text
    return {"Authorization": f"Bearer {signed_in.json()['data']['access_token']}"}


def test_every_demo_screen_has_something_to_show(client: TestClient, visitor: dict) -> None:
    def data(url: str, **params) -> list | dict:
        resp = client.get(url, headers=visitor, params=params)
        assert resp.status_code == 200, (url, resp.text)
        return resp.json()["data"]

    me = data("/v1/me")
    assert me["is_demo"] is True
    assert me["roles"][0]["verified_at"] is not None and me["technologies"]

    feed = data("/v1/feed", limit=50)
    assert len(feed) >= 10
    assert {post["type"] for post in feed} >= {"rfc", "question", "oss_release"}
    assert any(post["link_url"] for post in feed)
    assert any("é" in post["body"] for post in feed)  # some French
    assert len(data("/v1/me/saved-posts")) == 2

    rfc = next(post for post in feed if post["type"] == "rfc")
    top = data(f"/v1/posts/{rfc['id']}/comments")[0]
    thread = data(f"/v1/comments/{top['id']}/thread")
    assert max(comment["depth"] for comment in thread) >= 3
    deleted = [comment for comment in thread if comment["deleted"]]
    assert deleted and deleted[0]["reply_count"] > 0

    mine = data("/v1/me/ideas")
    assert {idea["status"] for idea in mine} >= {"draft", "open"}
    payouts = next(idea for idea in mine if idea["status"] == "open")
    assert data(f"/v1/me/ideas/{payouts['id']}/matches")
    open_ideas = data("/v1/ideas", limit=50)

    assert len(data("/v1/me/hubs")) == 2
    assert len(data("/v1/me/hubs", status="invited")) == 1
    own_hub = next(idea["hub_id"] for idea in open_ideas if idea["id"] == payouts["id"])
    team = data(f"/v1/hubs/{own_hub}/members")
    assert {member["status"] for member in team} == {"active", "requested"}
    assert data("/v1/reviews/verifications")


def test_running_the_seed_again_rewrites_only_the_feed(client: TestClient, visitor: dict) -> None:
    seeded = {username for username, _, _ in PEOPLE.values()}

    def seeded_posts() -> set[str]:
        feed = client.get("/v1/feed", headers=visitor, params={"limit": 50}).json()["data"]
        return {post["id"] for post in feed if post["author"]["username"] in seeded}

    hubs = client.get("/v1/me/hubs", headers=visitor).json()["data"]
    before = seeded_posts()

    assert _seed() is False

    assert client.get("/v1/me/hubs", headers=visitor).json()["data"] == hubs
    after = seeded_posts()
    assert len(after) == len(before) == 12
    assert after.isdisjoint(before)


def test_the_script_writes_nothing_where_the_demo_is_off(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def no_database():
        raise AssertionError("the script opened the database with the demo off")

    monkeypatch.setattr(config, "DEMO_ENABLED", False)
    monkeypatch.setattr(database, "async_session", no_database)

    assert asyncio.run(main()) == 1
    assert capsys.readouterr().err.strip() == (
        "The demo is off here (DEMO_ENABLED is not true), so nothing was written."
    )


def test_the_script_seeds_where_the_demo_is_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    monkeypatch.setattr(database, "async_session", db_session)

    assert asyncio.run(main()) == 0
