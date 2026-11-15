"""The build tab: who claims which piece, the repository address, and the copied commits.
GitHub is always faked, so no test reaches the network."""

import asyncio
import io
import json
import re
import threading
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.v1.hub_build import REFRESH_WAIT
from app.main import app
from app.models import Hub, HubCommit, HubMemberStatus, HubPiece, HubStatus, User
from app.services import verification
from tests.conftest import test_async_session as db_session
from tests.hub_support import add_member, auth, make_hub, make_user, run
from tests.test_hub_design import (
    AUTHOR_KEYS,
    PIECE_KEYS,
    UNKNOWN_ID,
    designing_hub,
    insert_pieces,
    make_piece,
    remove_piece,
)
from tests.test_hub_design import design as read_design
from tests.test_hub_notes import set_hub
from tests.test_hub_phases import assert_error, confirm, move

REPOSITORY = "https://github.com/acodev/village-ledger"
ANSWER_KEYS = {
    "repository_url",
    "commits_refreshed_at",
    "can_set_repository",
    "can_refresh",
    "pieces",
    "commits",
}
PIECE = {"id", "name", "summary", "claimed_by", "claimed_at", "can_claim", "can_release"}
COMMIT = {"sha", "message", "author_name", "committed_at"}


class FakeGitHub:
    """What GitHub answers to the commits request, and the requests it received."""

    def __init__(self) -> None:
        self.body = b"[]"
        self.error: Exception | None = None
        self.requests: list[tuple[str, float]] = []
        self.during: Callable[[], None] | None = None

    def answer(self, items: Any) -> None:
        self.body = json.dumps(items).encode()

    def __call__(self, request: Any, timeout: float) -> io.BytesIO:
        self.requests.append((request.full_url, timeout))
        if self.during is not None:
            during, self.during = self.during, None
            during()
        if self.error is not None:
            raise self.error
        return io.BytesIO(self.body)


@pytest.fixture(autouse=True)
def github_commits(monkeypatch: pytest.MonkeyPatch) -> FakeGitHub:
    fake = FakeGitHub()
    monkeypatch.setattr(verification, "urlopen", fake)
    return fake


def fake_github() -> FakeGitHub:
    """The one the autouse fixture put in place, for helpers that are not given it."""
    assert isinstance(verification.urlopen, FakeGitHub)
    return verification.urlopen


def commit_item(
    number: int, message: str = "Fix the payout retry", name: str = "Amina Bello", **dates: str
) -> dict[str, Any]:
    """A commit as GitHub lists it. The author date is older than the commit date."""
    return {
        "sha": f"{number:040x}",
        "commit": {
            "message": message,
            "author": {"name": name, "date": dates.get("author", "2026-11-10T08:00:00Z")},
            "committer": {
                "name": "web-flow",
                "date": dates.get("committer", "2026-11-14T09:30:00Z"),
            },
        },
    }


def commits_of(count: int) -> list[dict[str, Any]]:
    return [commit_item(number, f"Commit {number}") for number in range(count)]


def build_url(hub: Hub) -> str:
    return f"/v1/hubs/{hub.id}/build"


