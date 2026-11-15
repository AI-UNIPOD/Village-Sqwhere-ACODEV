import asyncio
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text, update

from app import config, database
from app.api.v1.auth import DEMO_ACCOUNT_ID
from app.demo_seed import (
    BRIEF,
    COCOA_HUB,
    FOR_YOU_IDEAS,
    OLD_OWN_HUB_NOTES,
    OLD_OWN_HUB_REPOSITORY,
    OWN_HUB,
    OWN_HUB_CLAIMS,
    OWN_HUB_COMMITS,
    OWN_HUB_REPOSITORY,
    PEOPLE,
    TONTINE_HUB,
    main,
    seed,
)
from app.models import (
    Hub,
    HubCommit,
    HubMember,
    HubMessage,
    HubNote,
    HubPhase,
    HubPhaseMove,
    HubPiece,
    HubPieceLink,
    Idea,
    User,
    VerificationInterview,
    VerificationSession,
    VerificationStatus,
)
from tests.conftest import test_async_session as db_session


def _seed() -> bool:
    async def go() -> bool:
        async with db_session() as session:
            return await seed(session)

    return asyncio.run(go())


def _in_french(body: str) -> bool:
    """True when the text holds an accented letter or the narrow space French puts before ? and :,
    which the English notes and messages never use."""
    return re.search(r"[àâçéèêëîïôùûœ\u202f]", body.lower()) is not None


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

    hubs = _hub_cards(client, visitor)
    before = seeded_posts()

    assert _seed() is False

    assert _hub_cards(client, visitor) == hubs
    after = seeded_posts()
    assert len(after) == len(before) == 12
    assert after.isdisjoint(before)


def _hub_cards(client: TestClient, visitor: dict, **params) -> list[dict]:
    """The visitor's hubs, without `updated_at`: a rerun writes the commits of the build tab
    again, and that touches the hub."""
    cards = client.get("/v1/me/hubs", headers=visitor, params=params).json()["data"]
    return [{key: value for key, value in card.items() if key != "updated_at"} for card in cards]


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
        "olaoluwa_adebayo": "NG",
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
    assert not any(_in_french(note["body"]) for note in notes)  # Kumasi and Lagos write English
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


def _without_times(build: dict) -> dict:
    """The build tab as a rerun leaves it: the commits and their check are written again."""
    commits = [
        {key: value for key, value in commit.items() if key != "committed_at"}
        for commit in build["commits"]
    ]
    return {**build, "commits": commits, "commits_refreshed_at": None}


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
            # dated from the hub's move to build, so it ages with the hub and never leads it
            assert claimed < now
    # the address cannot be a real repository, and eight commits by the two members
    assert (
        seen["repository_url"] == OWN_HUB_REPOSITORY == "https://github.com/naira_payouts/payouts"
    )
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
    assert _without_times(_hub_build(client, visitor)) == _without_times(seen)

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
    # a claim written again gets the time it had, so the chat that mentions it still follows it
    assert [p["claimed_at"] for p in again["pieces"]] == [p["claimed_at"] for p in seen["pieces"]]

    # a piece that is held is left as it is, even when the seed would give it to someone else
    kwabena = next(p for p in seen["pieces"] if p["name"] == "Mobile app")["claimed_by"]["id"]

    async def hand_over(to: str) -> None:
        async with db_session() as session:
            await session.execute(
                update(HubPiece)
                .where(HubPiece.hub_id == _own_hub(client, visitor)["id"])
                .where(HubPiece.name == OWN_HUB_CLAIMS[0][2])
                .values(claimed_by=to)
            )
            await session.commit()

    asyncio.run(hand_over(kwabena))
    _seed()
    assert _hub_build(client, visitor)["pieces"][1]["claimed_by"]["id"] == kwabena
    asyncio.run(hand_over(seen["pieces"][1]["claimed_by"]["id"]))  # back, for the other tests


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
                " ('tendai_moyo', 'postgresql'), ('olaoluwa_adebayo', 'nodejs'),"
                " ('olaoluwa_adebayo', 'ci-cd'))",
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
    hubs = _hub_cards(client, visitor)
    assert len(profiles) == len(PEOPLE)

    _make_the_world_the_old_way()
    assert _profiles() != profiles and _counts() != counts
    assert _for_you(client, visitor) == []

    for _ in range(2):  # the second run adds nothing
        assert _seed() is False
        assert _profiles() == profiles and _counts() == counts

    assert [m["score"] for m in _idea_matches(client, visitor)] == [m["score"] for m in matches]
    assert [m["score"] for m in _for_you(client, visitor)] == [m["score"] for m in for_you]
    assert _hub_cards(client, visitor) == hubs


