"""A hub's phase: the owner confirms the team, then moves the hub one phase at a time."""

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Hub, HubMemberStatus, HubPhaseMove, HubStatus, User
from tests.hub_support import add_member, auth, make_hub, make_user, run

PHASES = ["brainstorm", "design", "build", "review"]


def confirm(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/team/confirm", headers=auth(caller))


def move(client: TestClient, hub: Hub, caller: User, phase: Any) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/phase", headers=auth(caller), json={"phase": phase})


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def states(card: dict[str, Any]) -> list[str]:
    assert [step["phase"] for step in card["phases"]] == PHASES
    return [step["state"] for step in card["phases"]]


def moves(hub: Hub) -> list[tuple[str | None, str]]:
    async def work(session: AsyncSession) -> list[tuple[str | None, str]]:
        rows = await session.scalars(
            select(HubPhaseMove)
            .where(HubPhaseMove.hub_id == hub.id)
            .order_by(HubPhaseMove.created_at)
        )
        return [
            (row.from_phase.value if row.from_phase else None, row.to_phase.value) for row in rows
        ]

    return run(work)


def confirmed_hub(client: TestClient) -> tuple[Hub, User]:
    owner = make_user()
    hub = make_hub(owner)
    assert confirm(client, hub, owner).status_code == 200
    return hub, owner


def test_a_new_hub_has_no_phase_and_nothing_started(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]

    assert card["phase"] is None
    assert card["team_confirmed_at"] is None
    assert states(card) == ["not_started"] * 4


def test_the_owner_alone_confirms_the_team_and_brainstorm_opens(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    resp = confirm(client, hub, owner)

    assert resp.status_code == 200, resp.text
    card = resp.json()["data"]
    assert card["id"] == str(hub.id)
    assert card["phase"] == "brainstorm"
    assert card["team_confirmed_at"] is not None
    assert states(card) == ["in_progress", "not_started", "not_started", "not_started"]
    # everyone who can read the card sees it
    seen = client.get(f"/v1/hubs/{hub.id}", headers=auth(make_user())).json()["data"]
    assert seen["phase"] == "brainstorm" and states(seen) == states(card)
    assert moves(hub) == [(None, "brainstorm")]


def test_confirming_twice_is_refused_and_logs_nothing(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)

    assert_error(confirm(client, hub, owner), 409, "TEAM_ALREADY_CONFIRMED")

    assert moves(hub) == [(None, "brainstorm")]


def test_the_phase_moves_forward_one_step_at_a_time(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)
    expected = [
        ["done", "in_progress", "not_started", "not_started"],
        ["done", "done", "in_progress", "not_started"],
        ["done", "done", "done", "in_progress"],
    ]

    for phase, wanted in zip(PHASES[1:], expected, strict=True):
        resp = move(client, hub, owner, phase)
        assert resp.status_code == 200, resp.text
        card = resp.json()["data"]
        assert card["phase"] == phase
        assert states(card) == wanted

    assert moves(hub) == [(None, "brainstorm"), *zip(PHASES, PHASES[1:], strict=False)]


def test_skipping_a_phase_is_refused(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)

    assert_error(move(client, hub, owner, "build"), 409, "PHASE_NOT_ADJACENT")
    assert_error(move(client, hub, owner, "review"), 409, "PHASE_NOT_ADJACENT")

    assert moves(hub) == [(None, "brainstorm")]


def test_the_owner_can_go_back_one_phase_but_not_two(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)
    for phase in ("design", "build"):
        assert move(client, hub, owner, phase).status_code == 200

    assert_error(move(client, hub, owner, "brainstorm"), 409, "PHASE_NOT_ADJACENT")
    back = move(client, hub, owner, "design")

    assert back.status_code == 200, back.text
    card = back.json()["data"]
    assert card["phase"] == "design"
    assert states(card) == ["done", "in_progress", "not_started", "not_started"]
    assert moves(hub)[-1] == ("build", "design")


def test_brainstorm_has_nothing_before_it(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)

    assert_error(move(client, hub, owner, "brainstorm"), 409, "PHASE_NOT_ADJACENT")
    assert move(client, hub, owner, None).status_code == 422

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]
    assert card["phase"] == "brainstorm" and card["team_confirmed_at"] is not None


def test_a_move_before_the_team_is_confirmed_is_refused(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    assert_error(move(client, hub, owner, "brainstorm"), 409, "TEAM_NOT_CONFIRMED")
    assert_error(move(client, hub, owner, "design"), 409, "TEAM_NOT_CONFIRMED")
    assert moves(hub) == []


def test_a_request_sent_twice_moves_the_hub_once(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)

    assert move(client, hub, owner, "design").status_code == 200
    assert_error(move(client, hub, owner, "design"), 409, "PHASE_NOT_ADJACENT")

    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]
    assert card["phase"] == "design"
    assert moves(hub) == [(None, "brainstorm"), ("brainstorm", "design")]


@pytest.mark.parametrize("phase", ["finished", "Design", "", 3])
def test_an_unknown_phase_is_a_422(client: TestClient, phase: Any) -> None:
    hub, owner = confirmed_hub(client)

    resp = move(client, hub, owner, phase)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "phase"]


