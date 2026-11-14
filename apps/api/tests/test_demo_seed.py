import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update

from app import config, database
from app.api.v1.auth import DEMO_ACCOUNT_ID
from app.demo_seed import OWN_HUB, PEOPLE, main, seed
from app.models import Hub, HubNote, HubPhaseMove, HubPiece, HubPieceLink, User
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
    assert me["is_verified"] is True
    assert me["roles"][0]["verified_at"] is not None and me["technologies"]

    feed = data("/v1/feed", limit=50)
    assert len(feed) >= 10
    seeded = {username for username, _, _ in PEOPLE.values()}
    authors = [post["author"] for post in feed if post["author"]["username"] in seeded]
    assert authors and all(author["is_verified"] for author in authors)  # the Green Tick
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


def _countries() -> dict[str, str | None]:
    async def go() -> dict[str, str | None]:
        async with db_session() as session:
            rows = await session.execute(
                select(User.username, User.country_code).where(
                    User.username.in_([username for username, _, _ in PEOPLE.values()])
                )
            )
            return dict(rows.all())

    return asyncio.run(go())


def _own_hub(client: TestClient, visitor: dict) -> dict:
    hubs = client.get("/v1/me/hubs", headers=visitor).json()["data"]
    return next(hub for hub in hubs if hub["name"] == OWN_HUB)


def _unstart_own_hub() -> None:
    """A demo world seeded before hubs had phases."""

    async def go() -> None:
        async with db_session() as session:
            await session.execute(
                update(Hub)
                .where(Hub.name == OWN_HUB, Hub.owner_id == DEMO_ACCOUNT_ID)
                .values(phase=None, team_confirmed_at=None)
            )
            await session.commit()

    asyncio.run(go())


def _logged_moves(hub_id: str) -> int:
    async def go() -> int:
        async with db_session() as session:
            return await session.scalar(
                select(func.count()).select_from(HubPhaseMove).where(HubPhaseMove.hub_id == hub_id)
            )

    return asyncio.run(go())


def test_the_seed_gives_each_person_the_country_in_their_bio(
    client: TestClient, visitor: dict
) -> None:
    assert client.get("/v1/me", headers=visitor).json()["data"]["country_code"] == "NG"
    assert _countries() == {
        "olaoluwa_demo": "NG",
        "aminata_ndiaye": "SN",
        "kwabena_owusu": "GH",
        "danladi_kabir": "NG",
        "wanjiru_kamau": "KE",
        "tendai_moyo": "ZW",
    }


def test_running_the_seed_again_sets_countries_a_world_made_without_them_lacks(
    visitor: dict,
) -> None:
    async def clear() -> None:
        async with db_session() as session:
            await session.execute(update(User).where(User.is_demo).values(country_code=None))
            await session.commit()

    asyncio.run(clear())
    assert set(_countries().values()) == {None}

    assert _seed() is False

    assert _countries()["aminata_ndiaye"] == "SN" and None not in _countries().values()


def test_the_demo_hub_is_in_build_after_a_run_and_after_a_rerun(
    client: TestClient, visitor: dict
) -> None:
    def states() -> list[str]:
        card = _own_hub(client, visitor)
        assert card["phase"] == "build" and card["team_confirmed_at"] is not None
        return [step["state"] for step in card["phases"]]

    assert states() == ["done", "done", "in_progress", "not_started"]

    _unstart_own_hub()
    assert _own_hub(client, visitor)["phase"] is None
    _seed()
    assert states() == ["done", "done", "in_progress", "not_started"]

    # a hub that already has a phase is left alone, so a third run logs nothing new
    hub_id = _own_hub(client, visitor)["id"]
    logged = _logged_moves(hub_id)
    _seed()
    assert _logged_moves(hub_id) == logged


def test_the_demo_account_cannot_confirm_or_move_a_hub(client: TestClient, visitor: dict) -> None:
    hub_id = _own_hub(client, visitor)["id"]

    for resp in (
        client.post(f"/v1/hubs/{hub_id}/team/confirm", headers=visitor),
        client.post(f"/v1/hubs/{hub_id}/phase", headers=visitor, json={"phase": "review"}),
    ):
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "DEMO_READ_ONLY"
    assert _own_hub(client, visitor)["phase"] == "build"