def _hubs(client: TestClient, visitor: dict) -> dict[str, dict]:
    """The visitor's three hubs by name: the two they belong to and the one that invited them."""
    cards = [
        *client.get("/v1/me/hubs", headers=visitor).json()["data"],
        *client.get("/v1/me/hubs", headers=visitor, params={"status": "invited"}).json()["data"],
    ]
    return {card["name"]: card for card in cards}


def test_each_signature_is_dated_the_moment_its_member_joined(
    client: TestClient, visitor: dict
) -> None:
    hubs = _hubs(client, visitor)
    for name in (OWN_HUB, TONTINE_HUB):
        resp = client.get(f"/v1/hubs/{hubs[name]['id']}/membership", headers=visitor)
        membership = resp.json()["data"]
        assert membership["signature"]["signed_at"] == membership["joined_at"]
        joined = datetime.fromisoformat(membership["joined_at"])
        assert datetime.now(UTC) - joined > timedelta(days=9)

    async def later_than_joining() -> int:
        async with db_session() as session:
            return await session.scalar(
                text(
                    "SELECT count(*) FROM agreement_signatures s "
                    "JOIN hub_members m ON m.signature_id = s.id "
                    "JOIN users u ON u.id = s.user_id "
                    "WHERE u.username = ANY(:names) AND s.signed_at > m.joined_at"
                ),
                {"names": _seeded_usernames()},
            )

    assert asyncio.run(later_than_joining()) == 0


def _review_cases(client: TestClient, visitor: dict) -> list[dict]:
    resp = client.get("/v1/reviews/verifications", headers=visitor)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_the_review_case_has_repositories_an_interview_and_a_report_in_english(
    client: TestClient, visitor: dict
) -> None:
    (card,) = _review_cases(client, visitor)
    resp = client.get(f"/v1/reviews/verifications/{card['id']}", headers=visitor)
    case = resp.json()["data"]

    # the queue card counts them, and no address can be a real person's repository
    addresses = [item["repository_url"] for item in card["evidence"]]
    assert 2 <= len(addresses) <= 3 and card["evidence"] == case["evidence"]
    for address in addresses:
        assert re.fullmatch(r"https://github\.com/[a-z]+_[a-z]+/[a-z-]+", address), address

    result = case["ai_result"]
    report, analysis, transcript = (
        result["final_report"],
        result["codebase_analysis"],
        result["interview_transcript"],
    )
    assert report["summary"] and report["codebase_findings"] and report["interview_findings"]
    assert report["concerns"] and 0 < report["confidence"] <= 1
    assert case["ai_score"] == report["score"] and case["language"] == "en"
    assert analysis["summary"] and len(analysis["criterion_assessments"]) >= 3
    for criterion in analysis["criterion_assessments"]:
        assert criterion["criterion"] and criterion["rationale"] and criterion["evidence"]
        assert isinstance(criterion["score"], int | float)
    assert transcript["welcome"] and len(transcript["turns"]) >= 3
    assert [turn["sequence"] for turn in transcript["turns"]] == list(
        range(1, len(transcript["turns"]) + 1)
    )
    assert all(turn["question"] and turn["answer"] for turn in transcript["turns"])

    # the review screen is anonymous: no name, and no French
    everything = str(result).lower()
    assert "tendai" not in everything and "moyo" not in everything
    assert not _in_french(everything)


def _change_the_review_case(**values) -> None:
    """Changes the one attempt of the seed's applicant, whatever its status."""

    async def go() -> None:
        async with db_session() as session:
            await session.execute(
                update(VerificationSession)
                .where(
                    VerificationSession.user_id
                    == select(User.id).where(User.username == "tendai_moyo").scalar_subquery()
                )
                .values(**values)
            )
            await session.commit()

    asyncio.run(go())