@pytest.mark.parametrize("who", ["active member", "invited", "stranger"])
def test_only_the_owner_confirms_or_moves(client: TestClient, who: str) -> None:
    owner = make_user()
    unconfirmed, confirmed = make_hub(owner), make_hub(owner)
    assert confirm(client, confirmed, owner).status_code == 200
    other = make_user()
    for hub in (unconfirmed, confirmed):
        if who != "stranger":
            status = HubMemberStatus.ACTIVE if who == "active member" else HubMemberStatus.INVITED
            add_member(hub, other, status)

    assert_error(confirm(client, unconfirmed, other), 403, "NOT_HUB_OWNER")
    assert_error(move(client, confirmed, other, "design"), 403, "NOT_HUB_OWNER")

    assert moves(unconfirmed) == []
    assert moves(confirmed) == [(None, "brainstorm")]


def test_an_archived_hub_cannot_be_confirmed_or_moved(client: TestClient) -> None:
    owner = make_user()
    never_confirmed = make_hub(owner, archived=True)
    assert_error(confirm(client, never_confirmed, owner), 409, "HUB_ARCHIVED")

    hub, owner = confirmed_hub(client)

    async def archive(session: AsyncSession) -> None:
        await session.execute(
            update(Hub)
            .where(Hub.id == hub.id)
            .values(status=HubStatus.ARCHIVED, archived_at=Hub.created_at)
        )
        await session.commit()

    run(archive)

    assert_error(move(client, hub, owner, "design"), 409, "HUB_ARCHIVED")
    assert moves(hub) == [(None, "brainstorm")]
    assert moves(never_confirmed) == []


def test_an_unknown_hub_is_not_found(client: TestClient) -> None:
    caller = make_user()

    for resp in (
        client.post(f"/v1/hubs/{uuid4()}/team/confirm", headers=auth(caller)),
        client.post(f"/v1/hubs/{uuid4()}/phase", headers=auth(caller), json={"phase": "design"}),
    ):
        assert_error(resp, 404, "NOT_FOUND")


def test_the_routes_need_a_signed_in_user(client: TestClient) -> None:
    hub = make_hub(make_user())

    assert client.post(f"/v1/hubs/{hub.id}/team/confirm").status_code == 401
    assert client.post(f"/v1/hubs/{hub.id}/phase", json={"phase": "design"}).status_code == 401


def test_the_phase_log_cannot_be_changed_or_deleted(client: TestClient) -> None:
    hub, _ = confirmed_hub(client)

    async def change(session: AsyncSession) -> None:
        await session.execute(
            update(HubPhaseMove).where(HubPhaseMove.hub_id == hub.id).values(to_phase="review")
        )

    async def remove(session: AsyncSession) -> None:
        await session.execute(delete(HubPhaseMove).where(HubPhaseMove.hub_id == hub.id))

    for work in (change, remove):
        with pytest.raises(DBAPIError, match="append-only"):
            run(work)
    assert moves(hub) == [(None, "brainstorm")]


def test_inviting_stays_open_after_the_team_is_confirmed(client: TestClient) -> None:
    hub, owner = confirmed_hub(client)
    newcomer = make_user()

    invited = client.post(
        f"/v1/hubs/{hub.id}/invitations", headers=auth(owner), json={"username": newcomer.username}
    )

    assert invited.status_code == 201, invited.text
    assert invited.json()["data"]["status"] == "invited"
