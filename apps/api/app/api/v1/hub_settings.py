"""The owner renames or describes a hub, and archives it when the work is over. An archived hub
stays readable to its members and changes no more.
Why: docs/decisions/2026-11-14-hub-edit-and-archive.md
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import find_hub, require_active_hub, require_owner
from app.models import Hub, HubStatus
from app.schemas.hubs import HubResponse, UpdateHubRequest
from app.services.hubs import hub_card, load_hub

router = APIRouter()


async def owned_active_hub(db: DbSession, hub_id: UUID, user: CurrentUser, message: str) -> Hub:
    hub = await find_hub(db, hub_id, user, lock=True)
    require_owner(hub, user.id, message)
    require_active_hub(hub, "This hub is archived, so it cannot change.")
    return hub


async def saved_card(db: DbSession, hub: Hub, user: CurrentUser) -> HubResponse:
    await db.commit()
    saved = await load_hub(db, hub.id)
    assert saved is not None
    return HubResponse(data=await hub_card(db, saved, user.id))


@router.patch("/hubs/{hub_id}", response_model=HubResponse)
async def update_hub(
    hub_id: UUID, payload: UpdateHubRequest, current_user: CurrentUser, db: DbSession
) -> HubResponse:
    hub = await owned_active_hub(
        db, hub_id, current_user, "Only the hub's owner can rename or describe it."
    )
    changed = payload.model_fields_set
    if "name" in changed:
        assert payload.name is not None  # the schema refuses null
        hub.name = payload.name
    if "description" in changed:
        hub.description = payload.description
    return await saved_card(db, hub, current_user)


@router.post("/hubs/{hub_id}/archive", response_model=HubResponse)
async def archive_hub(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await owned_active_hub(db, hub_id, current_user, "Only the hub's owner can archive it.")
    hub.status, hub.archived_at = HubStatus.ARCHIVED, datetime.now(UTC)
    return await saved_card(db, hub, current_user)