def _empty_the_review_case() -> None:
    """The attempt as an older seed left it: a user and a role, nothing else."""

    async def go() -> None:
        async with db_session() as session:
            await session.execute(delete(VerificationInterview))
            await session.commit()

    asyncio.run(go())
    _change_the_review_case(evidence=[], ai_result=None, ai_score=None, source=None)


def _interviews() -> int:
    async def go() -> int:
        async with db_session() as session:
            return await session.scalar(select(func.count()).select_from(VerificationInterview))

    return asyncio.run(go())


def test_a_rerun_fills_an_empty_review_case_once_and_leaves_a_decided_one_alone(
    client: TestClient, visitor: dict
) -> None:
    (filled,) = _review_cases(client, visitor)
    interviews = _interviews()

    _seed()
    (again,) = _review_cases(client, visitor)
    assert (again["evidence"], again["ai_result"]) == (filled["evidence"], filled["ai_result"])
    assert _interviews() == interviews

    _empty_the_review_case()
    assert _review_cases(client, visitor)[0]["evidence"] == []
    _seed()
    (refilled,) = _review_cases(client, visitor)
    assert (refilled["evidence"], refilled["ai_result"]) == (
        filled["evidence"],
        filled["ai_result"],
    )
    assert _interviews() == interviews

    # an attempt that is no longer awaiting review stays as it is. In progress stands for it here
    # because a decision is final in the database, and the other tests need the attempt back.
    _empty_the_review_case()
    _change_the_review_case(status=VerificationStatus.IN_PROGRESS)
    _seed()
    assert _review_cases(client, visitor) == []
    assert _interviews() == interviews - 1
    _change_the_review_case(status=VerificationStatus.AWAITING_REVIEW)
    _seed()
    assert _review_cases(client, visitor)[0]["evidence"] == filled["evidence"]


def test_each_hub_has_its_own_description_in_the_language_of_its_owner(
    client: TestClient, visitor: dict
) -> None:
    hubs = _hubs(client, visitor)
    descriptions = {name: card["description"] for name, card in hubs.items()}

    assert set(descriptions) == {OWN_HUB, TONTINE_HUB, COCOA_HUB}
    assert len(set(descriptions.values())) == 3
    for description in descriptions.values():
        assert not re.fullmatch(r"Building .* together\.", description)
        assert 2 <= len(re.findall(r"\.(?:\s|$)", description)) <= 3
    assert _in_french(descriptions[TONTINE_HUB])
    assert not _in_french(descriptions[OWN_HUB]) and not _in_french(descriptions[COCOA_HUB])


def test_a_rerun_replaces_the_template_description_and_keeps_one_somebody_wrote(
    client: TestClient, visitor: dict
) -> None:
    hubs = _hubs(client, visitor)
    descriptions = {name: card["description"] for name, card in hubs.items()}
    own_words = "Our own words, written by the owner."

    async def write(new: dict[str, str]) -> None:
        async with db_session() as session:
            for name, description in new.items():
                await session.execute(
                    update(Hub).where(Hub.id == hubs[name]["id"]).values(description=description)
                )
            await session.commit()

    asyncio.run(
        write(
            {
                OWN_HUB: "Building naira payouts that never pay twice together.",
                TONTINE_HUB: "Building tontine numérique pour dakar together.",
                COCOA_HUB: own_words,
            }
        )
    )
    _seed()

    after = {name: card["description"] for name, card in _hubs(client, visitor).items()}
    assert after == descriptions | {COCOA_HUB: own_words}
    asyncio.run(write({COCOA_HUB: descriptions[COCOA_HUB]}))


def test_no_post_hires_and_the_french_one_tells_how_the_tontine_is_going(
    client: TestClient, visitor: dict
) -> None:
    feed = client.get("/v1/feed", headers=visitor, params={"limit": 50}).json()["data"]
    seeded = {username for username, _, _ in PEOPLE.values()}
    posts = [post for post in feed if post["author"]["username"] in seeded]

    assert len(posts) == 12
    assert not any(re.search(r"recrut|hiring", post["body"].lower()) for post in posts)
    aminata = [post["body"] for post in posts if post["author"]["username"] == "aminata_ndiaye"]
    assert any("tontine" in body.lower() and _in_french(body) for body in aminata)

    # the visitor lives in Lagos and answers Aminata's French question in English
    question = next(post for post in posts if post["type"] == "question")
    comments = client.get(f"/v1/posts/{question['id']}/comments", headers=visitor).json()["data"]
    assert comments and not any(_in_french(comment["body"]) for comment in comments)


