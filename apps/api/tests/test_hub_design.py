"""The design sketch: who reads and writes pieces and links, and when."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from itertools import permutations
from typing import Any
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.v1.hub_design import MAX_LINKS, MAX_PIECES
from app.main import app
from app.models import Hub, HubMemberStatus, HubPiece, HubPieceLink, HubStatus, User
from tests.conftest import test_async_session as db_session
from tests.hub_support import add_member, auth, make_hub, make_user, run
from tests.test_hub_notes import set_hub
from tests.test_hub_phases import assert_error, confirm, move

UNKNOWN_ID = "00000000-0000-4000-8000-000000000000"
OTHER_UNKNOWN_ID = "00000000-0000-4000-8000-000000000001"


def design_url(hub: Hub) -> str:
    return f"/v1/hubs/{hub.id}/design"


def read(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.get(design_url(hub), headers=auth(caller))


def add_piece(client: TestClient, hub: Hub, caller: User, name: Any = "Mobile app", **rest: Any):
    return client.post(
        f"/v1/hubs/{hub.id}/pieces", headers=auth(caller), json={"name": name, **rest}
    )


def change_piece(client: TestClient, hub: Hub, caller: User, piece_id: Any, **fields: Any):
    return client.patch(f"/v1/hubs/{hub.id}/pieces/{piece_id}", headers=auth(caller), json=fields)


def remove_piece(client: TestClient, hub: Hub, caller: User, piece_id: Any) -> Any:
    return client.delete(f"/v1/hubs/{hub.id}/pieces/{piece_id}", headers=auth(caller))


def add_link(
    client: TestClient, hub: Hub, caller: User, source: Any, target: Any, label: Any = "sends to"
) -> Any:
    body = {"from_piece_id": str(source), "to_piece_id": str(target), "label": label}
    return client.post(f"/v1/hubs/{hub.id}/links", headers=auth(caller), json=body)


def remove_link(client: TestClient, hub: Hub, caller: User, link_id: Any) -> Any:
    return client.delete(f"/v1/hubs/{hub.id}/links/{link_id}", headers=auth(caller))


def writes(client: TestClient, hub: Hub, caller: User) -> list[Any]:
    """The five writes, each with ids that exist nowhere, so only the checks before the lookup
    can refuse them."""
    return [
        add_piece(client, hub, caller),
        change_piece(client, hub, caller, UNKNOWN_ID, name="Renamed"),
        remove_piece(client, hub, caller, UNKNOWN_ID),
        add_link(client, hub, caller, UNKNOWN_ID, OTHER_UNKNOWN_ID),
        remove_link(client, hub, caller, UNKNOWN_ID),
    ]


def make_piece(client: TestClient, hub: Hub, caller: User, name: str = "Mobile app") -> dict:
    resp = add_piece(client, hub, caller, name)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


def make_link(
    client: TestClient, hub: Hub, caller: User, source: dict, target: dict, label: str = "sends to"
) -> dict:
    resp = add_link(client, hub, caller, source["id"], target["id"], label)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


def design(client: TestClient, hub: Hub, caller: User) -> dict:
    resp = read(client, hub, caller)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def piece_names(client: TestClient, hub: Hub, caller: User) -> list[str]:
    return [piece["name"] for piece in design(client, hub, caller)["pieces"]]


def designing_hub(client: TestClient) -> tuple[Hub, User, User]:
    """A hub in design with its owner and one active member."""
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    assert confirm(client, hub, owner).status_code == 200
    assert move(client, hub, owner, "design").status_code == 200
    return hub, owner, member


def insert_pieces(hub: Hub, creator: User, live: int, deleted: int = 0) -> list[UUID]:
    """Pieces numbered from 0, one minute apart, the last `deleted` of them deleted."""

    async def work(session: AsyncSession) -> list[UUID]:
        now = datetime.now(UTC)
        rows = [
            HubPiece(
                hub_id=hub.id,
                name=f"piece {number}",
                created_by=creator.id,
                created_at=now - timedelta(minutes=live + deleted - number),
                deleted_at=now if number >= live else None,
            )
            for number in range(live + deleted)
        ]
        session.add_all(rows)
        await session.commit()
        return [row.id for row in rows]

    return run(work)


def insert_links(
    hub: Hub, creator: User, pairs: list[tuple[UUID, UUID]], deleted: bool = False
) -> None:
    async def work(session: AsyncSession) -> None:
        now = datetime.now(UTC)
        session.add_all(
            HubPieceLink(
                hub_id=hub.id,
                from_piece_id=source,
                to_piece_id=target,
                label=f"link {number}",
                created_by=creator.id,
                created_at=now - timedelta(minutes=len(pairs) - number),
                deleted_at=now if deleted else None,
            )
            for number, (source, target) in enumerate(pairs)
        )
        await session.commit()

    run(work)


def stored(model: Any, row_id: str) -> Any:
    async def work(session: AsyncSession) -> Any:
        return await session.get(model, UUID(row_id))

    return run(work)


def test_a_member_adds_a_piece_and_the_team_reads_it(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)

    resp = add_piece(client, hub, member, "  Payouts API  ", summary="  Takes approved batches  ")

    assert resp.status_code == 201, resp.text
    piece = resp.json()["data"]
    assert piece["name"] == "Payouts API" and piece["summary"] == "Takes approved batches"
    assert set(piece) == {
        "id",
        "name",
        "summary",
        "created_by",
        "created_at",
        "updated_at",
        "can_delete",
    }
    assert piece["created_by"]["id"] == str(member.id)
    assert piece["created_by"]["username"] == member.username
    assert set(piece["created_by"]) == {
        "id",
        "username",
        "display_name",
        "avatar_url",
        "is_verified",
    }
    assert piece["can_delete"] is True
    for reader in (owner, member):
        assert design(client, hub, reader) == {"pieces": [{**piece}], "links": []}


def test_the_summary_is_optional(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)

    piece = make_piece(client, hub, owner)

    assert piece["summary"] == ""
    assert add_piece(client, hub, owner, "Ledger", summary="").json()["data"]["summary"] == ""


def test_an_empty_sketch_is_empty(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)

    assert read(client, hub, owner).json() == {"data": {"pieces": [], "links": []}}


def test_pieces_and_links_come_oldest_first_and_deleted_ones_are_left_out(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    ids = insert_pieces(hub, member, live=4, deleted=2)
    insert_links(hub, member, [(ids[0], ids[1]), (ids[1], ids[2]), (ids[2], ids[3])])
    insert_links(hub, member, [(ids[0], ids[3]), (ids[4], ids[5])], deleted=True)

    seen = design(client, hub, owner)

    assert [piece["name"] for piece in seen["pieces"]] == [f"piece {n}" for n in range(4)]
    assert [(link["from_piece_id"], link["to_piece_id"]) for link in seen["links"]] == [
        (str(ids[0]), str(ids[1])),
        (str(ids[1]), str(ids[2])),
        (str(ids[2]), str(ids[3])),
    ]
    assert [link["label"] for link in seen["links"]] == ["link 0", "link 1", "link 2"]


def test_a_link_has_a_direction_a_label_and_an_author(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    app_piece, api = make_piece(client, hub, owner), make_piece(client, hub, owner, "Payouts API")

    resp = add_link(client, hub, member, app_piece["id"], api["id"], "  approves a batch  ")

    assert resp.status_code == 201, resp.text
    link = resp.json()["data"]
    assert set(link) == {
        "id",
        "from_piece_id",
        "to_piece_id",
        "label",
        "created_by",
        "created_at",
        "can_delete",
    }
    assert (link["from_piece_id"], link["to_piece_id"]) == (app_piece["id"], api["id"])
    assert link["label"] == "approves a batch"
    assert link["created_by"]["id"] == str(member.id) and link["can_delete"] is True
    assert design(client, hub, owner)["links"] == [link]


def test_any_active_member_corrects_a_piece(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    piece = make_piece(client, hub, member, "Mobile app")

    renamed = change_piece(client, hub, other, piece["id"], name="  Member app ")
    summed = change_piece(client, hub, owner, piece["id"], summary="Where members see payouts")

    assert renamed.status_code == 200 and summed.status_code == 200, summed.text
    changed = summed.json()["data"]
    assert changed["name"] == "Member app"
    assert changed["summary"] == "Where members see payouts"
    assert changed["id"] == piece["id"] and changed["created_at"] == piece["created_at"]
    # the creator stays the creator, and can_delete follows the viewer
    assert changed["created_by"]["id"] == str(member.id) and changed["can_delete"] is True
    assert changed["updated_at"] > piece["updated_at"]
    assert design(client, hub, member)["pieces"][0]["name"] == "Member app"


def test_a_summary_sent_empty_clears_it_and_a_field_left_out_stays(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    piece = add_piece(client, hub, owner, "Ledger", summary="Every payout").json()["data"]

    kept = change_piece(client, hub, owner, piece["id"], name="Ledger database").json()["data"]
    cleared = change_piece(client, hub, owner, piece["id"], summary="").json()["data"]

    assert (kept["name"], kept["summary"]) == ("Ledger database", "Every payout")
    assert (cleared["name"], cleared["summary"]) == ("Ledger database", "")


@pytest.mark.parametrize(
    "fields",
    [{}, {"name": None}, {"summary": None}, {"name": ""}, {"name": "  "}, {"name": "x" * 61}]
    + [{"summary": "x" * 281}, {"name": "a\x00b"}, {"summary": "a\x00b"}, {"owner": "x"}],
    ids=repr,
)
def test_a_bad_correction_is_a_422_and_changes_nothing(client: TestClient, fields: Any) -> None:
    hub, owner, _ = designing_hub(client)
    piece = add_piece(client, hub, owner, "Ledger", summary="Every payout").json()["data"]

    assert change_piece(client, hub, owner, piece["id"], **fields).status_code == 422

    assert design(client, hub, owner)["pieces"] == [piece]


def test_an_unknown_deleted_or_foreign_piece_is_a_404(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    elsewhere, elsewhere_owner, _ = designing_hub(client)
    foreign = make_piece(client, elsewhere, elsewhere_owner)
    gone = make_piece(client, hub, owner, "Gone")
    assert remove_piece(client, hub, owner, gone["id"]).status_code == 204

    for piece_id in (UNKNOWN_ID, foreign["id"], gone["id"]):
        assert_error(change_piece(client, hub, owner, piece_id, name="X"), 404, "PIECE_NOT_FOUND")
        assert_error(remove_piece(client, hub, owner, piece_id), 404, "PIECE_NOT_FOUND")
    assert piece_names(client, elsewhere, elsewhere_owner) == ["Mobile app"]


def test_two_pieces_of_a_hub_cannot_share_a_name_ignoring_case_and_outer_spaces(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    piece = make_piece(client, hub, owner, "Payouts API")
    other = make_piece(client, hub, owner, "Ledger")

    for name in ("payouts api", "PAYOUTS API", "  Payouts API  ", "Payouts api"):
        assert_error(add_piece(client, hub, member, name), 409, "PIECE_NAME_TAKEN")
        assert_error(
            change_piece(client, hub, member, other["id"], name=name), 409, "PIECE_NAME_TAKEN"
        )
    # inside the name a space still counts
    assert add_piece(client, hub, member, "Payouts  API").status_code == 201
    # a piece may take its own name again, in other letters
    assert change_piece(client, hub, member, piece["id"], name="PAYOUTS api").status_code == 200
    assert sorted(piece_names(client, hub, owner)) == ["Ledger", "PAYOUTS api", "Payouts  API"]


def test_a_name_is_free_again_after_its_piece_is_deleted_and_free_in_another_hub(
    client: TestClient,
) -> None:
    hub, owner, _ = designing_hub(client)
    elsewhere, elsewhere_owner, _ = designing_hub(client)
    piece = make_piece(client, hub, owner, "Ledger")

    assert make_piece(client, elsewhere, elsewhere_owner, "ledger")["name"] == "ledger"
    assert remove_piece(client, hub, owner, piece["id"]).status_code == 204
    assert make_piece(client, hub, owner, "LEDGER")["name"] == "LEDGER"


def test_a_hub_keeps_at_most_30_pieces_that_are_not_deleted(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    insert_pieces(hub, member, live=MAX_PIECES - 1, deleted=5)

    last = add_piece(client, hub, owner, "The 30th")
    assert last.status_code == 201, last.text
    assert_error(add_piece(client, hub, owner, "One too many"), 409, "PIECES_FULL")
    assert_error(add_piece(client, hub, member, "One too many"), 409, "PIECES_FULL")
    # a rename is not an addition
    assert (
        change_piece(client, hub, owner, last.json()["data"]["id"], name="Renamed").status_code
        == 200
    )

    assert remove_piece(client, hub, owner, last.json()["data"]["id"]).status_code == 204
    assert add_piece(client, hub, owner, "There is room again").status_code == 201


def test_a_hub_keeps_at_most_60_links_that_are_not_deleted(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    ids = insert_pieces(hub, member, live=11)
    pairs = list(permutations(ids, 2))
    insert_links(hub, member, pairs[: MAX_LINKS - 1])
    insert_links(hub, member, pairs[MAX_LINKS : MAX_LINKS + 5], deleted=True)

    last = add_link(client, hub, owner, pairs[MAX_LINKS - 1][0], pairs[MAX_LINKS - 1][1])
    assert last.status_code == 201, last.text
    source, target = pairs[MAX_LINKS]
    assert_error(add_link(client, hub, owner, source, target), 409, "LINKS_FULL")
    assert_error(add_link(client, hub, member, source, target), 409, "LINKS_FULL")

    assert remove_link(client, hub, owner, last.json()["data"]["id"]).status_code == 204
    assert add_link(client, hub, owner, source, target).status_code == 201


def test_deleting_a_piece_removes_its_links_from_the_answer(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    app_piece, api, db = (make_piece(client, hub, member, name) for name in ("App", "API", "DB"))
    into = make_link(client, hub, member, app_piece, api, "calls")
    out_of = make_link(client, hub, member, api, db, "writes to")
    apart = make_link(client, hub, member, db, app_piece, "syncs to")

    assert remove_piece(client, hub, member, api["id"]).status_code == 204

    seen = design(client, hub, owner)
    assert [piece["name"] for piece in seen["pieces"]] == ["App", "DB"]
    assert [link["id"] for link in seen["links"]] == [apart["id"]]
    # the rows stay, with the time they were removed, and the link that did not touch it does not
    assert stored(HubPiece, api["id"]).deleted_at is not None
    assert stored(HubPieceLink, into["id"]).deleted_at is not None
    assert stored(HubPieceLink, out_of["id"]).deleted_at is not None
    assert stored(HubPieceLink, apart["id"]).deleted_at is None
    assert_error(remove_link(client, hub, owner, into["id"]), 404, "LINK_NOT_FOUND")


def test_the_creator_or_the_owner_removes_a_piece_and_nobody_else(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    by_member = make_piece(client, hub, member, "By member")
    by_owner = make_piece(client, hub, owner, "By owner")

    assert_error(remove_piece(client, hub, other, by_member["id"]), 403, "NOT_PIECE_AUTHOR")
    assert_error(remove_piece(client, hub, member, by_owner["id"]), 403, "NOT_PIECE_AUTHOR")
    assert remove_piece(client, hub, owner, by_member["id"]).status_code == 204
    assert remove_piece(client, hub, owner, by_owner["id"]).status_code == 204

    assert piece_names(client, hub, other) == []


def test_the_creator_or_the_owner_removes_a_link_and_nobody_else(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    first, second = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")
    by_member = make_link(client, hub, member, first, second)
    by_owner = make_link(client, hub, owner, second, first)

    assert_error(remove_link(client, hub, other, by_member["id"]), 403, "NOT_LINK_AUTHOR")
    assert_error(remove_link(client, hub, member, by_owner["id"]), 403, "NOT_LINK_AUTHOR")
    assert remove_link(client, hub, member, by_member["id"]).status_code == 204
    assert remove_link(client, hub, owner, by_owner["id"]).status_code == 204

    assert design(client, hub, other)["links"] == []
    assert_error(remove_link(client, hub, owner, by_owner["id"]), 404, "LINK_NOT_FOUND")
    assert stored(HubPieceLink, by_owner["id"]).deleted_at is not None


def test_a_link_is_unknown_when_it_is_missing_deleted_or_of_another_hub(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    elsewhere, elsewhere_owner, _ = designing_hub(client)
    one, two = (
        make_piece(client, elsewhere, elsewhere_owner),
        make_piece(client, elsewhere, elsewhere_owner, "Two"),
    )
    foreign = make_link(client, elsewhere, elsewhere_owner, one, two)

    assert_error(remove_link(client, hub, owner, UNKNOWN_ID), 404, "LINK_NOT_FOUND")
    assert_error(remove_link(client, hub, owner, foreign["id"]), 404, "LINK_NOT_FOUND")
    assert len(design(client, elsewhere, elsewhere_owner)["links"]) == 1


def test_a_link_joins_two_live_pieces_of_this_hub(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    elsewhere, elsewhere_owner, _ = designing_hub(client)
    one, two, gone = (make_piece(client, hub, owner, name) for name in ("One", "Two", "Gone"))
    foreign = make_piece(client, elsewhere, elsewhere_owner, "Foreign")
    assert remove_piece(client, hub, owner, gone["id"]).status_code == 204

    for source, target in (
        (one["id"], UNKNOWN_ID),
        (UNKNOWN_ID, one["id"]),
        (one["id"], gone["id"]),
        (gone["id"], one["id"]),
        (one["id"], foreign["id"]),
        (foreign["id"], one["id"]),
    ):
        assert_error(add_link(client, hub, owner, source, target), 404, "PIECE_NOT_FOUND")
    assert design(client, hub, owner)["links"] == []
    assert design(client, elsewhere, elsewhere_owner)["links"] == []
    assert add_link(client, hub, owner, one["id"], two["id"]).status_code == 201


def test_a_link_cannot_join_a_piece_to_itself(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    piece = make_piece(client, hub, owner)

    resp = add_link(client, hub, owner, piece["id"], piece["id"])

    assert resp.status_code == 422
    assert design(client, hub, owner)["links"] == []


def test_the_opposite_direction_is_a_different_link_and_the_same_one_is_refused(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")
    forward = make_link(client, hub, owner, one, two, "calls")

    assert_error(add_link(client, hub, owner, one["id"], two["id"], "calls"), 409, "LINK_EXISTS")
    assert_error(
        add_link(client, hub, member, one["id"], two["id"], "other label"), 409, "LINK_EXISTS"
    )
    backward = make_link(client, hub, member, two, one, "answers")

    assert [link["id"] for link in design(client, hub, owner)["links"]] == [
        forward["id"],
        backward["id"],
    ]
    # once the link is removed, the same pair can be linked again
    assert remove_link(client, hub, owner, forward["id"]).status_code == 204
    assert add_link(client, hub, owner, one["id"], two["id"], "calls again").status_code == 201


def test_can_delete_is_true_only_for_the_creator_and_the_owner(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    one, two = make_piece(client, hub, member, "One"), make_piece(client, hub, member, "Two")
    make_link(client, hub, member, one, two)

    flags = {
        name: [
            [item["can_delete"] for item in design(client, hub, viewer)[key]]
            for key in ("pieces", "links")
        ]
        for name, viewer in (("owner", owner), ("creator", member), ("other", other))
    }

    assert flags == {
        "owner": [[True, True], [True]],
        "creator": [[True, True], [True]],
        "other": [[False, False], [False]],
    }


@pytest.mark.parametrize(
    "status", [None, HubMemberStatus.INVITED, HubMemberStatus.REQUESTED, HubMemberStatus.DECLINED]
)
def test_only_active_members_see_or_write_the_sketch(
    client: TestClient, status: HubMemberStatus | None
) -> None:
    hub, owner, _ = designing_hub(client)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")
    link = make_link(client, hub, owner, one, two)
    outsider = make_user()
    if status is not None:
        add_member(hub, outsider, status)

    assert_error(read(client, hub, outsider), 403, "NOT_HUB_MEMBER")
    for resp in (
        add_piece(client, hub, outsider, "Mine"),
        change_piece(client, hub, outsider, one["id"], name="Mine"),
        remove_piece(client, hub, outsider, one["id"]),
        add_link(client, hub, outsider, two["id"], one["id"]),
        remove_link(client, hub, outsider, link["id"]),
    ):
        assert_error(resp, 403, "NOT_HUB_MEMBER")
    seen = design(client, hub, owner)
    assert [piece["name"] for piece in seen["pieces"]] == ["One", "Two"] and len(seen["links"]) == 1


def test_someone_who_left_sees_no_sketch(client: TestClient) -> None:
    hub, _, _ = designing_hub(client)
    gone = make_user()
    add_member(hub, gone, HubMemberStatus.LEFT)

    assert_error(read(client, hub, gone), 403, "NOT_HUB_MEMBER")
    assert_error(add_piece(client, hub, gone), 403, "NOT_HUB_MEMBER")


def test_the_sketch_needs_a_signed_in_person_and_a_hub_that_exists(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    one = make_piece(client, hub, owner)
    base = f"/v1/hubs/{hub.id}"

    for method, path in (
        ("GET", "/design"),
        ("POST", "/pieces"),
        ("PATCH", f"/pieces/{one['id']}"),
        ("DELETE", f"/pieces/{one['id']}"),
        ("POST", "/links"),
        ("DELETE", f"/links/{UNKNOWN_ID}"),
    ):
        assert client.request(method, base + path, json={}).status_code == 401, (method, path)
    gone = f"/v1/hubs/{UNKNOWN_ID}"
    for resp in (
        client.get(f"{gone}/design", headers=auth(owner)),
        client.post(f"{gone}/pieces", headers=auth(owner), json={"name": "X"}),
        client.patch(f"{gone}/pieces/{UNKNOWN_ID}", headers=auth(owner), json={"name": "X"}),
        client.delete(f"{gone}/pieces/{UNKNOWN_ID}", headers=auth(owner)),
        client.post(
            f"{gone}/links",
            headers=auth(owner),
            json={"from_piece_id": UNKNOWN_ID, "to_piece_id": OTHER_UNKNOWN_ID, "label": "x"},
        ),
        client.delete(f"{gone}/links/{UNKNOWN_ID}", headers=auth(owner)),
    ):
        assert_error(resp, 404, "NOT_FOUND")


def test_a_hub_of_the_other_world_is_a_404_and_the_demo_reads_but_never_writes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    real_hub, real_owner, _ = designing_hub(client)
    demo_hub, demo_owner, demo_member = designing_hub(client)
    piece = make_piece(client, demo_hub, demo_owner)
    visitor = make_user()

    async def to_demo(session: AsyncSession) -> None:
        await session.execute(
            update(User)
            .where(User.id.in_([visitor.id, demo_owner.id, demo_member.id]))
            .values(is_demo=True)
        )
        await session.commit()

    run(to_demo)

    assert_error(read(client, real_hub, visitor), 404, "NOT_FOUND")
    assert_error(read(client, demo_hub, real_owner), 404, "NOT_FOUND")
    assert_error(add_piece(client, demo_hub, real_owner, "Mine"), 404, "NOT_FOUND")
    assert design(client, demo_hub, demo_member)["pieces"][0]["id"] == piece["id"]
    for resp in writes(client, demo_hub, demo_member):
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "DEMO_READ_ONLY"
    assert piece_names(client, demo_hub, demo_member) == ["Mobile app"]


def test_the_sketch_waits_for_the_team_to_be_confirmed(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    assert_error(read(client, hub, owner), 409, "TEAM_NOT_CONFIRMED")
    for resp in writes(client, hub, owner):
        assert_error(resp, 409, "TEAM_NOT_CONFIRMED")


def test_the_sketch_is_not_open_during_brainstorm(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    assert confirm(client, hub, owner).status_code == 200

    assert_error(read(client, hub, owner), 409, "PHASE_NOT_STARTED")
    for resp in writes(client, hub, owner):
        assert_error(resp, 409, "PHASE_NOT_STARTED")


def test_after_design_the_sketch_stays_readable_but_cannot_change(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    one, two = make_piece(client, hub, member, "One"), make_piece(client, hub, member, "Two")
    link = make_link(client, hub, member, one, two)

    for phase in ("build", "review"):
        assert move(client, hub, owner, phase).status_code == 200
        for resp in writes(client, hub, member):
            assert_error(resp, 409, "PHASE_CLOSED")
        # a closed phase is reported before a missing or forbidden target
        assert_error(remove_piece(client, hub, member, one["id"]), 409, "PHASE_CLOSED")
        assert_error(remove_link(client, hub, member, link["id"]), 409, "PHASE_CLOSED")
        for reader in (member, owner):
            seen = design(client, hub, reader)
            assert [piece["id"] for piece in seen["pieces"]] == [one["id"], two["id"]]
            assert [item["id"] for item in seen["links"]] == [link["id"]]
            assert not any(item["can_delete"] for item in seen["pieces"] + seen["links"])

    # one step back is build again, which is still not design
    assert move(client, hub, owner, "build").status_code == 200
    assert_error(add_piece(client, hub, member), 409, "PHASE_CLOSED")
    # and back in design the sketch can change once more
    assert move(client, hub, owner, "design").status_code == 200
    assert remove_link(client, hub, member, link["id"]).status_code == 204


def test_an_archived_hub_takes_no_changes_and_stays_readable(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    one, two = make_piece(client, hub, member, "One"), make_piece(client, hub, member, "Two")
    link = make_link(client, hub, member, one, two)
    set_hub(hub, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))

    for resp in writes(client, hub, owner):
        assert_error(resp, 409, "HUB_ARCHIVED")
    assert_error(remove_link(client, hub, owner, link["id"]), 409, "HUB_ARCHIVED")
    seen = design(client, hub, member)
    assert len(seen["pieces"]) == 2 and len(seen["links"]) == 1
    assert not any(item["can_delete"] for item in seen["pieces"] + seen["links"])


def test_the_checks_run_in_order_hub_member_phase_archive_then_the_item(
    client: TestClient,
) -> None:
    hub, owner, member = designing_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")
    link = make_link(client, hub, owner, one, two)
    outsider = make_user()

    # a member's missing right comes after the phase and the archive checks, not before
    assert_error(remove_piece(client, hub, other, one["id"]), 403, "NOT_PIECE_AUTHOR")
    assert_error(remove_link(client, hub, other, link["id"]), 403, "NOT_LINK_AUTHOR")
    set_hub(hub, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))
    assert_error(remove_piece(client, hub, other, one["id"]), 409, "HUB_ARCHIVED")
    assert_error(remove_link(client, hub, other, link["id"]), 409, "HUB_ARCHIVED")
    assert_error(remove_piece(client, hub, outsider, one["id"]), 403, "NOT_HUB_MEMBER")
    assert_error(add_link(client, hub, member, one["id"], UNKNOWN_ID), 409, "HUB_ARCHIVED")


def test_a_full_hub_refuses_before_it_looks_at_the_name_or_the_pieces(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    ids = insert_pieces(hub, member, live=MAX_PIECES)

    assert_error(add_piece(client, hub, owner, "piece 0"), 409, "PIECES_FULL")
    assert_error(add_link(client, hub, owner, ids[0], UNKNOWN_ID), 404, "PIECE_NOT_FOUND")


@pytest.mark.parametrize("name", ["a", "a" * 60, "é" * 60, "ẹ" * 60, "漢" * 60, "😀" * 60])
def test_a_name_of_1_to_60_characters_is_kept(client: TestClient, name: str) -> None:
    hub, owner, _ = designing_hub(client)

    resp = add_piece(client, hub, owner, name)

    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["name"] == name


@pytest.mark.parametrize(
    "name",
    ["", "   ", "\n\t ", "a\x00b", None, 12, ["a"], "a" * 61, "é" * 61, "漢" * 61, "😀" * 61],
    ids=repr,
)
def test_a_bad_name_is_a_422_and_saves_nothing(client: TestClient, name: Any) -> None:
    hub, owner, _ = designing_hub(client)

    resp = add_piece(client, hub, owner, name)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "name"]
    assert piece_names(client, hub, owner) == []


@pytest.mark.parametrize("summary", ["", "a", "a" * 280, "é" * 280, "漢" * 280, "😀" * 280])
def test_a_summary_of_0_to_280_characters_is_kept(client: TestClient, summary: str) -> None:
    hub, owner, _ = designing_hub(client)

    resp = add_piece(client, hub, owner, "Ledger", summary=summary)

    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["summary"] == summary


@pytest.mark.parametrize(
    "summary", ["a" * 281, "é" * 281, "漢" * 281, "😀" * 281, "a\x00b", None, 12, ["a"]], ids=repr
)
def test_a_bad_summary_is_a_422_and_saves_nothing(client: TestClient, summary: Any) -> None:
    hub, owner, _ = designing_hub(client)

    resp = add_piece(client, hub, owner, "Ledger", summary=summary)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "summary"]
    assert piece_names(client, hub, owner) == []


@pytest.mark.parametrize("label", ["a", "a" * 60, "é" * 60, "漢" * 60, "😀" * 60])
def test_a_label_of_1_to_60_characters_is_kept(client: TestClient, label: str) -> None:
    hub, owner, _ = designing_hub(client)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")

    assert make_link(client, hub, owner, one, two, label)["label"] == label


@pytest.mark.parametrize(
    "label",
    ["", "   ", "a\x00b", None, 12, ["a"], "a" * 61, "é" * 61, "漢" * 61, "😀" * 61],
    ids=repr,
)
def test_a_bad_label_is_a_422_and_saves_nothing(client: TestClient, label: Any) -> None:
    hub, owner, _ = designing_hub(client)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")

    resp = add_link(client, hub, owner, one["id"], two["id"], label)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "label"]
    assert design(client, hub, owner)["links"] == []


def test_a_bad_body_is_a_422_before_any_other_refusal(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    outsider = make_user()
    assert move(client, hub, owner, "build").status_code == 200  # the phase is closed
    gone = f"/v1/hubs/{UNKNOWN_ID}"

    assert add_piece(client, hub, owner, "").status_code == 422
    assert add_piece(client, hub, outsider, "").status_code == 422  # not a member
    assert client.post(f"{gone}/pieces", headers=auth(owner), json={"name": ""}).status_code == 422
    assert change_piece(client, hub, outsider, UNKNOWN_ID, name="").status_code == 422
    assert add_link(client, hub, outsider, UNKNOWN_ID, UNKNOWN_ID).status_code == 422
    assert add_link(client, hub, outsider, UNKNOWN_ID, OTHER_UNKNOWN_ID, "").status_code == 422


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("pieces", {}),
        ("pieces", {"name": "x", "created_by": UNKNOWN_ID}),
        ("links", {}),
        ("links", {"from_piece_id": UNKNOWN_ID, "to_piece_id": OTHER_UNKNOWN_ID}),
        ("links", {"from_piece_id": "nope", "to_piece_id": OTHER_UNKNOWN_ID, "label": "x"}),
        (
            "links",
            {
                "from_piece_id": UNKNOWN_ID,
                "to_piece_id": OTHER_UNKNOWN_ID,
                "label": "x",
                "hub_id": "y",
            },
        ),
    ],
)
def test_a_request_needs_its_fields_and_refuses_others(
    client: TestClient, path: str, payload: dict[str, str]
) -> None:
    hub, owner, _ = designing_hub(client)

    assert (
        client.post(f"/v1/hubs/{hub.id}/{path}", headers=auth(owner), json=payload).status_code
        == 422
    )


def test_a_malformed_id_in_the_path_is_a_422(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)

    assert change_piece(client, hub, owner, "nope", name="X").status_code == 422
    assert remove_piece(client, hub, owner, "nope").status_code == 422
    assert remove_link(client, hub, owner, "nope").status_code == 422


def test_the_hub_card_does_not_carry_the_sketch(client: TestClient) -> None:
    hub, owner, _ = designing_hub(client)
    add_piece(client, hub, owner, "Confidential component")

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner))

    assert "Confidential component" not in card.text
    assert not {"pieces", "links", "design"} & set(card.json()["data"])


def test_every_write_waits_for_the_hub_row_lock(client: TestClient) -> None:
    hub, owner, member = designing_hub(client)
    one, two = make_piece(client, hub, owner, "One"), make_piece(client, hub, owner, "Two")
    link = make_link(client, hub, owner, one, two)
    headers = auth(owner)
    base = f"/v1/hubs/{hub.id}"
    sends: list[Callable[[httpx.AsyncClient], Awaitable[httpx.Response]]] = [
        lambda http: http.post(f"{base}/pieces", headers=headers, json={"name": "Three"}),
        lambda http: http.patch(
            f"{base}/pieces/{one['id']}", headers=headers, json={"summary": "x"}
        ),
        lambda http: http.post(
            f"{base}/links",
            headers=headers,
            json={"from_piece_id": two["id"], "to_piece_id": one["id"], "label": "back"},
        ),
        lambda http: http.delete(f"{base}/links/{link['id']}", headers=headers),
        lambda http: http.delete(f"{base}/pieces/{two['id']}", headers=headers),
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
                assert (await pending).status_code in (200, 201, 204)
                return blocked

    for send in sends:
        assert asyncio.run(while_the_hub_is_locked(send)) is True
    assert piece_names(client, hub, member) == ["One", "Three"]


def test_the_tables_refuse_a_piece_with_a_name_or_summary_out_of_bounds() -> None:
    owner = make_user()
    hub = make_hub(owner)

    def attempt(constraint: str, **fields: Any) -> None:
        async def work(session: AsyncSession) -> None:
            session.add(HubPiece(hub_id=hub.id, created_by=owner.id, **{"name": "X", **fields}))
            await session.commit()

        with pytest.raises(IntegrityError, match=constraint):
            run(work)

    attempt("hub_pieces_name_length", name="a" * 61)
    attempt("hub_pieces_name_length", name="")
    attempt("hub_pieces_summary_length", summary="a" * 281)


def test_the_tables_refuse_two_live_pieces_with_one_name() -> None:
    owner = make_user()
    hub = make_hub(owner)

    async def add(session: AsyncSession, name: str, deleted: bool = False) -> None:
        session.add(
            HubPiece(
                hub_id=hub.id,
                name=name,
                created_by=owner.id,
                deleted_at=datetime.now(UTC) if deleted else None,
            )
        )
        await session.commit()

    async def work(session: AsyncSession) -> None:
        await add(session, "Mobile app", deleted=True)
        await add(session, "Mobile app")
        await add(session, " MOBILE APP ")

    with pytest.raises(IntegrityError, match="hub_pieces_name_uq"):
        run(work)


def test_the_tables_refuse_a_link_that_breaks_a_rule() -> None:
    owner = make_user()
    hub, elsewhere = make_hub(owner), make_hub(owner)
    here, also_here = insert_pieces(hub, owner, live=2)[:2]
    there = insert_pieces(elsewhere, owner, live=1)[0]

    def attempt(constraint: str, source: UUID, target: UUID, label: str = "calls") -> None:
        async def work(session: AsyncSession) -> None:
            session.add(
                HubPieceLink(
                    hub_id=hub.id,
                    from_piece_id=source,
                    to_piece_id=target,
                    label=label,
                    created_by=owner.id,
                )
            )
            await session.commit()

        with pytest.raises(IntegrityError, match=constraint):
            run(work)

    attempt("hub_piece_links_label_length", here, also_here, "a" * 61)
    attempt("hub_piece_links_label_length", here, also_here, "")
    attempt("hub_piece_links_not_itself", here, here)
    attempt("hub_piece_links_to_fk", here, there)
    attempt("hub_piece_links_from_fk", there, here)
    insert_links(hub, owner, [(here, also_here)])
    attempt("hub_piece_links_direction_uq", here, also_here)
    insert_links(hub, owner, [(also_here, here)])

    async def count(session: AsyncSession) -> int:
        rows = await session.scalars(select(HubPieceLink).where(HubPieceLink.hub_id == hub.id))
        return len(rows.all())

    assert run(count) == 2
