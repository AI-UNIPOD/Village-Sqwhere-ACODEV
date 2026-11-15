import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text, update

from app import config, database
from app.api.v1.auth import DEMO_ACCOUNT_ID
from app.demo_seed import (
    BRIEF,
    FOR_YOU_IDEAS,
    OWN_HUB,
    OWN_HUB_CLAIMS,
    OWN_HUB_COMMITS,
    OWN_HUB_REPOSITORY,
    PEOPLE,
    main,
    seed,
)
from app.models import (
    Hub,
    HubCommit,
    HubNote,
    HubPhaseMove,
    HubPiece,
    HubPieceLink,
    Idea,
    User,
)
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
        "uwase_mutoni": "RW",
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


def _hub_build(client: TestClient, visitor: dict) -> dict:
    resp = client.get(f"/v1/hubs/{_own_hub(client, visitor)['id']}/build", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_the_demo_hub_has_claims_a_repository_and_commits_the_visitor_can_read_not_change(
    client: TestClient, visitor: dict
) -> None:
    hub_id = _own_hub(client, visitor)["id"]
    seen = _hub_build(client, visitor)
    members = client.get(f"/v1/hubs/{hub_id}/members", headers=visitor).json()["data"]
    active = {m["user"]["id"] for m in members if m["status"] == "active"}

    # four of the five pieces are held, two by each active member, and one is left free
    pieces = seen["pieces"]
    assert len(pieces) == 5
    holders = [piece["claimed_by"]["id"] for piece in pieces if piece["claimed_by"]]
    assert len(holders) == 4 and sorted(holders) == sorted(list(active) * 2)
    assert [piece["name"] for piece in pieces if not piece["claimed_by"]] == ["Ledger database"]
    now = datetime.now(UTC)
    for piece in pieces:
        if piece["claimed_by"]:
            claimed = datetime.fromisoformat(piece["claimed_at"])
            assert now - timedelta(days=3) < claimed < now
    # the address cannot be a real repository, and eight commits by the two members
    assert seen["repository_url"] == OWN_HUB_REPOSITORY == "https://github.com/payouts_demo/payouts"
    commits = seen["commits"]
    assert len(commits) == len(OWN_HUB_COMMITS) == 8
    assert all(commit["message"] and len(commit["sha"]) == 40 for commit in commits)
    assert len({commit["sha"] for commit in commits}) == 8
    names = {m["user"]["display_name"] for m in members if m["status"] == "active"}
    assert {commit["author_name"] for commit in commits} == names
    times = [datetime.fromisoformat(commit["committed_at"]) for commit in commits]
    assert times == sorted(times, reverse=True)
    assert all(now - timedelta(days=3) < moment < now for moment in times)
    refreshed = datetime.fromisoformat(seen["commits_refreshed_at"])
    assert timedelta(minutes=50) < now - refreshed < timedelta(minutes=70)

    for resp in (
        client.post(f"/v1/hubs/{hub_id}/pieces/{pieces[0]['id']}/claim", headers=visitor),
        client.delete(f"/v1/hubs/{hub_id}/pieces/{pieces[1]['id']}/claim", headers=visitor),
        client.put(f"/v1/hubs/{hub_id}/repository", headers=visitor, json={"repository_url": None}),
        client.post(f"/v1/hubs/{hub_id}/commits/refresh", headers=visitor),
    ):
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "DEMO_READ_ONLY"
    assert _hub_build(client, visitor) == seen


def test_a_rerun_adds_claims_the_repository_and_commits_only_when_they_are_missing(
    client: TestClient, visitor: dict
) -> None:
    seen = _hub_build(client, visitor)

    _seed()
    assert _hub_build(client, visitor) == seen

    async def clear() -> None:
        async with db_session() as session:
            hub_id = _own_hub(client, visitor)["id"]
            await session.execute(delete(HubCommit).where(HubCommit.hub_id == hub_id))
            await session.execute(
                update(HubPiece)
                .where(HubPiece.hub_id == hub_id)
                .values(claimed_by=None, claimed_at=None)
            )
            await session.execute(
                update(Hub)
                .where(Hub.id == hub_id)
                .values(repository_url=None, commits_refreshed_at=None)
            )
            await session.commit()

    asyncio.run(clear())
    emptied = _hub_build(client, visitor)
    assert emptied["repository_url"] is None and emptied["commits"] == []
    assert all(piece["claimed_by"] is None for piece in emptied["pieces"])
    _seed()
    again = _hub_build(client, visitor)
    assert again["repository_url"] == OWN_HUB_REPOSITORY and len(again["commits"]) == 8
    assert [commit["message"] for commit in again["commits"]] == [
        commit["message"] for commit in seen["commits"]
    ]
    assert [(p["name"], p["claimed_by"] and p["claimed_by"]["id"]) for p in again["pieces"]] == [
        (p["name"], p["claimed_by"] and p["claimed_by"]["id"]) for p in seen["pieces"]
    ]

    # a piece that is held is left as it is, even when the seed would give it to someone else
    kwabena = next(p for p in seen["pieces"] if p["name"] == "Mobile app")["claimed_by"]["id"]

    async def hand_over() -> None:
        async with db_session() as session:
            await session.execute(
                update(HubPiece)
                .where(HubPiece.hub_id == _own_hub(client, visitor)["id"])
                .where(HubPiece.name == OWN_HUB_CLAIMS[0][2])
                .values(claimed_by=kwabena)
            )
            await session.commit()

    asyncio.run(hand_over())
    _seed()
    assert _hub_build(client, visitor)["pieces"][1]["claimed_by"]["id"] == kwabena


def _my_open_idea(client: TestClient, visitor: dict) -> str:
    ideas = client.get("/v1/me/ideas", headers=visitor).json()["data"]
    return next(idea["id"] for idea in ideas if idea["status"] == "open")


def _idea_matches(client: TestClient, visitor: dict) -> list[dict]:
    resp = client.get(f"/v1/me/ideas/{_my_open_idea(client, visitor)}/matches", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _for_you(client: TestClient, visitor: dict) -> list[dict]:
    resp = client.get("/v1/me/matches", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_the_visitors_idea_has_a_strong_a_possible_and_a_weak_match(
    client: TestClient, visitor: dict
) -> None:
    matches = _idea_matches(client, visitor)

    scores = [match["score"] for match in matches]
    assert scores == sorted(scores, reverse=True) and len(set(scores)) == len(scores)
    assert any(score >= 80 for score in scores)
    assert any(60 <= score < 80 for score in scores)
    assert any(40 <= score < 60 for score in scores)
    strong = matches[0]
    assert len(strong["matched_roles"]) == 2 and strong["breakdown"]["sectors"]["points"] == 10
    assert strong["country_code"] == "SN"


def test_for_you_has_two_ideas_with_different_scores_one_of_them_possible(
    client: TestClient, visitor: dict
) -> None:
    matches = _for_you(client, visitor)

    scores = [match["score"] for match in matches]
    assert len(matches) >= 2 and len(set(scores)) >= 2
    assert max(scores) >= 60
    assert any("é" in match["idea"]["title"] for match in matches)  # one is in French


def _seeded_usernames() -> list[str]:
    """Only the seed's own people: other tests leave demo accounts of their own in this database."""
    return [username for username, _, _ in PEOPLE.values()]


def _profiles() -> dict[str, tuple]:
    """Each demo person's bio, roles, technologies and sectors, as the tables hold them."""
    sql = text(
        """
        SELECT u.username, u.bio,
          array(SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND ur.verified_at IS NOT NULL ORDER BY 1),
          array(SELECT t.slug FROM user_technologies ut
                JOIN technologies t ON t.id = ut.technology_id
                WHERE ut.user_id = u.id ORDER BY 1),
          array(SELECT s.slug FROM user_sectors us JOIN sectors s ON s.id = us.sector_id
                WHERE us.user_id = u.id ORDER BY 1)
        FROM users u WHERE u.username = ANY(:names)
        """
    )

    async def go() -> dict[str, tuple]:
        async with db_session() as session:
            rows = await session.execute(sql, {"names": _seeded_usernames()})
            return {name: tuple(rest) for name, *rest in rows}

    return asyncio.run(go())


def _counts() -> tuple[int, int, int]:
    names = _seeded_usernames()

    async def go() -> tuple[int, int, int]:
        async with db_session() as session:
            owned = select(func.count()).select_from(Idea).join(User, User.id == Idea.author_id)
            hubs = select(func.count()).select_from(Hub).join(User, User.id == Hub.owner_id)
            return (
                await session.scalar(
                    select(func.count()).select_from(User).where(User.username.in_(names))
                ),
                await session.scalar(owned.where(User.username.in_(names))),
                await session.scalar(hubs.where(User.username.in_(names))),
            )

    return asyncio.run(go())


def _make_the_world_the_old_way() -> None:
    """What a demo made before the score range held: no sectors, one role each, shorter stacks,
    no Uwase and no For you ideas."""
    titles = [title for _, title, _, _ in FOR_YOU_IDEAS]

    async def go() -> None:
        async with db_session() as session:
            await session.execute(delete(Idea).where(Idea.title.in_(titles)))
            await session.execute(text("DELETE FROM user_sectors"))
            for sql in (
                "DELETE FROM user_roles ur USING users u, roles r WHERE ur.user_id = u.id"
                " AND ur.role_id = r.id AND u.username = 'aminata_ndiaye'"
                " AND r.slug = 'frontend-engineer'",
                "DELETE FROM user_technologies ut USING users u, technologies t"
                " WHERE ut.user_id = u.id AND ut.technology_id = t.id AND (u.username, t.slug) IN"
                " (('aminata_ndiaye', 'react'), ('aminata_ndiaye', 'nodejs'),"
                " ('aminata_ndiaye', 'ci-cd'), ('tendai_moyo', 'ci-cd'),"
                " ('tendai_moyo', 'postgresql'), ('olaoluwa_demo', 'nodejs'),"
                " ('olaoluwa_demo', 'ci-cd'))",
                "DELETE FROM users WHERE username = 'uwase_mutoni'",
                "UPDATE users SET bio = 'Développeuse mobile à Dakar.'"
                " WHERE username = 'aminata_ndiaye'",
            ):
                await session.execute(text(sql))
            await session.commit()

    asyncio.run(go())


def test_a_rerun_brings_a_world_made_the_old_way_to_the_same_state(
    client: TestClient, visitor: dict
) -> None:
    profiles, counts = _profiles(), _counts()
    matches, for_you = _idea_matches(client, visitor), _for_you(client, visitor)
    hubs = client.get("/v1/me/hubs", headers=visitor).json()["data"]
    assert len(profiles) == len(PEOPLE)

    _make_the_world_the_old_way()
    assert _profiles() != profiles and _counts() != counts
    assert _for_you(client, visitor) == []

    for _ in range(2):  # the second run adds nothing
        assert _seed() is False
        assert _profiles() == profiles and _counts() == counts

    assert [m["score"] for m in _idea_matches(client, visitor)] == [m["score"] for m in matches]
    assert [m["score"] for m in _for_you(client, visitor)] == [m["score"] for m in for_you]
    assert client.get("/v1/me/hubs", headers=visitor).json()["data"] == hubs


def _briefs(old: str | None = None) -> set[str | None]:
    """The private briefs of the demo people's ideas; with `old`, sets them all to it first."""
    theirs = select(User.id).where(User.username.in_(_seeded_usernames()))

    async def go() -> set[str | None]:
        async with db_session() as session:
            if old is not None:
                await session.execute(
                    update(Idea).where(Idea.author_id.in_(theirs)).values(details=old)
                )
                await session.commit()
            return set(
                await session.scalars(select(Idea.details).where(Idea.author_id.in_(theirs)))
            )

    return asyncio.run(go())


def test_no_demo_brief_says_it_is_made_up_after_a_run_or_a_rerun(
    client: TestClient, visitor: dict
) -> None:
    assert "made" not in BRIEF.lower() and "demo" not in BRIEF.lower()
    assert _briefs() == {BRIEF}
    mine = client.get(f"/v1/me/ideas/{_my_open_idea(client, visitor)}", headers=visitor)
    assert mine.json()["data"]["details"] == BRIEF

    old = "Made-up plan for the demo: milestones, budget in naira and CFA, partners."
    assert _briefs(old) == {old}
    assert _seed() is False
    assert _briefs() == {BRIEF}


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