def test_a_rerun_writes_the_notes_an_older_world_holds_in_french_in_english(
    client: TestClient, visitor: dict
) -> None:
    notes = [note["body"] for note in _hub_notes(client, visitor)]

    async def write_them_in_french() -> None:
        async with db_session() as session:
            for old, new in OLD_OWN_HUB_NOTES.items():
                await session.execute(update(HubNote).where(HubNote.body == new).values(body=old))
            await session.commit()

    asyncio.run(write_them_in_french())
    assert sum(_in_french(note["body"]) for note in _hub_notes(client, visitor)) == 2
    _seed()
    assert [note["body"] for note in _hub_notes(client, visitor)] == notes


def _chat(client: TestClient, visitor: dict, name: str) -> list[dict]:
    """The team chat of one of the visitor's hubs, oldest message first."""
    hub_id = _hubs(client, visitor)[name]["id"]
    resp = client.get(f"/v1/hubs/{hub_id}/messages", headers=visitor)
    assert resp.status_code == 200, resp.text
    return list(reversed(resp.json()["data"]))


def _chats(client: TestClient, visitor: dict) -> dict[str, list[str]]:
    return {
        name: [message["body"] for message in _chat(client, visitor, name)]
        for name in (OWN_HUB, TONTINE_HUB)
    }


def test_both_teams_have_been_talking_in_the_language_of_their_members(
    client: TestClient, visitor: dict
) -> None:
    now = datetime.now(UTC)
    hubs = _hubs(client, visitor)
    for name, size in ((OWN_HUB, range(6, 9)), (TONTINE_HUB, range(4, 6))):
        members = client.get(f"/v1/hubs/{hubs[name]['id']}/members", headers=visitor).json()["data"]
        active = {m["user"]["id"] for m in members if m["status"] == "active"}
        chat = _chat(client, visitor, name)

        assert len(chat) in size
        assert {message["author"]["id"] for message in chat} <= active
        times = [datetime.fromisoformat(message["created_at"]) for message in chat]
        assert times == sorted(times)
        assert all(now - timedelta(days=10) < moment < now for moment in times)

    # Lagos and Kumasi write English; the Tontine hub mixes French and English
    payouts = _chat(client, visitor, OWN_HUB)
    assert len({message["author"]["id"] for message in payouts}) == 2
    assert not any(_in_french(message["body"]) for message in payouts)
    # the message that says the claims are made comes after every claim of the person who wrote it
    (reply,) = [m for m in payouts if m["body"].startswith("Works for me")]
    claims = [
        datetime.fromisoformat(piece["claimed_at"])
        for piece in _hub_build(client, visitor)["pieces"]
        if piece["claimed_by"] and piece["claimed_by"]["id"] == reply["author"]["id"]
    ]
    assert len(claims) == 2
    assert all(claim < datetime.fromisoformat(reply["created_at"]) for claim in claims)
    tontine = [_in_french(message["body"]) for message in _chat(client, visitor, TONTINE_HUB)]
    assert any(tontine) and not all(tontine)


def test_a_rerun_writes_a_chat_only_in_a_hub_whose_chat_is_empty(
    client: TestClient, visitor: dict
) -> None:
    chats = _chats(client, visitor)
    hubs = _hubs(client, visitor)

    _seed()
    assert _chats(client, visitor) == chats

    async def say(only: str | None) -> None:
        """Empties both chats, then puts one message from the hub's owner in the named hub."""
        async with db_session() as session:
            await session.execute(
                delete(HubMessage).where(HubMessage.hub_id.in_([hubs[n]["id"] for n in chats]))
            )
            if only:
                await session.execute(
                    text(
                        "INSERT INTO hub_messages (hub_id, author_id, body) "
                        "VALUES (:hub, :author, 'We keep this.')"
                    ),
                    {"hub": hubs[only]["id"], "author": hubs[only]["owner"]["id"]},
                )
            await session.commit()

    asyncio.run(say(only=OWN_HUB))
    _seed()
    assert _chats(client, visitor) == chats | {OWN_HUB: ["We keep this."]}

    asyncio.run(say(only=None))
    _seed()
    assert _chats(client, visitor) == chats