def _hub_notes(client: TestClient, visitor: dict) -> list[dict]:
    resp = client.get(f"/v1/hubs/{_own_hub(client, visitor)['id']}/notes", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_the_demo_hub_has_six_brainstorm_notes_the_visitor_can_read_but_not_change(
    client: TestClient, visitor: dict
) -> None:
    hub_id = _own_hub(client, visitor)["id"]
    notes = _hub_notes(client, visitor)

    assert len(notes) == 6
    members = client.get(f"/v1/hubs/{hub_id}/members", headers=visitor).json()["data"]
    active = {m["user"]["id"] for m in members if m["status"] == "active"}
    assert {note["author"]["id"] for note in notes} == active
    now = datetime.now(UTC)
    times = [datetime.fromisoformat(note["created_at"]) for note in notes]
    assert times == sorted(times)
    assert all(now - timedelta(days=9) < moment < now - timedelta(days=6) for moment in times)
    assert any("é" in note["body"] for note in notes)  # some French
    assert all(note["can_delete"] is False for note in notes)  # the hub is in build

    for resp in (
        client.post(f"/v1/hubs/{hub_id}/notes", headers=visitor, json={"body": "Hello"}),
        client.delete(f"/v1/hubs/{hub_id}/notes/{notes[0]['id']}", headers=visitor),
    ):
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "DEMO_READ_ONLY"
    assert _hub_notes(client, visitor) == notes


def test_a_rerun_adds_the_notes_only_when_the_hub_has_none(
    client: TestClient, visitor: dict
) -> None:
    notes = _hub_notes(client, visitor)
    assert len(notes) == 6

    _seed()
    assert _hub_notes(client, visitor) == notes

    async def clear() -> None:
        async with db_session() as session:
            await session.execute(
                delete(HubNote).where(HubNote.hub_id == _own_hub(client, visitor)["id"])
            )
            await session.commit()

    asyncio.run(clear())
    assert _hub_notes(client, visitor) == []
    _seed()
    assert [note["body"] for note in _hub_notes(client, visitor)] == [n["body"] for n in notes]


def _hub_design(client: TestClient, visitor: dict) -> dict:
    resp = client.get(f"/v1/hubs/{_own_hub(client, visitor)['id']}/design", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_the_demo_hub_has_a_design_sketch_the_visitor_can_read_but_not_change(
    client: TestClient, visitor: dict
) -> None:
    hub_id = _own_hub(client, visitor)["id"]
    sketch = _hub_design(client, visitor)
    pieces, links = sketch["pieces"], sketch["links"]

    assert len(pieces) == 5 and len(links) == 6
    members = client.get(f"/v1/hubs/{hub_id}/members", headers=visitor).json()["data"]
    active = {m["user"]["id"] for m in members if m["status"] == "active"}
    assert {item["created_by"]["id"] for item in pieces + links} == active
    ends = {piece["id"] for piece in pieces}
    assert all({link["from_piece_id"], link["to_piece_id"]} <= ends for link in links)
    assert all(link["label"] for link in links)
    now = datetime.now(UTC)
    for items in (pieces, links):
        times = [datetime.fromisoformat(item["created_at"]) for item in items]
        assert times == sorted(times)
        assert all(now - timedelta(days=6) < moment < now - timedelta(days=3) for moment in times)
    assert all(item["can_delete"] is False for item in pieces + links)  # the hub is in build

    for resp in (
        client.post(f"/v1/hubs/{hub_id}/pieces", headers=visitor, json={"name": "Hello"}),
        client.delete(f"/v1/hubs/{hub_id}/pieces/{pieces[0]['id']}", headers=visitor),
        client.delete(f"/v1/hubs/{hub_id}/links/{links[0]['id']}", headers=visitor),
    ):
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "DEMO_READ_ONLY"
    assert _hub_design(client, visitor) == sketch


def test_a_rerun_adds_the_sketch_only_when_the_hub_has_no_pieces(
    client: TestClient, visitor: dict
) -> None:
    sketch = _hub_design(client, visitor)

    _seed()
    assert _hub_design(client, visitor) == sketch

    async def clear() -> None:
        async with db_session() as session:
            hub_id = _own_hub(client, visitor)["id"]
            await session.execute(delete(HubPieceLink).where(HubPieceLink.hub_id == hub_id))
            await session.execute(delete(HubPiece).where(HubPiece.hub_id == hub_id))
            await session.commit()

    asyncio.run(clear())
    assert _hub_design(client, visitor) == {"pieces": [], "links": []}
    _seed()
    again = _hub_design(client, visitor)
    assert [piece["name"] for piece in again["pieces"]] == [p["name"] for p in sketch["pieces"]]
    assert [link["label"] for link in again["links"]] == [k["label"] for k in sketch["links"]]


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