def read(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.get(build_url(hub), headers=auth(caller))


def answer(client: TestClient, hub: Hub, caller: User) -> dict:
    resp = read(client, hub, caller)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def claim(client: TestClient, hub: Hub, caller: User, piece_id: Any) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/pieces/{piece_id}/claim", headers=auth(caller))


def free(client: TestClient, hub: Hub, caller: User, piece_id: Any) -> Any:
    return client.delete(f"/v1/hubs/{hub.id}/pieces/{piece_id}/claim", headers=auth(caller))


def set_repository(client: TestClient, hub: Hub, caller: User, value: Any = REPOSITORY) -> Any:
    return client.put(
        f"/v1/hubs/{hub.id}/repository", headers=auth(caller), json={"repository_url": value}
    )


def refresh(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/commits/refresh", headers=auth(caller))


def writes(client: TestClient, hub: Hub, caller: User) -> list[Any]:
    """The four writes, aimed at a piece that exists nowhere, so only the checks before the
    lookup can refuse them."""
    return [
        claim(client, hub, caller, UNKNOWN_ID),
        free(client, hub, caller, UNKNOWN_ID),
        set_repository(client, hub, caller),
        refresh(client, hub, caller),
    ]


def piece_by_name(client: TestClient, hub: Hub, caller: User, name: str) -> dict:
    return next(piece for piece in answer(client, hub, caller)["pieces"] if piece["name"] == name)


def building_hub(
    client: TestClient, names: tuple[str, ...] = ("Mobile app", "Payouts API")
) -> tuple[Hub, User, User, list[dict]]:
    """A hub in build with its owner, one active member and pieces from the design phase."""
    hub, owner, member = designing_hub(client)
    pieces = [make_piece(client, hub, owner, name) for name in names]
    assert move(client, hub, owner, "build").status_code == 200
    return hub, owner, member, pieces


def with_repository(client: TestClient, hub: Hub, owner: User, count: int = 3) -> None:
    """The repository set and `count` commits copied, with the wait after a refresh over."""
    assert set_repository(client, hub, owner).status_code == 200
    fake_github().answer(commits_of(count))
    assert refresh(client, hub, owner).status_code == 200
    set_hub(hub, commits_refreshed_at=datetime.now(UTC) - REFRESH_WAIT * 2)


def stored_commits(hub: Hub) -> list[HubCommit]:
    async def work(session: AsyncSession) -> list[HubCommit]:
        rows = await session.scalars(
            select(HubCommit).where(HubCommit.hub_id == hub.id).order_by(HubCommit.position)
        )
        return list(rows)

    return run(work)


def stored_hub(hub: Hub) -> Hub:
    async def work(session: AsyncSession) -> Hub:
        row = await session.scalar(
            select(Hub).where(Hub.id == hub.id).execution_options(populate_existing=True)
        )
        assert row is not None
        return row

    return run(work)


def during_the_fetch(github: FakeGitHub, work: Callable[[], Any]) -> list[Any]:
    """Runs `work` from another thread while GitHub is being asked. The list gets its result,
    and stays empty if `work` is still waiting after five seconds."""
    results: list[Any] = []

    def meanwhile() -> None:
        worker = threading.Thread(target=lambda: results.append(work()))
        worker.start()
        worker.join(timeout=5)

    github.during = meanwhile
    return results


def test_the_build_answer_lists_live_pieces_oldest_first_with_nobody_holding_them(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    one, two, gone = (make_piece(client, hub, owner, name) for name in ("One", "Two", "Gone"))
    assert remove_piece(client, hub, owner, gone["id"]).status_code == 204
    assert move(client, hub, owner, "build").status_code == 200

    for reader in (owner, member):
        seen = answer(client, hub, reader)
        assert set(seen) == ANSWER_KEYS
        assert seen["repository_url"] is None and seen["commits_refreshed_at"] is None
        assert seen["commits"] == [] and seen["can_refresh"] is False
        assert [piece["id"] for piece in seen["pieces"]] == [one["id"], two["id"]]
        for piece in seen["pieces"]:
            assert set(piece) == PIECE and piece["claimed_by"] is None
            assert piece["claimed_at"] is None
            assert (piece["can_claim"], piece["can_release"]) == (True, False)
    assert answer(client, hub, owner)["can_set_repository"] is True
    assert answer(client, hub, member)["can_set_repository"] is False


def test_a_member_claims_a_piece_and_everyone_reads_who_holds_it(client: TestClient) -> None:
    hub, owner, member, (app_piece, api) = building_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)

    resp = claim(client, hub, member, app_piece["id"])

    assert resp.status_code == 200, resp.text
    held = resp.json()["data"]
    assert set(held) == PIECE and set(held["claimed_by"]) == AUTHOR_KEYS
    assert held["claimed_by"]["id"] == str(member.id) and held["claimed_at"]
    assert (held["name"], held["can_claim"], held["can_release"]) == ("Mobile app", False, True)
    # what the others see: the holder, and who may free it
    for viewer, can_release in ((owner, True), (member, True), (other, False)):
        mine = piece_by_name(client, hub, viewer, "Mobile app")
        assert mine["claimed_by"] == held["claimed_by"] and mine["claimed_at"] == held["claimed_at"]
        assert (mine["can_claim"], mine["can_release"]) == (False, can_release)
        assert piece_by_name(client, hub, viewer, "Payouts API")["claimed_by"] is None
    # a member may hold several pieces
    assert claim(client, hub, member, api["id"]).status_code == 200
    assert [p["claimed_by"]["id"] for p in answer(client, hub, owner)["pieces"]] == [
        str(member.id)
    ] * 2


def test_claiming_again_changes_nothing_and_a_held_piece_is_refused(client: TestClient) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    first = claim(client, hub, member, piece["id"]).json()["data"]

    again = claim(client, hub, member, piece["id"])

    assert again.status_code == 200 and again.json()["data"] == first
    taken = claim(client, hub, owner, piece["id"])
    assert_error(taken, 409, "PIECE_CLAIMED")
    assert "already builds this piece" in taken.json()["detail"]["message"]
    seen = piece_by_name(client, hub, owner, "Mobile app")
    assert seen["claimed_by"]["id"] == str(member.id) and seen["claimed_at"] == first["claimed_at"]


def test_the_holder_or_the_owner_frees_a_piece_and_nobody_else(client: TestClient) -> None:
    hub, owner, member, (one, two) = building_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    assert claim(client, hub, member, one["id"]).status_code == 200
    assert claim(client, hub, owner, two["id"]).status_code == 200

    assert_error(free(client, hub, other, one["id"]), 403, "NOT_PIECE_HOLDER")
    assert_error(free(client, hub, member, two["id"]), 403, "NOT_PIECE_HOLDER")
    assert piece_by_name(client, hub, owner, "Mobile app")["claimed_by"]["id"] == str(member.id)

    # the owner frees another member's piece, and the holder frees their own
    assert free(client, hub, owner, one["id"]).status_code == 204
    assert free(client, hub, owner, two["id"]).status_code == 204
    assert all(piece["claimed_by"] is None for piece in answer(client, hub, other)["pieces"])
    # a piece nobody holds is freed again without a fuss, by anyone
    assert free(client, hub, other, one["id"]).status_code == 204
    assert claim(client, hub, other, one["id"]).status_code == 200
    assert free(client, hub, other, one["id"]).status_code == 204
    assert free(client, hub, other, one["id"]).status_code == 204
    assert piece_by_name(client, hub, owner, "Mobile app")["claimed_by"] is None


def test_a_freed_piece_can_be_claimed_by_someone_else(client: TestClient) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    assert claim(client, hub, member, piece["id"]).status_code == 200
    assert free(client, hub, member, piece["id"]).status_code == 204

    resp = claim(client, hub, owner, piece["id"])

    assert resp.status_code == 200
    assert resp.json()["data"]["claimed_by"]["id"] == str(owner.id)


def test_an_unknown_deleted_or_foreign_piece_is_a_404(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    elsewhere, elsewhere_owner, _ = designing_hub(client)
    foreign = make_piece(client, elsewhere, elsewhere_owner)
    gone = make_piece(client, hub, owner, "Gone")
    assert remove_piece(client, hub, owner, gone["id"]).status_code == 204
    assert move(client, hub, owner, "build").status_code == 200

    for piece_id in (UNKNOWN_ID, gone["id"], foreign["id"]):
        assert_error(claim(client, hub, member, piece_id), 404, "PIECE_NOT_FOUND")
        assert_error(free(client, hub, member, piece_id), 404, "PIECE_NOT_FOUND")


@pytest.mark.parametrize("how", ["leaves", "is removed"])
def test_a_claim_of_someone_who_left_or_was_removed_reads_as_free(
    client: TestClient, how: str
) -> None:
    hub, owner, member, (held, _) = building_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    assert claim(client, hub, member, held["id"]).status_code == 200
    if how == "leaves":
        resp = client.post(f"/v1/hubs/{hub.id}/membership/leave", headers=auth(member))
    else:
        resp = client.post(f"/v1/hubs/{hub.id}/members/{member.id}/remove", headers=auth(owner))
    assert resp.status_code == 200, resp.text

    for viewer in (owner, other):
        seen = piece_by_name(client, hub, viewer, "Mobile app")
        assert seen["claimed_by"] is None and seen["claimed_at"] is None
        assert (seen["can_claim"], seen["can_release"]) == (True, False)
    # freeing it is a repeat of nothing, and anyone active may take it
    assert free(client, hub, other, held["id"]).status_code == 204
    taken = claim(client, hub, other, held["id"])
    assert taken.status_code == 200 and taken.json()["data"]["claimed_by"]["id"] == str(other.id)
    assert_error(claim(client, hub, owner, held["id"]), 409, "PIECE_CLAIMED")
    assert_error(read(client, hub, member), 403, "NOT_HUB_MEMBER")


@pytest.mark.parametrize(
    "value",
    [
        REPOSITORY,
        f"  {REPOSITORY}  ",
        f"{REPOSITORY}/",
        f"{REPOSITORY}.git",
        f"{REPOSITORY}.git/",
        "https://github.com/a-b_c.d/e.f-g_h",
    ],
)
def test_the_owner_sets_the_repository_and_the_address_is_tidied(
    client: TestClient, value: str, github_commits: FakeGitHub
) -> None:
    hub, owner, member, _ = building_hub(client)
    expected = value.strip().removesuffix("/").removesuffix(".git")

    resp = set_repository(client, hub, owner, value)

    assert resp.status_code == 200, resp.text
    seen = resp.json()["data"]
    assert set(seen) == ANSWER_KEYS and seen["repository_url"] == expected
    assert (seen["commits"], seen["commits_refreshed_at"]) == ([], None)
    assert seen["can_set_repository"] is True and seen["can_refresh"] is True
    assert answer(client, hub, member)["repository_url"] == expected
    # setting it never calls GitHub
    assert github_commits.requests == []


@pytest.mark.parametrize(
    "value",
    [
        "",
        "   ",
        "github.com/acodev/village",
        "http://github.com/acodev/village",
        "https://gitlab.com/acodev/village",
        "https://www.github.com/acodev/village",
        "https://user@github.com/acodev/village",
        "https://github.com:443/acodev/village",
        "https://github.com/",
        "https://github.com/acodev",
        "https://github.com/acodev/",
        "https://github.com/acodev/village/tree/main",
        "https://github.com/acodev/village//",
        "https://github.com/acodev/village?tab=readme",
        "https://github.com/acodev/village#readme",
        "https://github.com/acodev/vil lage",
        "https://github.com/acodev/villé",
        "https://github.com/acodev/village\u0000",
        "https://github.com/" + "a" * 200 + "/village",
        ".git",
        12,
        ["https://github.com/acodev/village"],
    ],
    ids=repr,
)
def test_a_bad_repository_address_is_a_422_that_names_the_field(
    client: TestClient, value: Any
) -> None:
    hub, owner, _, _ = building_hub(client)
    with_repository(client, hub, owner)

    resp = set_repository(client, hub, owner, value)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "repository_url"]
    kept = answer(client, hub, owner)
    assert kept["repository_url"] == REPOSITORY and len(kept["commits"]) == 3


def test_the_repository_needs_its_field_and_refuses_others(client: TestClient) -> None:
    hub, owner, _, _ = building_hub(client)

    for body in ({}, {"repository_url": REPOSITORY, "owner": "x"}, {"url": REPOSITORY}):
        resp = client.put(f"/v1/hubs/{hub.id}/repository", headers=auth(owner), json=body)
        assert resp.status_code == 422, body


def test_a_bad_repository_address_is_a_422_before_any_other_refusal(client: TestClient) -> None:
    hub, owner, member, _ = building_hub(client)
    assert move(client, hub, owner, "review").status_code == 200  # the phase is closed

    assert set_repository(client, hub, owner, "nope").status_code == 422
    assert set_repository(client, hub, member, "nope").status_code == 422  # not the owner
    assert set_repository(client, hub, make_user(), "nope").status_code == 422  # not a member


def test_only_the_owner_sets_the_repository(client: TestClient) -> None:
    hub, owner, member, _ = building_hub(client)

    assert_error(set_repository(client, hub, member, REPOSITORY), 403, "NOT_HUB_OWNER")
    assert_error(set_repository(client, hub, member, None), 403, "NOT_HUB_OWNER")
    assert answer(client, hub, owner)["repository_url"] is None


def test_changing_or_clearing_the_repository_deletes_the_commits(client: TestClient) -> None:
    hub, owner, member, _ = building_hub(client)
    with_repository(client, hub, owner)
    assert len(stored_commits(hub)) == 3

    changed = set_repository(client, hub, owner, "https://github.com/acodev/other").json()["data"]

    assert changed["repository_url"] == "https://github.com/acodev/other"
    assert (changed["commits"], changed["commits_refreshed_at"]) == ([], None)
    # the rows are deleted, not hidden
    assert stored_commits(hub) == []
    with_repository(client, hub, owner)
    cleared = set_repository(client, hub, owner, None)
    assert cleared.status_code == 200
    assert cleared.json()["data"]["repository_url"] is None
    assert cleared.json()["data"]["can_refresh"] is False
    assert stored_commits(hub) == [] and stored_hub(hub).commits_refreshed_at is None
    assert answer(client, hub, member)["commits"] == []


def test_the_same_address_again_keeps_the_commits_and_the_wait(client: TestClient) -> None:
    hub, owner, _, _ = building_hub(client)
    with_repository(client, hub, owner)
    assert refresh(client, hub, owner).status_code == 200
    before = answer(client, hub, owner)

    again = set_repository(client, hub, owner, f"{REPOSITORY}/")

    assert again.status_code == 200 and again.json()["data"] == before
    # so pasting the address again is no way round the wait between two refreshes
    assert_error(refresh(client, hub, owner), 409, "REFRESH_TOO_SOON")


def test_a_refresh_stores_the_latest_commits_newest_first(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, member, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer(commits_of(3))
    before = datetime.now(UTC)

    resp = refresh(client, hub, member)

    assert resp.status_code == 200, resp.text
    seen = resp.json()["data"]
    assert [commit["message"] for commit in seen["commits"]] == [f"Commit {n}" for n in range(3)]
    assert set(seen["commits"][0]) == COMMIT
    assert seen["commits"][0]["sha"] == f"{0:040x}"
    # the commit date, not the author's date, and the author's own name, not the committer's
    assert seen["commits"][0]["committed_at"].startswith("2026-11-14T09:30:00")
    assert seen["commits"][0]["author_name"] == "Amina Bello"
    assert before <= datetime.fromisoformat(seen["commits_refreshed_at"]) <= datetime.now(UTC)
    assert github_commits.requests == [
        ("https://api.github.com/repos/acodev/village-ledger/commits?per_page=20", 10)
    ]
    for reader in (owner, member):
        assert answer(client, hub, reader)["commits"] == seen["commits"]
    assert [row.position for row in stored_commits(hub)] == [0, 1, 2]


def test_a_refresh_replaces_the_commits_and_keeps_twenty(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, _, _ = building_hub(client)
    with_repository(client, hub, owner, count=3)
    github_commits.answer(commits_of(25)[::-1])

    seen = refresh(client, hub, owner).json()["data"]

    assert [commit["message"] for commit in seen["commits"]] == [
        f"Commit {n}" for n in range(24, 4, -1)
    ]
    assert len(stored_commits(hub)) == 20
    # a repository with no commits yet gives an empty list
    set_hub(hub, commits_refreshed_at=datetime.now(UTC) - REFRESH_WAIT * 2)
    github_commits.answer([])
    assert refresh(client, hub, owner).json()["data"]["commits"] == []


@pytest.mark.parametrize(
    ("message", "stored"),
    [
        ("Add retries\n\nLong body that is not kept", "Add retries"),
        ("Add retries\r\nbody", "Add retries"),
        ("  padded  \nbody", "padded"),
        ("a" * 250, "a" * 200),
        ("é" * 201, "é" * 200),
        ("\U0001f600" * 201, "\U0001f600" * 200),
        ("nu\u0000ll", "null"),
        ("bad \ud800 text", "bad ? text"),
        ("<script>alert(1)</script> **bold** [x](y)", "<script>alert(1)</script> **bold** [x](y)"),
        ("", "abcdef1"),
        ("\n\nonly a body", "abcdef1"),
        ("   \nbody", "abcdef1"),
        ("\u0000", "abcdef1"),
    ],
    ids=repr,
)
def test_a_commit_message_is_kept_as_plain_text_cut_and_never_empty(
    client: TestClient, github_commits: FakeGitHub, message: str, stored: str
) -> None:
    hub, owner, _, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    # a sha that starts with abcdef1, so a message made of it can be told apart
    github_commits.answer([commit_item(0xABCDEF1 << 132, message)])

    seen = refresh(client, hub, owner).json()["data"]

    assert [commit["message"] for commit in seen["commits"]] == [stored]
    assert [row.message for row in stored_commits(hub)] == [stored]


@pytest.mark.parametrize(
    ("name", "stored"),
    [
        ("Kwame Mensah", "Kwame Mensah"),
        ("x" * 150, "x" * 100),
        ("é" * 101, "é" * 100),
        ("Ama\u0000ta", "Amata"),
        ("  Ama  ", "Ama"),
        ("", ""),
    ],
    ids=repr,
)
def test_an_author_name_is_kept_as_the_commit_records_it_cut_to_100(
    client: TestClient, github_commits: FakeGitHub, name: str, stored: str
) -> None:
    hub, owner, _, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer([commit_item(1, "Fix", name)])

    seen = refresh(client, hub, owner).json()["data"]

    assert [commit["author_name"] for commit in seen["commits"]] == [stored]


def test_a_second_refresh_within_a_minute_is_refused_and_does_not_call_github(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, member, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer(commits_of(2))
    assert refresh(client, hub, owner).status_code == 200

    for caller in (owner, member):
        resp = refresh(client, hub, caller)
        assert_error(resp, 409, "REFRESH_TOO_SOON")
        assert re.search(r"in (59|60) seconds", resp.json()["detail"]["message"])
    assert len(github_commits.requests) == 1

    # 40 seconds ago leaves about 20 to wait, and 61 leaves none
    set_hub(hub, commits_refreshed_at=datetime.now(UTC) - timedelta(seconds=40))
    resp = refresh(client, hub, member)
    assert_error(resp, 409, "REFRESH_TOO_SOON")
    seconds = int(re.search(r"in (\d+) seconds", resp.json()["detail"]["message"]).group(1))
    assert 18 <= seconds <= 20
    set_hub(hub, commits_refreshed_at=datetime.now(UTC) - timedelta(seconds=61))
    assert refresh(client, hub, member).status_code == 200
    assert len(github_commits.requests) == 2


def test_a_refresh_needs_a_repository(client: TestClient, github_commits: FakeGitHub) -> None:
    hub, owner, member, _ = building_hub(client)

    for caller in (owner, member):
        assert_error(refresh(client, hub, caller), 409, "REPOSITORY_NOT_SET")
    assert github_commits.requests == []


def http_error(code: int) -> HTTPError:
    return HTTPError("https://api.github.com", code, "refused", {}, None)


FAILURES = {
    "not found": http_error(404),
    "private": http_error(403),
    "rate limited": http_error(429),
    "server error": http_error(500),
    "unreachable": URLError("no route to host"),
    "timeout": TimeoutError("timed out"),
    "connection reset": ConnectionResetError("reset by peer"),
}
BAD_ANSWERS = {
    "not json": b"<html>Bad gateway</html>",
    "an object": b'{"message": "Not Found"}',
    "null": b"null",
    "items that are not objects": b'["a", 1]',
    "no commit": b'[{"sha": "' + b"a" * 40 + b'"}]',
    "a bad sha": json.dumps([commit_item(1) | {"sha": "XYZ"}]).encode(),
    "a long sha": json.dumps([commit_item(1) | {"sha": "a" * 41}]).encode(),
    "no date": json.dumps([{**commit_item(1), "commit": {"message": "m", "author": {}}}]).encode(),
    "a date with no zone": json.dumps([commit_item(1, committer="2026-11-14T09:30:00")]).encode(),
    "a date that is not one": json.dumps([commit_item(1, committer="yesterday")]).encode(),
    "a message that is not text": json.dumps(
        [{**commit_item(1), "commit": {"message": 5, "author": {"name": "A"}}}]
    ).encode(),
    "the same commit twice": json.dumps([commit_item(1), commit_item(1)]).encode(),
}


@pytest.mark.parametrize(
    "failure", [*FAILURES.values(), *BAD_ANSWERS.values()], ids=[*FAILURES, *BAD_ANSWERS]
)
def test_a_repository_github_cannot_give_is_a_502_and_the_old_commits_stay(
    client: TestClient, github_commits: FakeGitHub, failure: Exception | bytes
) -> None:
    hub, owner, member, _ = building_hub(client)
    with_repository(client, hub, owner, count=3)
    before = answer(client, hub, owner)
    if isinstance(failure, Exception):
        github_commits.error = failure
    else:
        github_commits.body = failure

    resp = refresh(client, hub, member)

    assert_error(resp, 502, "REPOSITORY_UNAVAILABLE")
    assert answer(client, hub, owner) == before
    # nothing was refreshed, so there is no wait: the next try goes through
    github_commits.error, github_commits.body = None, json.dumps(commits_of(1)).encode()
    assert len(refresh(client, hub, member).json()["data"]["commits"]) == 1


def test_a_refresh_does_not_hold_the_hub_while_it_waits_for_github(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer(commits_of(2))
    # claiming locks the hub row, so it would wait if the refresh still held it
    results = during_the_fetch(github_commits, lambda: claim(client, hub, member, piece["id"]))

    assert refresh(client, hub, owner).status_code == 200

    assert [resp.status_code for resp in results] == [200]
    assert piece_by_name(client, hub, owner, "Mobile app")["claimed_by"]["id"] == str(member.id)


def test_a_refresh_is_dropped_when_the_address_changed_while_github_answered(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, _, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer(commits_of(2))
    other = "https://github.com/acodev/other"
    results = during_the_fetch(github_commits, lambda: set_repository(client, hub, owner, other))

    assert_error(refresh(client, hub, owner), 409, "REPOSITORY_CHANGED")

    assert [resp.status_code for resp in results] == [200]
    seen = answer(client, hub, owner)
    assert seen["repository_url"] == other and seen["commits"] == []


def test_two_refreshes_at_once_store_one_and_refuse_the_other(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, member, _ = building_hub(client)
    assert set_repository(client, hub, owner).status_code == 200
    github_commits.answer(commits_of(2))
    results = during_the_fetch(github_commits, lambda: refresh(client, hub, member))

    late = refresh(client, hub, owner)

    # the second request finished first, and the first finds it refreshed a moment ago
    assert [resp.status_code for resp in results] == [200]
    assert_error(late, 409, "REFRESH_TOO_SOON")
    assert len(stored_commits(hub)) == 2


def test_the_team_keeps_refreshing_commits_in_review_but_cannot_change_the_rest(
    client: TestClient, github_commits: FakeGitHub
) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    with_repository(client, hub, owner)
    assert claim(client, hub, member, piece["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    github_commits.answer(commits_of(5))

    resp = refresh(client, hub, member)

    assert resp.status_code == 200 and len(resp.json()["data"]["commits"]) == 5
    for caller in (owner, member):
        seen = answer(client, hub, caller)
        assert seen["repository_url"] == REPOSITORY and len(seen["commits"]) == 5
        assert seen["pieces"][0]["claimed_by"]["id"] == str(member.id)
        assert (seen["can_refresh"], seen["can_set_repository"]) == (True, False)
        assert not any(p["can_claim"] or p["can_release"] for p in seen["pieces"])
    for resp in (
        claim(client, hub, member, piece["id"]),
        free(client, hub, member, piece["id"]),
        set_repository(client, hub, owner, None),
    ):
        assert_error(resp, 409, "PHASE_CLOSED")
    # a closed phase is reported before a missing piece
    assert_error(claim(client, hub, member, UNKNOWN_ID), 409, "PHASE_CLOSED")


@pytest.mark.parametrize(
    ("confirmed", "code"), [(False, "TEAM_NOT_CONFIRMED"), (True, "PHASE_NOT_STARTED")]
)
def test_the_build_tab_is_closed_until_the_hub_reaches_build(
    client: TestClient, github_commits: FakeGitHub, confirmed: bool, code: str
) -> None:
    owner = make_user()
    hub = make_hub(owner)
    if confirmed:
        assert confirm(client, hub, owner).status_code == 200

    assert_error(read(client, hub, owner), 409, code)
    for resp in writes(client, hub, owner):
        assert_error(resp, 409, code)
    assert github_commits.requests == []


def test_in_design_the_build_tab_is_still_closed(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    piece = make_piece(client, hub, owner)

    assert_error(read(client, hub, member), 409, "PHASE_NOT_STARTED")
    assert_error(claim(client, hub, member, piece["id"]), 409, "PHASE_NOT_STARTED")
    assert_error(refresh(client, hub, member), 409, "PHASE_NOT_STARTED")
    # going back to design closes it again, and the claims stay for when it reopens
    assert move(client, hub, owner, "build").status_code == 200
    assert claim(client, hub, member, piece["id"]).status_code == 200
    assert move(client, hub, owner, "design").status_code == 200
    assert_error(read(client, hub, member), 409, "PHASE_NOT_STARTED")
    assert move(client, hub, owner, "build").status_code == 200
    assert piece_by_name(client, hub, owner, "Mobile app")["claimed_by"]["id"] == str(member.id)


def test_an_archived_hub_takes_no_changes_and_stays_readable(client: TestClient) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    with_repository(client, hub, owner)
    assert claim(client, hub, member, piece["id"]).status_code == 200
    outsider = make_user()
    set_hub(hub, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))

    for resp in writes(client, hub, owner):
        assert_error(resp, 409, "HUB_ARCHIVED")
    # membership is checked first, and the archive before the piece and who holds it
    assert_error(claim(client, hub, outsider, UNKNOWN_ID), 403, "NOT_HUB_MEMBER")
    assert_error(free(client, hub, owner, piece["id"]), 409, "HUB_ARCHIVED")
    for reader in (owner, member):
        seen = answer(client, hub, reader)
        assert len(seen["commits"]) == 3 and seen["pieces"][0]["claimed_by"]
        assert not seen["can_set_repository"] and not seen["can_refresh"]
        assert not any(p["can_claim"] or p["can_release"] for p in seen["pieces"])


def test_the_four_flags_say_what_the_viewer_may_do_now(client: TestClient) -> None:
    hub, owner, member, (held, free_piece) = building_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    assert claim(client, hub, member, held["id"]).status_code == 200

    def flags(viewer: User) -> tuple[Any, ...]:
        seen = answer(client, hub, viewer)
        return (
            seen["can_set_repository"],
            seen["can_refresh"],
            *(v for p in seen["pieces"] for v in (p["can_claim"], p["can_release"])),
        )

    # (set repository, refresh, then claim and release of each piece: held, free)
    assert flags(owner) == (True, False, False, True, True, False)
    assert flags(member) == (False, False, False, True, True, False)
    assert flags(other) == (False, False, False, False, True, False)
    # a flag that is true is an action that works, and one that is false is refused
    assert_error(free(client, hub, other, held["id"]), 403, "NOT_PIECE_HOLDER")
    assert_error(set_repository(client, hub, member), 403, "NOT_HUB_OWNER")
    assert_error(refresh(client, hub, owner), 409, "REPOSITORY_NOT_SET")
    assert claim(client, hub, other, free_piece["id"]).status_code == 200
    assert flags(other) == (False, False, False, False, False, True)

    assert set_repository(client, hub, owner).status_code == 200
    fake_github().answer(commits_of(1))
    assert refresh(client, hub, other).status_code == 200
    # the flag ignores the minute to wait that follows a refresh
    assert flags(owner)[:2] == (True, True) and flags(other)[:2] == (False, True)
    assert_error(refresh(client, hub, owner), 409, "REFRESH_TOO_SOON")


@pytest.mark.parametrize(
    "status",
    [
        None,
        HubMemberStatus.INVITED,
        HubMemberStatus.REQUESTED,
        HubMemberStatus.DECLINED,
        HubMemberStatus.LEFT,
        HubMemberStatus.REMOVED,
    ],
)
def test_only_active_members_see_or_use_the_build_tab(
    client: TestClient, github_commits: FakeGitHub, status: HubMemberStatus | None
) -> None:
    hub, owner, _, (piece, _) = building_hub(client)
    with_repository(client, hub, owner)
    before = len(github_commits.requests)
    outsider = make_user()
    if status is not None:
        add_member(hub, outsider, status)

    assert_error(read(client, hub, outsider), 403, "NOT_HUB_MEMBER")
    for resp in (
        claim(client, hub, outsider, piece["id"]),
        free(client, hub, outsider, piece["id"]),
        set_repository(client, hub, outsider, None),
        refresh(client, hub, outsider),
    ):
        assert_error(resp, 403, "NOT_HUB_MEMBER")
    assert len(github_commits.requests) == before
    assert answer(client, hub, owner)["pieces"][0]["claimed_by"] is None


def test_the_build_tab_needs_a_signed_in_person_and_a_hub_that_exists(client: TestClient) -> None:
    hub, owner, _, _ = building_hub(client)
    routes = (
        ("GET", "/build"),
        ("POST", f"/pieces/{UNKNOWN_ID}/claim"),
        ("DELETE", f"/pieces/{UNKNOWN_ID}/claim"),
        ("PUT", "/repository"),
        ("POST", "/commits/refresh"),
    )

    for method, path in routes:
        body = {"repository_url": None}
        assert client.request(method, f"/v1/hubs/{hub.id}{path}", json=body).status_code == 401
        resp = client.request(
            method, f"/v1/hubs/{UNKNOWN_ID}{path}", headers=auth(owner), json=body
        )
        assert_error(resp, 404, "NOT_FOUND")


def test_a_malformed_id_in_the_path_is_a_422(client: TestClient) -> None:
    hub, owner, _, _ = building_hub(client)

    assert claim(client, hub, owner, "nope").status_code == 422
    assert free(client, hub, owner, "nope").status_code == 422
    assert client.get("/v1/hubs/nope/build", headers=auth(owner)).status_code == 422


def test_a_hub_of_the_other_world_is_a_404_and_the_demo_reads_but_never_writes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    real_hub, real_owner, _, _ = building_hub(client)
    demo_hub, demo_owner, demo_member, (piece, _) = building_hub(client)
    with_repository(client, demo_hub, demo_owner)
    assert claim(client, demo_hub, demo_member, piece["id"]).status_code == 200
    visitor = make_user()

    async def to_demo(session: AsyncSession) -> None:
        ids = [visitor.id, demo_owner.id, demo_member.id]
        await session.execute(update(User).where(User.id.in_(ids)).values(is_demo=True))
        await session.commit()

    run(to_demo)

    assert_error(read(client, real_hub, visitor), 404, "NOT_FOUND")
    assert_error(read(client, demo_hub, real_owner), 404, "NOT_FOUND")
    assert_error(claim(client, demo_hub, real_owner, piece["id"]), 404, "NOT_FOUND")
    seen = answer(client, demo_hub, demo_member)
    assert seen["repository_url"] == REPOSITORY and len(seen["commits"]) == 3
    assert seen["pieces"][0]["claimed_by"]["id"] == str(demo_member.id)
    for resp in writes(client, demo_hub, demo_member):
        assert_error(resp, 403, "DEMO_READ_ONLY")
    assert answer(client, demo_hub, demo_member) == seen


def test_the_design_routes_do_not_show_claims_and_keep_working(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    piece = make_piece(client, hub, owner)
    assert move(client, hub, owner, "build").status_code == 200
    assert claim(client, hub, member, piece["id"]).status_code == 200

    seen = read_design(client, hub, owner)

    assert [set(item) for item in seen["pieces"]] == [PIECE_KEYS]
    assert "claimed" not in json.dumps(seen)
    # a piece cannot be deleted in build, and in design, after going back, it can
    assert_error(remove_piece(client, hub, owner, piece["id"]), 409, "PHASE_CLOSED")
    assert move(client, hub, owner, "design").status_code == 200
    assert remove_piece(client, hub, owner, piece["id"]).status_code == 204
    assert move(client, hub, owner, "build").status_code == 200
    assert answer(client, hub, owner)["pieces"] == []


def test_every_write_waits_for_the_hub_row_lock(client: TestClient) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    base = f"/v1/hubs/{hub.id}"
    sends: list[Callable[[httpx.AsyncClient], Awaitable[httpx.Response]]] = [
        lambda http: http.post(f"{base}/pieces/{piece['id']}/claim", headers=auth(member)),
        lambda http: http.delete(f"{base}/pieces/{piece['id']}/claim", headers=auth(member)),
        lambda http: http.put(
            f"{base}/repository", headers=auth(owner), json={"repository_url": REPOSITORY}
        ),
    ]

    async def while_the_hub_is_locked(send: Callable[..., Awaitable[httpx.Response]]) -> bool:
        async with db_session() as holder:
            await holder.execute(
                text("SELECT id FROM hubs WHERE id = :id FOR UPDATE"), {"id": str(hub.id)}
            )
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
                pending = asyncio.create_task(send(http))
                async with db_session() as probe:
                    for _ in range(200):
                        waiting = await probe.scalar(
                            text(
                                "SELECT count(*) FROM pg_stat_activity"
                                " WHERE wait_event_type = 'Lock' AND datname = current_database()"
                            )
                        )
                        if waiting or pending.done():
                            break
                        await asyncio.sleep(0.02)
                blocked = not pending.done()
                await holder.rollback()
                assert (await pending).status_code in (200, 204)
                return blocked

    for send in sends:
        assert asyncio.run(while_the_hub_is_locked(send)) is True


def test_the_tables_refuse_what_the_routes_never_send() -> None:
    owner = make_user()
    hub = make_hub(owner)
    piece_id = insert_pieces(hub, owner, live=1)[0]

    def attempt(constraint: str, *statements: Any) -> None:
        async def work(session: AsyncSession) -> None:
            for statement in statements:
                await session.execute(statement)
            await session.commit()

        with pytest.raises(IntegrityError, match=constraint):
            run(work)

    def claim_row(**values: Any) -> Any:
        return update(HubPiece).where(HubPiece.id == piece_id).values(**values)

    def repository(value: str) -> Any:
        return update(Hub).where(Hub.id == hub.id).values(repository_url=value)

    def commit_row(**values: Any) -> Any:
        row = {"sha": "a" * 40, "message": "Fix", "author_name": "Ama", "position": 0}
        row |= {"hub_id": hub.id, "committed_at": datetime.now(UTC)} | values
        return HubCommit.__table__.insert().values(**row)

    # a piece is held with its time or not at all
    attempt("hub_pieces_claimed", claim_row(claimed_by=owner.id))
    attempt("hub_pieces_claimed", claim_row(claimed_at=datetime.now(UTC)))
    for value in (
        "http://github.com/o/r",
        "https://github.com/o",
        "https://github.com/o/r/",
        "https://github.com/o/r/tree/main",
        "https://github.com/o/r r",
        "https://gitlab.com/o/r",
        "https://github.com/" + "a" * 200 + "/r",
        "",
    ):
        attempt("hubs_repository_url_format", repository(value))
    attempt("hub_commits_sha_format", commit_row(sha="A" * 40))
    attempt("hub_commits_sha_format", commit_row(sha="a" * 39))
    attempt("hub_commits_message_length", commit_row(message=""))
    attempt("hub_commits_message_length", commit_row(message="x" * 201))
    attempt("hub_commits_author_length", commit_row(author_name="x" * 101))
    attempt("hub_commits_position", commit_row(position=-1))
    attempt("hub_commits_pkey", commit_row(), commit_row(position=1))

    async def accepted(session: AsyncSession) -> int:
        await session.execute(repository("https://github.com/a.b_c-d/e.f-g_h"))
        await session.execute(claim_row(claimed_by=owner.id, claimed_at=datetime.now(UTC)))
        await session.execute(commit_row(message="x" * 200, author_name="", position=0))
        await session.commit()
        return await session.scalar(
            select(func.count()).select_from(HubCommit).where(HubCommit.hub_id == hub.id)
        )

    assert run(accepted) == 1
    # and a piece that is held cannot lose its time
    attempt("hub_pieces_claimed", claim_row(claimed_at=None))