async def _history_of_the_hub(own: str) -> dict:
    """The moments of the Payouts hub's history, and its chat by message text with its times."""
    async with db_session() as session:
        moves = dict(
            (
                await session.execute(
                    select(HubPhaseMove.to_phase, func.min(HubPhaseMove.created_at))
                    .where(HubPhaseMove.hub_id == own)
                    .group_by(HubPhaseMove.to_phase)
                )
            ).all()
        )
        claims = list(
            await session.scalars(
                select(HubPiece.claimed_at).where(
                    HubPiece.hub_id == own, HubPiece.claimed_at.is_not(None)
                )
            )
        )
        notes = list(await session.scalars(select(HubNote.created_at).where(HubNote.hub_id == own)))
        joined = await session.scalar(
            select(func.max(HubMember.joined_at)).where(HubMember.hub_id == own)
        )
        said = {
            body: moment
            for body, moment in (
                await session.execute(
                    select(HubMessage.body, HubMessage.created_at).where(HubMessage.hub_id == own)
                )
            ).all()
        }
    return {
        "design": moves[HubPhase.DESIGN],
        "build": moves[HubPhase.BUILD],
        "first_claim": min(claims),
        "last_claim": max(claims),
        "first_note": min(notes),
        "last_note": max(notes),
        "joined": joined,
        "said": said,
    }


def test_a_chat_written_on_a_rerun_days_later_fits_the_history_of_its_hub(
    client: TestClient, visitor: dict
) -> None:
    """A world seeded five days ago has a hub history fixed five days back. Its chat, written
    today because it is empty, is counted from that history and not from today."""
    own = _hubs(client, visitor)[OWN_HUB]["id"]

    async def move_the_history(days: int) -> None:
        """Moves everything in the hubs' history by some days, the chat emptied. A hub's history
        cannot be rewritten by a rerun, so the test puts it back when it is done."""
        async with db_session() as session:
            await session.execute(text("ALTER TABLE hub_phase_moves DISABLE TRIGGER USER"))
            for table, columns in (
                ("hub_members", ("joined_at",)),
                ("hub_phase_moves", ("created_at",)),
                ("hub_notes", ("created_at",)),
                ("hub_pieces", ("created_at", "updated_at", "claimed_at")),
            ):
                for column in columns:
                    await session.execute(
                        text(
                            f"UPDATE {table} "
                            f"SET {column} = {column} + make_interval(days => :days) "
                            f"WHERE {column} IS NOT NULL"
                        ),
                        {"days": days},
                    )
            await session.execute(text("ALTER TABLE hub_phase_moves ENABLE TRIGGER USER"))
            await session.execute(delete(HubMessage))
            await session.commit()

    asyncio.run(move_the_history(-5))
    try:
        _seed()
        found = asyncio.run(_history_of_the_hub(own))
    finally:
        asyncio.run(move_the_history(5))
        _seed()

    said = found["said"]

    def at(start: str) -> datetime:
        (moment,) = [moment for body, moment in said.items() if body.startswith(start)]
        return moment

    assert datetime.now(UTC) - found["joined"] > timedelta(days=14)
    assert found["joined"] < at("Hi, glad to be on this") < at("Notes board first")
    assert at("Notes board first") < found["first_note"]
    assert found["last_note"] < at("The notes look complete") < found["design"]
    assert at("Yes, go ahead") < found["design"]
    assert found["build"] < at("We are in build now") < found["first_claim"]
    # kwabena says he has claimed his pieces only after he has
    assert at("Works for me") > found["last_claim"]
    assert at("Works for me") < at("A failed transfer")
    assert min(said.values()) > found["joined"]
    assert max(said.values()) < datetime.now(UTC)


