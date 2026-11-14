"""Brainstorm notes: who reads and writes them, and when."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.v1.hub_notes import MAX_NOTES
from app.models import Hub, HubMemberStatus, HubNote, HubStatus, User
from tests.hub_support import add_member, auth, make_hub, make_user, run
from tests.test_hub_phases import assert_error, confirm, move

UNKNOWN_ID = "00000000-0000-4000-8000-000000000000"


def notes_url(hub: Hub) -> str:
    return f"/v1/hubs/{hub.id}/notes"


def add(client: TestClient, hub: Hub, caller: User, body: Any = "A first idea") -> Any:
    return client.post(notes_url(hub), headers=auth(caller), json={"body": body})


def listed(client: TestClient, hub: Hub, caller: User, **params: Any) -> Any:
    return client.get(notes_url(hub), headers=auth(caller), params=params)


def remove(client: TestClient, hub: Hub, caller: User, note_id: str) -> Any:
    return client.delete(f"{notes_url(hub)}/{note_id}", headers=auth(caller))


def note_ids(response: Any) -> list[str]:
    assert response.status_code == 200, response.text
    return [row["id"] for row in response.json()["data"]]


def brainstorming_hub(client: TestClient) -> tuple[Hub, User, User]:
    """A hub in brainstorm with its owner and one active member."""
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    assert confirm(client, hub, owner).status_code == 200
    return hub, owner, member


def insert_notes(hub: Hub, author: User, live: int, deleted: int = 0) -> None:
    """Notes numbered from 0, one minute apart, the last `deleted` of them deleted."""

    async def work(session: AsyncSession) -> None:
        now = datetime.now(UTC)
        session.add_all(
            HubNote(
                hub_id=hub.id,
                author_id=author.id,
                body=f"note {number}",
                created_at=now - timedelta(minutes=live + deleted - number),
                deleted_at=now if number >= live else None,
            )
            for number in range(live + deleted)
        )
        await session.commit()

    run(work)


def set_hub(hub: Hub, **values: Any) -> None:
    async def work(session: AsyncSession) -> None:
        await session.execute(update(Hub).where(Hub.id == hub.id).values(**values))
        await session.commit()

    run(work)


def test_a_member_adds_a_note_and_the_team_reads_it(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)

    resp = add(client, hub, member, "  Offline first, sync later  ")

    assert resp.status_code == 201, resp.text
    note = resp.json()["data"]
    assert note["body"] == "Offline first, sync later"
    assert note["author"]["id"] == str(member.id)
    assert note["author"]["username"] == member.username
    assert set(note["author"]) == {"id", "username", "display_name", "avatar_url", "is_verified"}
    assert note["created_at"] and note["can_delete"] is True
    for reader in (owner, member):
        seen = listed(client, hub, reader).json()
        assert [row["id"] for row in seen["data"]] == [note["id"]]
        assert seen["next_offset"] is None


def test_notes_are_listed_oldest_first_and_paged(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    insert_notes(hub, member, live=5)

    first = listed(client, hub, owner, limit=2).json()
    second = listed(client, hub, owner, limit=2, offset=first["next_offset"]).json()
    last = listed(client, hub, owner, limit=2, offset=second["next_offset"]).json()

    bodies = [row["body"] for page in (first, second, last) for row in page["data"]]
    assert bodies == [f"note {number}" for number in range(5)]
    assert (first["next_offset"], second["next_offset"], last["next_offset"]) == (2, 4, None)
    assert listed(client, hub, owner, limit=0).status_code == 422
    assert listed(client, hub, owner, offset=-1).status_code == 422


def test_deleted_notes_are_not_listed(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    insert_notes(hub, member, live=3, deleted=2)

    resp = listed(client, hub, owner)

    assert [row["body"] for row in resp.json()["data"]] == ["note 0", "note 1", "note 2"]


def test_an_empty_hub_has_an_empty_list(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)

    assert listed(client, hub, owner).json() == {"data": [], "next_offset": None}


@pytest.mark.parametrize("who", ["owner", "member"])
def test_the_author_removes_a_note_and_it_leaves_the_list(client: TestClient, who: str) -> None:
    hub, owner, member = brainstorming_hub(client)
    author = owner if who == "owner" else member
    keep = add(client, hub, owner, "Keep").json()["data"]
    gone = add(client, hub, author, "Remove").json()["data"]

    assert remove(client, hub, author, gone["id"]).status_code == 204

    assert note_ids(listed(client, hub, owner)) == [keep["id"]]
    assert_error(remove(client, hub, author, gone["id"]), 404, "NOTE_NOT_FOUND")

    async def deleted_at(session: AsyncSession) -> datetime | None:
        return await session.scalar(select(HubNote.deleted_at).where(HubNote.id == gone["id"]))

    # the row stays, with the time it was removed
    assert run(deleted_at) is not None


def test_the_owner_removes_a_members_note_but_a_member_cannot_remove_anothers(
    client: TestClient,
) -> None:
    hub, owner, member = brainstorming_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    by_member = add(client, hub, member).json()["data"]
    by_owner = add(client, hub, owner).json()["data"]

    assert_error(remove(client, hub, other, by_member["id"]), 403, "NOT_NOTE_AUTHOR")
    assert_error(remove(client, hub, member, by_owner["id"]), 403, "NOT_NOTE_AUTHOR")
    assert remove(client, hub, owner, by_member["id"]).status_code == 204

    assert note_ids(listed(client, hub, other)) == [by_owner["id"]]


def test_can_delete_is_true_only_for_the_author_and_the_owner(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    other = make_user()
    add_member(hub, other, HubMemberStatus.ACTIVE)
    add(client, hub, member, "Mine")

    flags = {
        name: [row["can_delete"] for row in listed(client, hub, viewer).json()["data"]]
        for name, viewer in (("owner", owner), ("author", member), ("other", other))
    }

    assert flags == {"owner": [True], "author": [True], "other": [False]}


def test_an_unknown_or_foreign_note_is_a_404(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)
    elsewhere, elsewhere_owner, _ = brainstorming_hub(client)
    foreign = add(client, elsewhere, elsewhere_owner).json()["data"]

    assert_error(remove(client, hub, owner, UNKNOWN_ID), 404, "NOTE_NOT_FOUND")
    assert_error(remove(client, hub, owner, foreign["id"]), 404, "NOTE_NOT_FOUND")
    assert note_ids(listed(client, elsewhere, elsewhere_owner)) == [foreign["id"]]


@pytest.mark.parametrize(
    "status", [None, HubMemberStatus.INVITED, HubMemberStatus.REQUESTED, HubMemberStatus.DECLINED]
)
def test_only_active_members_see_or_write_notes(
    client: TestClient, status: HubMemberStatus | None
) -> None:
    hub, owner, _ = brainstorming_hub(client)
    note = add(client, hub, owner).json()["data"]
    outsider = make_user()
    if status is not None:
        add_member(hub, outsider, status)

    assert_error(listed(client, hub, outsider), 403, "NOT_HUB_MEMBER")
    assert_error(add(client, hub, outsider), 403, "NOT_HUB_MEMBER")
    assert_error(remove(client, hub, outsider, note["id"]), 403, "NOT_HUB_MEMBER")
    assert note_ids(listed(client, hub, owner)) == [note["id"]]


def test_someone_who_left_sees_no_notes(client: TestClient) -> None:
    hub, _, _ = brainstorming_hub(client)
    gone = make_user()
    add_member(hub, gone, HubMemberStatus.LEFT)

    assert_error(listed(client, hub, gone), 403, "NOT_HUB_MEMBER")


def test_notes_need_a_signed_in_person_and_a_hub_that_exists(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)

    assert client.get(notes_url(hub)).status_code == 401
    assert client.post(notes_url(hub), json={"body": "x"}).status_code == 401
    assert_error(client.get(f"/v1/hubs/{UNKNOWN_ID}/notes", headers=auth(owner)), 404, "NOT_FOUND")
    unknown = client.post(f"/v1/hubs/{UNKNOWN_ID}/notes", headers=auth(owner), json={"body": "x"})
    assert_error(unknown, 404, "NOT_FOUND")


def test_a_hub_of_the_other_world_is_a_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    real_hub, real_owner, _ = brainstorming_hub(client)
    demo_hub, demo_owner, demo_member = brainstorming_hub(client)
    visitor = make_user()

    async def to_demo(session: AsyncSession) -> None:
        await session.execute(
            update(User)
            .where(User.id.in_([visitor.id, demo_owner.id, demo_member.id]))
            .values(is_demo=True)
        )
        await session.commit()

    run(to_demo)

    assert_error(listed(client, real_hub, visitor), 404, "NOT_FOUND")
    assert_error(listed(client, demo_hub, real_owner), 404, "NOT_FOUND")
    assert_error(add(client, demo_hub, real_owner), 404, "NOT_FOUND")
    assert listed(client, demo_hub, demo_member).status_code == 200


def test_notes_wait_for_the_team_to_be_confirmed(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    assert_error(listed(client, hub, owner), 409, "TEAM_NOT_CONFIRMED")
    assert_error(add(client, hub, owner), 409, "TEAM_NOT_CONFIRMED")
    assert_error(remove(client, hub, owner, UNKNOWN_ID), 409, "TEAM_NOT_CONFIRMED")


def test_after_brainstorm_notes_stay_readable_but_cannot_change(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    note = add(client, hub, member).json()["data"]

    for phase in ("design", "build", "review"):
        assert move(client, hub, owner, phase).status_code == 200
        assert_error(add(client, hub, member), 409, "PHASE_CLOSED")
        assert_error(remove(client, hub, owner, note["id"]), 409, "PHASE_CLOSED")
        for reader in (member, owner):
            seen = listed(client, hub, reader).json()["data"]
            assert [row["id"] for row in seen] == [note["id"]]
            assert seen[0]["can_delete"] is False

    # one step back is still not brainstorm
    assert move(client, hub, owner, "build").status_code == 200
    assert_error(add(client, hub, member), 409, "PHASE_CLOSED")


def test_an_archived_hub_takes_no_changes_and_stays_readable(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    note = add(client, hub, member).json()["data"]
    set_hub(hub, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))

    assert_error(add(client, hub, member), 409, "HUB_ARCHIVED")
    assert_error(remove(client, hub, owner, note["id"]), 409, "HUB_ARCHIVED")
    seen = listed(client, hub, member).json()["data"]
    assert len(seen) == 1 and seen[0]["can_delete"] is False


def test_a_hub_keeps_at_most_200_notes_that_are_not_deleted(client: TestClient) -> None:
    hub, owner, member = brainstorming_hub(client)
    insert_notes(hub, member, live=MAX_NOTES - 1, deleted=5)

    last = add(client, hub, owner, "The 200th")
    assert last.status_code == 201, last.text
    assert_error(add(client, hub, owner, "One too many"), 409, "NOTES_FULL")
    assert_error(add(client, hub, member, "One too many"), 409, "NOTES_FULL")

    assert remove(client, hub, owner, last.json()["data"]["id"]).status_code == 204
    assert add(client, hub, owner, "There is room again").status_code == 201


def test_a_note_is_1_to_280_characters_counted_as_characters(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)
    fits = ("a", "a" * 280, "é" * 280, "ẹ" * 280, "漢" * 280, "😀" * 280)
    too_long = ("a" * 281, "é" * 281, "漢" * 281, "😀" * 281)

    for body in fits:
        resp = add(client, hub, owner, body)
        assert resp.status_code == 201, (body[:5], resp.text)
        assert resp.json()["data"]["body"] == body
    for body in too_long:
        assert add(client, hub, owner, body).status_code == 422, body[:5]

    # 280 of these letters are 560 bytes or more, so the limit is on characters
    assert len(note_ids(listed(client, hub, owner))) == len(fits)


@pytest.mark.parametrize("body", ["", "   ", "\n\t ", "a\x00b", None, 12, ["a"]], ids=repr)
def test_a_bad_body_is_a_422_and_saves_nothing(client: TestClient, body: Any) -> None:
    hub, owner, _ = brainstorming_hub(client)

    resp = add(client, hub, owner, body)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "body"]
    assert listed(client, hub, owner).json()["data"] == []


def test_a_bad_body_is_a_422_before_any_other_refusal(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)
    outsider = make_user()
    assert move(client, hub, owner, "design").status_code == 200

    assert add(client, hub, owner, "").status_code == 422  # phase is closed
    assert add(client, hub, outsider, "").status_code == 422  # not a member
    unknown = client.post(f"/v1/hubs/{UNKNOWN_ID}/notes", headers=auth(owner), json={"body": ""})
    assert unknown.status_code == 422  # no such hub


@pytest.mark.parametrize("payload", [{}, {"body": "x", "author_id": UNKNOWN_ID}])
def test_the_request_needs_a_body_and_refuses_other_fields(
    client: TestClient, payload: dict[str, str]
) -> None:
    hub, owner, _ = brainstorming_hub(client)

    resp = client.post(notes_url(hub), headers=auth(owner), json=payload)

    assert resp.status_code == 422


def test_the_hub_card_does_not_carry_notes(client: TestClient) -> None:
    hub, owner, _ = brainstorming_hub(client)
    add(client, hub, owner, "Confidential words")

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner))

    assert "Confidential words" not in card.text
    assert "notes" not in card.json()["data"]


def test_the_table_refuses_a_body_over_280_characters() -> None:
    owner = make_user()
    hub = make_hub(owner)

    async def work(session: AsyncSession) -> None:
        session.add(HubNote(hub_id=hub.id, author_id=owner.id, body="a" * 281))
        await session.commit()

    with pytest.raises(DBAPIError, match="hub_notes_body_length"):
        run(work)
