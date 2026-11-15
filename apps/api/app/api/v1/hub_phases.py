"""A hub's phase: the owner confirms the team, which opens brainstorm, then moves the hub one
phase forward or one back. Why these rules: docs/decisions/2026-11-14-hub-phases.md

Like every change to a hub's members, both routes lock the hub row first, so two requests from
the owner cannot both move it from the same phase.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import find_hub, require_active_hub, require_owner
from app.api.v1.hub_review import require_not_finished
from app.api.v1.hubs import hub_error
from app.models import Hub, HubPhase, HubPhaseMove
from app.schemas.hubs import HubResponse, MovePhaseRequest
from app.services.hubs import hub_card, load_hub

router = APIRouter()

PHASES = list(HubPhase)


async def owned_active_hub(db: DbSession, hub_id: UUID, user: CurrentUser) -> Hub:
    hub = await find_hub(db, hub_id, user, lock=True)
    require_owner(hub, user.id, "Only the hub's owner can confirm the team or move its phase.")
    require_active_hub(hub, "This hub is archived, so its phase cannot change.")
    return hub


async def save_move(db: DbSession, hub: Hub, user: CurrentUser, to_phase: HubPhase) -> HubResponse:
    db.add(HubPhaseMove(hub_id=hub.id, moved_by=user.id, from_phase=hub.phase, to_phase=to_phase))
    hub.phase = to_phase
    hub.team_confirmed_at = hub.team_confirmed_at or datetime.now(UTC)
    await db.commit()

    moved = await load_hub(db, hub.id)
    assert moved is not None
    return HubResponse(data=await hub_card(db, moved, user.id))


@router.post("/hubs/{hub_id}/team/confirm", response_model=HubResponse)
async def confirm_team(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await owned_active_hub(db, hub_id, current_user)
    if hub.phase is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_ALREADY_CONFIRMED",
            "The team is already confirmed. Move the hub with POST /v1/hubs/{hub_id}/phase.",
        )
    return await save_move(db, hub, current_user, HubPhase.BRAINSTORM)


@router.post("/hubs/{hub_id}/phase", response_model=HubResponse)
async def move_phase(
    hub_id: UUID, payload: MovePhaseRequest, current_user: CurrentUser, db: DbSession
) -> HubResponse:
    hub = await owned_active_hub(db, hub_id, current_user)
    if hub.phase is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_NOT_CONFIRMED",
            "Confirm the team first with POST /v1/hubs/{hub_id}/team/confirm.",
        )
    require_not_finished(hub, "This hub is finished, so it cannot move to another phase.")
    # Exactly one step either way. Asking for the phase the hub is already in is refused too,
    # so a request sent twice moves the hub once.
    if abs(PHASES.index(payload.phase) - PHASES.index(hub.phase)) != 1:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_NOT_ADJACENT",
            f"The hub is in {hub.phase.value}. It moves one phase at a time, forward or back.",
        )
    return await save_move(db, hub, current_user, payload.phase)