def _claims_precede_the_first_commit_of_their_holder(build: dict) -> None:
    first: dict[str, datetime] = {}
    for commit in build["commits"]:
        moment = datetime.fromisoformat(commit["committed_at"])
        first[commit["author_name"]] = min(moment, first.get(commit["author_name"], moment))
    held = [piece for piece in build["pieces"] if piece["claimed_by"]]
    assert len(held) == 4
    for piece in held:
        claimed = datetime.fromisoformat(piece["claimed_at"])
        assert claimed < first[piece["claimed_by"]["display_name"]], piece["name"]


def test_every_claim_is_older_than_the_first_commit_of_its_holder(
    client: TestClient, visitor: dict
) -> None:
    build = _hub_build(client, visitor)

    _claims_precede_the_first_commit_of_their_holder(build)
    # nobody holds the ledger piece, so no commit may say someone worked on the ledger
    assert [p["name"] for p in build["pieces"] if not p["claimed_by"]] == ["Ledger database"]
    assert not any("ledger" in commit["message"].lower() for commit in build["commits"])


def test_a_rerun_writes_the_commits_and_their_check_again_with_fresh_times(
    client: TestClient, visitor: dict
) -> None:
    hub_id = _own_hub(client, visitor)["id"]

    async def age_them() -> None:
        async with db_session() as session:
            await session.execute(
                update(HubCommit)
                .where(HubCommit.hub_id == hub_id)
                .values(committed_at=HubCommit.committed_at - timedelta(days=3))
            )
            await session.execute(
                update(Hub)
                .where(Hub.id == hub_id)
                .values(commits_refreshed_at=datetime.now(UTC) - timedelta(days=3))
            )
            await session.commit()

    asyncio.run(age_them())
    checked = datetime.fromisoformat(_hub_build(client, visitor)["commits_refreshed_at"])
    assert datetime.now(UTC) - checked > timedelta(days=2)

    _seed()
    build = _hub_build(client, visitor)
    now = datetime.now(UTC)
    refreshed = datetime.fromisoformat(build["commits_refreshed_at"])
    assert timedelta(minutes=50) < now - refreshed < timedelta(minutes=70)
    assert len(build["commits"]) == len(OWN_HUB_COMMITS)
    assert all(
        now - timedelta(days=3) < datetime.fromisoformat(commit["committed_at"]) < now
        for commit in build["commits"]
    )


def _what_the_hubs_hold(client: TestClient, visitor: dict) -> dict:
    """What the visitor's hubs, review queue and build tab hold, without their times."""
    build = _hub_build(client, visitor)
    (case,) = _review_cases(client, visitor)
    return {
        "descriptions": {
            name: card["description"] for name, card in _hubs(client, visitor).items()
        },
        "notes": [note["body"] for note in _hub_notes(client, visitor)],
        "chats": _chats(client, visitor),
        "case": (case["evidence"], case["ai_result"], case["ai_score"]),
        "claims": [(p["name"], p["claimed_by"] and p["claimed_by"]["id"]) for p in build["pieces"]],
        "commits": [(c["message"], c["author_name"]) for c in build["commits"]],
        "repository": build["repository_url"],
    }


def _make_the_hubs_the_old_way(client: TestClient, visitor: dict) -> None:
    """What a demo made before this change holds: the template descriptions, two notes in
    French, empty chats, an empty review case, claims made after their holder's first commit and
    a build tab checked three days ago. Signatures are not here: only the script changes those."""
    hubs = _hubs(client, visitor)
    own = hubs[OWN_HUB]["id"]

    async def go() -> None:
        async with db_session() as session:
            await session.execute(
                text(
                    "UPDATE hubs h SET description = 'Building ' || lower(i.title) || ' together.' "
                    "FROM ideas i WHERE i.id = h.idea_id AND h.id = ANY(:hubs)"
                ),
                {"hubs": [card["id"] for card in hubs.values()]},
            )
            for old, new in OLD_OWN_HUB_NOTES.items():
                await session.execute(update(HubNote).where(HubNote.body == new).values(body=old))
            await session.execute(delete(HubMessage))
            await session.execute(
                update(HubPiece)
                .where(HubPiece.hub_id == own, HubPiece.claimed_by.is_not(None))
                .values(claimed_at=datetime.now(UTC) - timedelta(hours=20))
            )
            await session.execute(
                update(HubCommit)
                .where(HubCommit.hub_id == own, HubCommit.position == 0)
                .values(message="Record every payout in the ledger with its time")
            )
            await session.execute(
                update(Hub)
                .where(Hub.id == own)
                .values(commits_refreshed_at=datetime.now(UTC) - timedelta(days=3))
            )
            await session.commit()

    asyncio.run(go())
    _empty_the_review_case()


