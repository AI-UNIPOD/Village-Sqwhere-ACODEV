"""The review checklist: checks against each piece, ticking them, and finishing the hub."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.main import app
from app.models import Hub, HubCheck, HubMemberStatus, HubPiece, HubStatus, User
from tests.conftest import test_async_session as db_session
from tests.conftest import test_engine
from tests.hub_support import add_member, auth, make_hub, make_user, run
from tests.test_hub_build import building_hub, claim, free
from tests.test_hub_design import (
    AUTHOR_KEYS,
    UNKNOWN_ID,
    designing_hub,
    insert_pieces,
    make_piece,
    stored,
)
from tests.test_hub_notes import set_hub
from tests.test_hub_phases import assert_error, confirm, move

ANSWER_KEYS = {"finished_at", "can_add", "can_finish", "open_checks", "pieces"}
PIECE_KEYS = {"id", "name", "summary", "claimed_by", "checks"}
CHECK_KEYS = {
    "id",
    "text",
    "created_by",
    "created_at",
    "ticked_by",
    "ticked_at",
    "can_tick",
    "can_untick",
    "can_delete",
}
SCRIPT = Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "021-hub-review.sql"


def read(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.get(f"/v1/hubs/{hub.id}/review", headers=auth(caller))


def review(client: TestClient, hub: Hub, caller: User) -> dict:
    resp = read(client, hub, caller)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def add_check(
    client: TestClient, hub: Hub, caller: User, piece_id: Any, text: Any = "Retries"
) -> Any:
    return client.post(
        f"/v1/hubs/{hub.id}/pieces/{piece_id}/checks", headers=auth(caller), json={"text": text}
    )


def tick(client: TestClient, hub: Hub, caller: User, check_id: Any) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/checks/{check_id}/tick", headers=auth(caller))


def untick(client: TestClient, hub: Hub, caller: User, check_id: Any) -> Any:
    return client.delete(f"/v1/hubs/{hub.id}/checks/{check_id}/tick", headers=auth(caller))


def remove(client: TestClient, hub: Hub, caller: User, check_id: Any) -> Any:
    return client.delete(f"/v1/hubs/{hub.id}/checks/{check_id}", headers=auth(caller))


def finish(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/finish", headers=auth(caller))


def writes(client: TestClient, hub: Hub, caller: User) -> list[Any]:
    """The five writes and finishing, aimed at ids that exist nowhere, so only the checks before
    the lookup can refuse them."""
    return [
        add_check(client, hub, caller, UNKNOWN_ID),
        tick(client, hub, caller, UNKNOWN_ID),
        untick(client, hub, caller, UNKNOWN_ID),
        remove(client, hub, caller, UNKNOWN_ID),
        finish(client, hub, caller),
    ]


def make_check(
    client: TestClient, hub: Hub, caller: User, piece: dict, text: str = "Retries"
) -> dict:
    resp = add_check(client, hub, caller, piece["id"], text)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


def reviewing_hub(client: TestClient) -> tuple[Hub, User, User, list[dict]]:
    """A hub in review with its owner, one active member and two pieces nobody builds."""
    hub, owner, member, pieces = building_hub(client)
    assert move(client, hub, owner, "review").status_code == 200
    return hub, owner, member, pieces


def checks_of(client: TestClient, hub: Hub, caller: User) -> list[dict]:
    return [check for piece in review(client, hub, caller)["pieces"] for check in piece["checks"]]


def flags(client: TestClient, hub: Hub, viewer: User) -> tuple[Any, ...]:
    """can_add and can_finish, then tick, untick and delete of each check in the answer."""
    seen = review(client, hub, viewer)
    return (
        seen["can_add"],
        seen["can_finish"],
        *(
            (check["can_tick"], check["can_untick"], check["can_delete"])
            for piece in seen["pieces"]
            for check in piece["checks"]
        ),
    )


def delete_piece(piece_id: str) -> None:
    async def work(session: AsyncSession) -> None:
        await session.execute(
            update(HubPiece)
            .where(HubPiece.id == UUID(piece_id))
            .values(deleted_at=datetime.now(UTC))
        )
        await session.commit()

    run(work)


def test_the_review_lists_live_pieces_with_their_live_checks_oldest_first(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    first, second, gone = (
        make_piece(client, hub, owner, n) for n in ("Mobile app", "Payouts API", "Gone")
    )
    assert move(client, hub, owner, "build").status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    older = make_check(client, hub, owner, first, "Works offline")
    newer = make_check(client, hub, member, first, "  Syncs when back online  ")
    removed = make_check(client, hub, member, first, "Removed")
    on_gone = make_check(client, hub, owner, gone, "Never shown")
    assert remove(client, hub, member, removed["id"]).status_code == 204
    delete_piece(gone["id"])

    for reader in (owner, member):
        seen = review(client, hub, reader)
        assert set(seen) == ANSWER_KEYS
        assert seen["finished_at"] is None and seen["can_add"] is True
        assert [piece["id"] for piece in seen["pieces"]] == [first["id"], second["id"]]
        mobile, payouts = seen["pieces"]
        assert set(mobile) == PIECE_KEYS and mobile["claimed_by"] is None
        assert [check["id"] for check in mobile["checks"]] == [older["id"], newer["id"]]
        assert payouts["checks"] == []
        assert on_gone["id"] not in str(seen)
        for check in mobile["checks"]:
            assert set(check) == CHECK_KEYS and set(check["created_by"]) == AUTHOR_KEYS
            assert check["ticked_by"] is None and check["ticked_at"] is None
        # the deleted check and the deleted piece's check are not counted
        assert seen["open_checks"] == 2
    assert [check["text"] for check in mobile["checks"]] == [
        "Works offline",
        "Syncs when back online",
    ]
    assert mobile["checks"][1]["created_by"]["id"] == str(member.id)


def test_any_member_adds_a_check_and_the_holder_may_add_one_to_their_own_piece(
    client: TestClient,
) -> None:
    hub, owner, member, (piece, other_piece) = building_hub(client)
    assert claim(client, hub, member, piece["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200

    for caller, target in ((owner, piece), (member, piece), (member, other_piece)):
        resp = add_check(client, hub, caller, target["id"], "  Handles a lost connection  ")

        assert resp.status_code == 201, resp.text
        added = resp.json()["data"]
        assert set(added) == CHECK_KEYS and added["text"] == "Handles a lost connection"
        assert added["created_by"]["id"] == str(caller.id) and added["created_at"]
        assert added["ticked_by"] is None and added["ticked_at"] is None
        # the writer may remove it; the holder cannot tick a check of their own piece
        assert added["can_delete"] is True and added["can_untick"] is False
        assert added["can_tick"] is (caller != member or target is other_piece)
    assert len(checks_of(client, hub, owner)) == 3


@pytest.mark.parametrize("value", ["", "   ", "x" * 201, "nu\u0000ll", 5, None, ["a"]], ids=repr)
def test_a_bad_check_text_is_a_422_and_saves_nothing(client: TestClient, value: Any) -> None:
    hub, owner, _, (piece, _) = reviewing_hub(client)

    resp = add_check(client, hub, owner, piece["id"], value)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "text"]
    assert checks_of(client, hub, owner) == []


def test_a_check_may_be_200_characters_counted_as_characters(client: TestClient) -> None:
    hub, owner, _, (piece, _) = reviewing_hub(client)

    for body in ("x" * 200, "é" * 200):
        assert add_check(client, hub, owner, piece["id"], body).status_code == 201
    for body in ({}, {"text": "ok", "created_by": "x"}, {"body": "ok"}):
        resp = client.post(
            f"/v1/hubs/{hub.id}/pieces/{piece['id']}/checks", headers=auth(owner), json=body
        )
        assert resp.status_code == 422, body


def test_a_piece_that_is_unknown_deleted_or_of_another_hub_is_a_404(client: TestClient) -> None:
    hub, owner, _, (piece, gone) = reviewing_hub(client)
    elsewhere, elsewhere_owner, _, (foreign, _) = reviewing_hub(client)
    delete_piece(gone["id"])

    for piece_id in (UNKNOWN_ID, gone["id"], foreign["id"]):
        assert_error(add_check(client, hub, owner, piece_id), 404, "PIECE_NOT_FOUND")
    assert checks_of(client, elsewhere, elsewhere_owner) == []
    assert add_check(client, hub, owner, piece["id"]).status_code == 201


def test_a_piece_keeps_at_most_ten_checks_that_are_not_deleted(client: TestClient) -> None:
    hub, owner, member, (piece, other_piece) = reviewing_hub(client)
    made = [make_check(client, hub, owner, piece, f"Check {number}") for number in range(10)]

    resp = add_check(client, hub, member, piece["id"])

    assert_error(resp, 409, "CHECK_LIMIT")
    assert "10 checks" in resp.json()["detail"]["message"]
    # a ticked check still counts, another piece has its own ten, and a deleted check frees a place
    assert tick(client, hub, member, made[0]["id"]).status_code == 200
    assert_error(add_check(client, hub, member, piece["id"]), 409, "CHECK_LIMIT")
    assert add_check(client, hub, member, other_piece["id"]).status_code == 201
    assert remove(client, hub, owner, made[1]["id"]).status_code == 204
    assert add_check(client, hub, member, piece["id"]).status_code == 201
    assert_error(add_check(client, hub, owner, piece["id"]), 409, "CHECK_LIMIT")


def test_a_teammate_ticks_a_check_and_everyone_reads_who_did(client: TestClient) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    before = datetime.now(UTC)

    resp = tick(client, hub, member, check["id"])

    assert resp.status_code == 200, resp.text
    ticked = resp.json()["data"]
    assert set(ticked) == CHECK_KEYS and set(ticked["ticked_by"]) == AUTHOR_KEYS
    assert ticked["ticked_by"]["id"] == str(member.id)
    assert before <= datetime.fromisoformat(ticked["ticked_at"]) <= datetime.now(UTC)
    assert (ticked["can_tick"], ticked["can_untick"], ticked["can_delete"]) == (False, True, False)
    for reader in (owner, member):
        seen = review(client, hub, reader)
        assert seen["open_checks"] == 0
        mine = seen["pieces"][0]["checks"][0]
        assert (mine["ticked_by"], mine["ticked_at"]) == (ticked["ticked_by"], ticked["ticked_at"])


def test_nobody_ticks_a_check_of_a_piece_they_build_not_even_the_owner(
    client: TestClient,
) -> None:
    hub, owner, member, (by_member, by_owner) = building_hub(client)
    assert claim(client, hub, member, by_member["id"]).status_code == 200
    assert claim(client, hub, owner, by_owner["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    one = make_check(client, hub, owner, by_member)
    two = make_check(client, hub, member, by_owner)

    refused = tick(client, hub, member, one["id"])
    assert_error(refused, 403, "OWN_PIECE")
    assert refused.json()["detail"]["message"] == (
        "You are building this piece, so a teammate ticks its checks."
    )
    assert_error(tick(client, hub, owner, two["id"]), 403, "OWN_PIECE")
    assert review(client, hub, owner)["open_checks"] == 2
    # a teammate of each holder ticks, and the holders tick each other's
    assert tick(client, hub, owner, one["id"]).status_code == 200
    assert tick(client, hub, member, two["id"]).status_code == 200


def test_anyone_ticks_a_check_of_a_piece_nobody_builds(client: TestClient) -> None:
    hub, owner, member, (held, free_piece) = building_hub(client)
    assert claim(client, hub, member, held["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    first, second = (
        make_check(client, hub, owner, free_piece),
        make_check(client, hub, owner, free_piece),
    )

    assert first["can_tick"] is True
    # the owner ticks a check they wrote, and so does a member who holds another piece
    assert tick(client, hub, owner, first["id"]).status_code == 200
    assert tick(client, hub, member, second["id"]).status_code == 200


@pytest.mark.parametrize("how", ["leaves", "is removed"])
def test_a_holder_who_left_the_hub_no_longer_counts(client: TestClient, how: str) -> None:
    hub, owner, member, (piece, _) = building_hub(client)
    assert claim(client, hub, member, piece["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    check = make_check(client, hub, owner, piece)
    if how == "leaves":
        resp = client.post(f"/v1/hubs/{hub.id}/membership/leave", headers=auth(member))
    else:
        resp = client.post(f"/v1/hubs/{hub.id}/members/{member.id}/remove", headers=auth(owner))
    assert resp.status_code == 200, resp.text

    seen = review(client, hub, owner)["pieces"][0]

    assert seen["claimed_by"] is None and seen["checks"][0]["can_tick"] is True
    assert tick(client, hub, owner, check["id"]).status_code == 200


def test_a_check_is_ticked_once_and_a_missing_check_is_a_404(client: TestClient) -> None:
    hub, owner, member, (piece, gone) = reviewing_hub(client)
    elsewhere, elsewhere_owner, _, (foreign, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    removed = make_check(client, hub, owner, piece, "Removed")
    on_gone = make_check(client, hub, owner, gone)
    foreign_check = make_check(client, elsewhere, elsewhere_owner, foreign)
    assert remove(client, hub, owner, removed["id"]).status_code == 204
    delete_piece(gone["id"])
    assert tick(client, hub, member, check["id"]).status_code == 200

    assert_error(tick(client, hub, owner, check["id"]), 409, "CHECK_TICKED")
    assert_error(tick(client, hub, member, check["id"]), 409, "CHECK_TICKED")
    for check_id in (UNKNOWN_ID, removed["id"], on_gone["id"], foreign_check["id"]):
        assert_error(tick(client, hub, owner, check_id), 404, "CHECK_NOT_FOUND")
        assert_error(untick(client, hub, owner, check_id), 404, "CHECK_NOT_FOUND")
        assert_error(remove(client, hub, owner, check_id), 404, "CHECK_NOT_FOUND")
    assert review(client, hub, owner)["pieces"][0]["checks"][0]["ticked_by"]["id"] == str(member.id)


def test_the_member_who_ticked_or_the_owner_unticks_and_nobody_else(client: TestClient) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    one, two = (make_check(client, hub, owner, piece, name) for name in ("One", "Two"))
    assert_error(untick(client, hub, member, one["id"]), 409, "CHECK_NOT_TICKED")
    assert tick(client, hub, member, one["id"]).status_code == 200
    assert tick(client, hub, member, two["id"]).status_code == 200

    assert_error(untick(client, hub, other, one["id"]), 403, "NOT_CHECK_TICKER")
    assert review(client, hub, owner)["open_checks"] == 0
    resp = untick(client, hub, member, one["id"])
    assert resp.status_code == 200
    opened = resp.json()["data"]
    assert opened["ticked_by"] is None and opened["ticked_at"] is None
    assert (opened["can_tick"], opened["can_untick"]) == (True, False)
    assert untick(client, hub, owner, two["id"]).status_code == 200
    assert review(client, hub, owner)["open_checks"] == 2
    assert_error(untick(client, hub, owner, two["id"]), 409, "CHECK_NOT_TICKED")
    # an unticked check is ticked again, by someone else
    assert tick(client, hub, other, one["id"]).status_code == 200


def test_the_writer_or_the_owner_deletes_a_check_and_nobody_else(client: TestClient) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    mine, theirs, ticked = (make_check(client, hub, member, piece, n) for n in ("a", "b", "c"))
    assert tick(client, hub, owner, ticked["id"]).status_code == 200

    assert_error(remove(client, hub, other, mine["id"]), 403, "NOT_CHECK_AUTHOR")
    assert remove(client, hub, member, mine["id"]).status_code == 204
    assert remove(client, hub, owner, theirs["id"]).status_code == 204
    # a ticked check goes too, and the row stays with who removed it
    assert remove(client, hub, member, ticked["id"]).status_code == 204
    assert checks_of(client, hub, owner) == []
    row = stored(HubCheck, mine["id"])
    assert row.deleted_by == member.id and row.deleted_at is not None
    assert stored(HubCheck, theirs["id"]).deleted_by == owner.id
    assert_error(remove(client, hub, member, mine["id"]), 404, "CHECK_NOT_FOUND")


def test_the_flags_say_what_the_viewer_may_do_now(client: TestClient) -> None:
    hub, owner, member, (held, free_piece) = building_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    assert claim(client, hub, member, held["id"]).status_code == 200
    assert move(client, hub, owner, "review").status_code == 200
    one = make_check(client, hub, owner, held)
    two = make_check(client, hub, member, free_piece)

    # (can_add, can_finish), then tick, untick and delete of each check: on the held piece, on the
    # free one
    assert flags(client, hub, owner) == (True, False, (True, False, True), (True, False, True))
    assert flags(client, hub, member) == (True, False, (False, False, False), (True, False, True))
    assert flags(client, hub, other) == (True, False, (True, False, False), (True, False, False))
    assert_error(tick(client, hub, member, one["id"]), 403, "OWN_PIECE")
    assert_error(remove(client, hub, other, one["id"]), 403, "NOT_CHECK_AUTHOR")
    assert tick(client, hub, other, one["id"]).status_code == 200
    assert tick(client, hub, owner, two["id"]).status_code == 200

    assert flags(client, hub, owner) == (True, True, (False, True, True), (False, True, True))
    assert flags(client, hub, member) == (True, False, (False, False, False), (False, False, True))
    assert flags(client, hub, other) == (True, False, (False, True, False), (False, False, False))
    assert_error(untick(client, hub, other, two["id"]), 403, "NOT_CHECK_TICKER")
    assert finish(client, hub, owner).status_code == 200

    # once the hub is finished nothing may be done, for anyone
    for viewer in (owner, member, other):
        assert flags(client, hub, viewer) == (False, False, *[(False,) * 3] * 2)


def test_finishing_needs_every_check_ticked_and_asks_nothing_of_a_hub_with_none(
    client: TestClient,
) -> None:
    hub, owner, member, (piece, other_piece) = reviewing_hub(client)
    empty_hub, empty_owner, _, _ = reviewing_hub(client)
    one = make_check(client, hub, owner, piece, "One")
    two = make_check(client, hub, owner, other_piece, "Two")
    three = make_check(client, hub, member, piece, "Three")
    assert tick(client, hub, member, one["id"]).status_code == 200

    refused = finish(client, hub, owner)
    assert_error(refused, 409, "CHECKS_OPEN")
    assert "Still open: 2" in refused.json()["detail"]["message"]
    assert remove(client, hub, owner, three["id"]).status_code == 204
    assert_error(finish(client, hub, owner), 409, "CHECKS_OPEN")
    assert tick(client, hub, member, two["id"]).status_code == 200
    assert_error(finish(client, hub, member), 403, "NOT_HUB_OWNER")
    assert review(client, hub, owner)["finished_at"] is None

    for target, caller in ((hub, owner), (empty_hub, empty_owner)):
        resp = finish(client, target, caller)
        assert resp.status_code == 200, resp.text
        card = resp.json()["data"]
        assert card["id"] == str(target.id) and card["phase"] == "review"
        assert datetime.fromisoformat(card["finished_at"]) <= datetime.now(UTC)
        assert client.get(f"/v1/hubs/{target.id}", headers=auth(caller)).json()["data"] == card


def test_deleted_checks_and_checks_of_deleted_pieces_do_not_block_finishing(
    client: TestClient,
) -> None:
    hub, owner, member, (piece, gone) = reviewing_hub(client)
    removed = make_check(client, hub, owner, piece, "Removed")
    on_gone = make_check(client, hub, owner, gone, "On a removed piece")
    assert remove(client, hub, owner, removed["id"]).status_code == 204
    delete_piece(gone["id"])

    seen = review(client, hub, owner)
    assert (seen["open_checks"], seen["can_finish"]) == (0, True) and on_gone["id"] not in str(seen)

    assert finish(client, hub, owner).status_code == 200


def test_a_finished_hub_stays_readable_and_takes_no_review_write_or_phase_move(
    client: TestClient,
) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    assert tick(client, hub, member, check["id"]).status_code == 200
    finished_at = finish(client, hub, owner).json()["data"]["finished_at"]

    for caller in (owner, member):
        seen = review(client, hub, caller)
        assert seen["finished_at"] == finished_at and seen["can_add"] is False
        assert seen["pieces"][0]["checks"][0]["ticked_by"]["id"] == str(member.id)
    for resp in (
        add_check(client, hub, member, piece["id"]),
        tick(client, hub, owner, check["id"]),
        untick(client, hub, member, check["id"]),
        remove(client, hub, owner, check["id"]),
        finish(client, hub, owner),
        *writes(client, hub, owner),
    ):
        assert_error(resp, 409, "HUB_FINISHED")
    # the phase does not move, back to build or anywhere else, and a finish is not undone
    assert_error(move(client, hub, owner, "build"), 409, "HUB_FINISHED")
    assert_error(move(client, hub, owner, "review"), 409, "HUB_FINISHED")
    assert review(client, hub, owner)["finished_at"] == finished_at
    assert (
        client.get(f"/v1/hubs/{hub.id}", headers=auth(member)).json()["data"]["phase"] == "review"
    )


def test_a_hub_that_is_not_finished_says_so_on_its_card(client: TestClient) -> None:
    hub, owner, _, _ = reviewing_hub(client)

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]

    assert "finished_at" in card and card["finished_at"] is None


@pytest.mark.parametrize("phase", [None, "brainstorm", "design", "build"])
def test_the_checklist_is_closed_until_the_hub_reaches_review(
    client: TestClient, phase: str | None
) -> None:
    owner = make_user()
    hub = make_hub(owner)
    if phase:
        assert confirm(client, hub, owner).status_code == 200
        for step in ("design", "build")[: ("brainstorm", "design", "build").index(phase)]:
            assert move(client, hub, owner, step).status_code == 200
    code = "TEAM_NOT_CONFIRMED" if phase is None else "PHASE_NOT_STARTED"

    for resp in (read(client, hub, owner), *writes(client, hub, owner)):
        assert_error(resp, 409, code)


@pytest.mark.parametrize("order", ["claim after the tick", "release, tick, claim again"])
def test_a_tick_by_the_member_who_later_holds_the_piece_is_taken_back(
    client: TestClient, order: str
) -> None:
    hub, owner, member, (piece, other) = building_hub(client)
    if order != "claim after the tick":
        assert claim(client, hub, member, piece["id"]).status_code == 200
        assert free(client, hub, member, piece["id"]).status_code == 204
    assert move(client, hub, owner, "review").status_code == 200
    mine = make_check(client, hub, owner, piece)
    elsewhere = make_check(client, hub, owner, other)
    assert tick(client, hub, member, mine["id"]).status_code == 200
    assert tick(client, hub, member, elsewhere["id"]).status_code == 200
    assert move(client, hub, owner, "build").status_code == 200
    assert claim(client, hub, member, piece["id"]).status_code == 200

    assert move(client, hub, owner, "review").status_code == 200

    seen = {check["id"]: check for check in checks_of(client, hub, owner)}
    assert seen[mine["id"]]["ticked_by"] is None and seen[mine["id"]]["ticked_at"] is None
    assert seen[elsewhere["id"]]["ticked_by"]["id"] == str(member.id)
    assert review(client, hub, owner)["open_checks"] == 1
    assert_error(finish(client, hub, owner), 409, "CHECKS_OPEN")
    assert_error(tick(client, hub, member, mine["id"]), 403, "OWN_PIECE")
    assert tick(client, hub, owner, mine["id"]).status_code == 200


def test_going_back_to_build_closes_the_checklist_and_keeps_the_checks(
    client: TestClient,
) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    assert move(client, hub, owner, "build").status_code == 200

    assert_error(read(client, hub, member), 409, "PHASE_NOT_STARTED")
    assert_error(tick(client, hub, member, check["id"]), 409, "PHASE_NOT_STARTED")
    assert move(client, hub, owner, "review").status_code == 200
    assert [item["id"] for item in checks_of(client, hub, member)] == [check["id"]]


def test_an_archived_hub_takes_no_changes_and_stays_readable(client: TestClient) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    outsider = make_user()
    set_hub(hub, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))

    for resp in (*writes(client, hub, owner), add_check(client, hub, member, piece["id"])):
        assert_error(resp, 409, "HUB_ARCHIVED")
    assert_error(tick(client, hub, member, check["id"]), 409, "HUB_ARCHIVED")
    # membership is checked first
    assert_error(add_check(client, hub, outsider, piece["id"]), 403, "NOT_HUB_MEMBER")
    for reader in (owner, member):
        seen = review(client, hub, reader)
        assert seen["can_add"] is False and seen["can_finish"] is False
        assert seen["pieces"][0]["checks"][0]["can_tick"] is False


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
def test_only_active_members_see_or_use_the_checklist(
    client: TestClient, status: HubMemberStatus | None
) -> None:
    hub, owner, _, (piece, _) = reviewing_hub(client)
    check = make_check(client, hub, owner, piece)
    outsider = make_user()
    if status is not None:
        add_member(hub, outsider, status)

    assert_error(read(client, hub, outsider), 403, "NOT_HUB_MEMBER")
    for resp in (
        add_check(client, hub, outsider, piece["id"]),
        tick(client, hub, outsider, check["id"]),
        untick(client, hub, outsider, check["id"]),
        remove(client, hub, outsider, check["id"]),
        finish(client, hub, outsider),
    ):
        assert_error(resp, 403, "NOT_HUB_MEMBER")
    assert review(client, hub, owner)["open_checks"] == 1


def test_the_checklist_needs_a_signed_in_person_and_a_hub_that_exists(
    client: TestClient,
) -> None:
    hub, owner, _, _ = reviewing_hub(client)
    routes = (
        ("GET", "/review"),
        ("POST", f"/pieces/{UNKNOWN_ID}/checks"),
        ("POST", f"/checks/{UNKNOWN_ID}/tick"),
        ("DELETE", f"/checks/{UNKNOWN_ID}/tick"),
        ("DELETE", f"/checks/{UNKNOWN_ID}"),
        ("POST", "/finish"),
    )

    for method, path in routes:
        body = {"text": "ok"}
        assert client.request(method, f"/v1/hubs/{hub.id}{path}", json=body).status_code == 401
        resp = client.request(
            method, f"/v1/hubs/{UNKNOWN_ID}{path}", headers=auth(owner), json=body
        )
        assert_error(resp, 404, "NOT_FOUND")
    assert tick(client, hub, owner, "nope").status_code == 422
    assert remove(client, hub, owner, "nope").status_code == 422
    assert client.get("/v1/hubs/nope/review", headers=auth(owner)).status_code == 422


def test_a_hub_of_the_other_world_is_a_404_and_the_demo_reads_but_never_writes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    real_hub, real_owner, _, _ = reviewing_hub(client)
    demo_hub, demo_owner, demo_member, (piece, _) = reviewing_hub(client)
    check = make_check(client, demo_hub, demo_owner, piece)
    visitor = make_user()

    async def to_demo(session: AsyncSession) -> None:
        ids = [visitor.id, demo_owner.id, demo_member.id]
        await session.execute(update(User).where(User.id.in_(ids)).values(is_demo=True))
        await session.commit()

    run(to_demo)

    assert_error(read(client, real_hub, visitor), 404, "NOT_FOUND")
    assert_error(read(client, demo_hub, real_owner), 404, "NOT_FOUND")
    assert_error(add_check(client, demo_hub, real_owner, piece["id"]), 404, "NOT_FOUND")
    seen = review(client, demo_hub, demo_member)
    assert seen["pieces"][0]["checks"][0]["id"] == check["id"]
    for resp in (
        add_check(client, demo_hub, demo_member, piece["id"]),
        tick(client, demo_hub, demo_member, check["id"]),
        untick(client, demo_hub, demo_member, check["id"]),
        remove(client, demo_hub, demo_member, check["id"]),
        finish(client, demo_hub, demo_owner),
    ):
        assert_error(resp, 403, "DEMO_READ_ONLY")
    assert review(client, demo_hub, demo_member) == seen


def test_every_write_waits_for_the_hub_row_lock(client: TestClient) -> None:
    hub, owner, member, (piece, _) = reviewing_hub(client)
    empty_hub, empty_owner, _, _ = reviewing_hub(client)
    one, two = make_check(client, hub, owner, piece), make_check(client, hub, owner, piece)
    base = f"/v1/hubs/{hub.id}"
    sends: list[tuple[str, Callable[[httpx.AsyncClient], Awaitable[httpx.Response]]]] = [
        (
            str(hub.id),
            lambda http: http.post(
                f"{base}/pieces/{piece['id']}/checks", headers=auth(owner), json={"text": "New"}
            ),
        ),
        (
            str(hub.id),
            lambda http: http.post(f"{base}/checks/{one['id']}/tick", headers=auth(member)),
        ),
        (
            str(hub.id),
            lambda http: http.delete(f"{base}/checks/{one['id']}/tick", headers=auth(owner)),
        ),
        (str(hub.id), lambda http: http.delete(f"{base}/checks/{two['id']}", headers=auth(owner))),
        (
            str(empty_hub.id),
            lambda http: http.post(f"/v1/hubs/{empty_hub.id}/finish", headers=auth(empty_owner)),
        ),
    ]

    async def while_the_hub_is_locked(
        hub_id: str, send: Callable[..., Awaitable[httpx.Response]]
    ) -> bool:
        async with db_session() as holder:
            await holder.execute(
                text("SELECT id FROM hubs WHERE id = :id FOR UPDATE"), {"id": hub_id}
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
                assert (await pending).status_code in (200, 201, 204)
                return blocked

    for hub_id, send in sends:
        assert asyncio.run(while_the_hub_is_locked(hub_id, send)) is True


def test_the_script_runs_twice_and_the_table_refuses_what_the_routes_never_send() -> None:
    owner = make_user()
    hub, elsewhere = make_hub(owner), make_hub(owner)
    here = insert_pieces(hub, owner, live=1)[0]
    there = insert_pieces(elsewhere, owner, live=1)[0]

    async def run_script_twice() -> None:
        async with test_engine.connect() as conn:
            transaction = await conn.begin()
            # asyncpg's own execute takes a script of several statements
            raw = await conn.get_raw_connection()
            for _ in range(2):
                await raw.driver_connection.execute(SCRIPT.read_text(encoding="utf-8"))
            await transaction.rollback()

    asyncio.run(run_script_twice())

    def check(**values: Any) -> HubCheck:
        row = {"hub_id": hub.id, "piece_id": here, "text": "Retries", "created_by": owner.id}
        return HubCheck(**(row | values))

    def attempt(constraint: str, *rows: Any) -> None:
        async def work(session: AsyncSession) -> None:
            session.add_all(rows)
            await session.commit()

        with pytest.raises(IntegrityError, match=constraint):
            run(work)

    now = datetime.now(UTC)
    attempt("hub_checks_text_length", check(text=""))
    attempt("hub_checks_text_length", check(text="x" * 201))
    attempt("hub_checks_text_not_blank", check(text="   "))
    # a check is ticked with its time, and deleted with who deleted it, or neither
    attempt("hub_checks_ticked", check(ticked_by=owner.id))
    attempt("hub_checks_ticked", check(ticked_at=now))
    attempt("hub_checks_deleted", check(deleted_by=owner.id))
    attempt("hub_checks_deleted", check(deleted_at=now))
    # the piece belongs to the check's own hub
    attempt("hub_checks_piece_fk", check(piece_id=there))

    async def accepted(session: AsyncSession) -> None:
        session.add_all(
            [
                check(text="x" * 200),
                check(ticked_by=owner.id, ticked_at=now),
                check(deleted_by=owner.id, deleted_at=now),
            ]
        )
        await session.commit()

    run(accepted)