def test_a_rerun_brings_the_hubs_of_a_world_made_the_old_way_to_the_same_state(
    client: TestClient, visitor: dict
) -> None:
    current = _what_the_hubs_hold(client, visitor)

    _make_the_hubs_the_old_way(client, visitor)
    assert _what_the_hubs_hold(client, visitor) != current
    with pytest.raises(AssertionError):
        _claims_precede_the_first_commit_of_their_holder(_hub_build(client, visitor))

    for _ in range(2):  # the second run adds nothing
        assert _seed() is False
        assert _what_the_hubs_hold(client, visitor) == current
        _claims_precede_the_first_commit_of_their_holder(_hub_build(client, visitor))


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


def _seen_by_the_visitor(client: TestClient, visitor: dict) -> str:
    """What the demo's main screens are given, as one text. The agreement is left out: which
    one is current depends on the templates other tests leave in this database."""
    hub = _own_hub(client, visitor)["id"]
    paths = (
        "/v1/me",
        "/v1/me/ideas",
        "/v1/me/hubs",
        "/v1/feed",
        f"/v1/hubs/{hub}",
        f"/v1/hubs/{hub}/idea",
        f"/v1/hubs/{hub}/members",
        f"/v1/hubs/{hub}/notes",
        f"/v1/hubs/{hub}/design",
        f"/v1/hubs/{hub}/build",
    )
    answers = [client.get(path, headers=visitor) for path in paths]
    assert [answer.status_code for answer in answers] == [200] * len(paths)
    return "\n".join(answer.text for answer in answers).lower()


def test_nothing_the_seed_wrote_calls_itself_demo_sample_or_made_up(
    client: TestClient, visitor: dict
) -> None:
    seen = _seen_by_the_visitor(client, visitor)
    assert "olaoluwa_adebayo" in seen and "naira_payouts" in seen
    for word in (
        "olaoluwa_demo",
        "payouts_demo",
        "made-up",
        "made up",
        "sample",
        "placeholder",
        "example.com",
        "lorem",
    ):
        assert word not in seen, word


def test_a_rerun_renames_the_account_and_the_repository_of_an_older_world(
    client: TestClient, visitor: dict
) -> None:
    async def age() -> None:
        async with db_session() as session:
            await session.execute(
                update(User).where(User.id == DEMO_ACCOUNT_ID).values(username="olaoluwa_demo")
            )
            await session.execute(
                update(Hub)
                .where(Hub.id == _own_hub(client, visitor)["id"])
                .values(repository_url=OLD_OWN_HUB_REPOSITORY)
            )
            await session.commit()

    counts = _counts()
    asyncio.run(age())
    assert client.get("/v1/me", headers=visitor).json()["data"]["username"] == "olaoluwa_demo"
    assert _seed() is False
    assert client.get("/v1/me", headers=visitor).json()["data"]["username"] == "olaoluwa_adebayo"
    assert _hub_build(client, visitor)["repository_url"] == OWN_HUB_REPOSITORY
    assert _counts() == counts  # the account was renamed, not made a second time


def test_the_visitor_signed_each_hub_no_later_than_they_joined_it(
    client: TestClient, visitor: dict
) -> None:
    # a demo seeded before this fix is corrected by the script, not by a rerun of the seed
    script = Path(__file__).resolve().parents[3] / "infra/db/init/026-demo-signature-dates.sql"

    async def correct_an_older_demo() -> None:
        async with db_session() as session:
            await (await session.connection()).exec_driver_sql(script.read_text(encoding="utf-8"))
            await session.commit()

    asyncio.run(correct_an_older_demo())
    hubs = client.get("/v1/me/hubs", headers=visitor).json()["data"]
    assert len(hubs) >= 2
    for hub in hubs:
        mine = client.get(f"/v1/hubs/{hub['id']}/membership", headers=visitor).json()["data"]
        assert mine["signature"]["signed_at"] <= mine["joined_at"], hub["name"]


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
