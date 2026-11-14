"""Brainstorm notes: short sticky notes the team writes while the hub is in brainstorm.
Why these rules: docs/decisions/2026-11-14-hub-brainstorm-notes.md

Active members read them in every phase once the team is confirmed, and write only in
brainstorm. Both writes lock the hub row first, like the phase routes, so a note cannot be
added or removed while the owner moves the phase, and two requests cannot both take the
200th place.
"""

from uuid import UUID

from fastapi import APIRouter, Response, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import require_active_hub, require_active_member
from app.api.v1.hubs import hub_error
from app.api.v1.posts import PageLimit, PageOffset
from app.models import Hub, HubNote, HubPhase, HubStatus, User
from app.schemas.hubs import (
    AddNoteRequest,
    HubNoteCard,
    HubNoteListResponse,
    HubNoteResponse,
    HubOwner,
)

router = APIRouter()

# The most notes a hub keeps that are not deleted. Why 200: the decision record above.
MAX_NOTES = 200


def writable(hub: Hub) -> bool:
    return hub.status == HubStatus.ACTIVE and hub.phase == HubPhase.BRAINSTORM


def require_confirmed(hub: Hub) -> None:
    if hub.phase is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_NOT_CONFIRMED",
            "The team is not confirmed yet, so the hub has no notes. The owner confirms the team.",
        )


def require_writable(hub: Hub) -> None:
    require_confirmed(hub)
    if hub.phase != HubPhase.BRAINSTORM:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_CLOSED",
            "Brainstorm is over, so notes can no longer be added or removed. They stay readable.",
        )
    require_active_hub(hub, "This hub is archived, so its notes cannot change.")


def note_card(note: HubNote, author: User, hub: Hub, viewer: User) -> HubNoteCard:
    return HubNoteCard(
        id=note.id,
        body=note.body,
        author=HubOwner.model_validate(author),
        created_at=note.created_at,
        can_delete=writable(hub) and viewer.id in (note.author_id, hub.owner_id),
    )


def live_notes(hub_id: UUID) -> Select[tuple[HubNote]]:
    return select(HubNote).where(HubNote.hub_id == hub_id, HubNote.deleted_at.is_(None))


async def find_note(db: AsyncSession, hub: Hub, note_id: UUID) -> HubNote:
    note = await db.scalar(live_notes(hub.id).where(HubNote.id == note_id))
    if note is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOTE_NOT_FOUND", "Note not found.")
    return note


@router.get("/hubs/{hub_id}/notes", response_model=HubNoteListResponse)
async def list_notes(
    hub_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 50,
) -> HubNoteListResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_confirmed(hub)
    rows = (
        await db.execute(
            live_notes(hub.id)
            .add_columns(User)
            .join(User, User.id == HubNote.author_id)
            .options(raiseload("*"))
            .order_by(HubNote.created_at, HubNote.id)
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    return HubNoteListResponse(
        data=[note_card(note, author, hub, current_user) for note, author in rows[:limit]],
        next_offset=offset + limit if len(rows) > limit else None,
    )


@router.post(
    "/hubs/{hub_id}/notes", response_model=HubNoteResponse, status_code=status.HTTP_201_CREATED
)
async def add_note(
    hub_id: UUID, payload: AddNoteRequest, current_user: CurrentUser, db: DbSession
) -> HubNoteResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    count = await db.scalar(select(func.count()).select_from(live_notes(hub.id).subquery()))
    if count >= MAX_NOTES:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "NOTES_FULL",
            f"The hub already has {MAX_NOTES} notes. Remove one before adding another.",
        )
    note = HubNote(hub_id=hub.id, author_id=current_user.id, body=payload.body)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return HubNoteResponse(data=note_card(note, current_user, hub, current_user))


@router.delete("/hubs/{hub_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    hub_id: UUID, note_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    note = await find_note(db, hub, note_id)
    if current_user.id not in (note.author_id, hub.owner_id):
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_NOTE_AUTHOR",
            "Only the note's author or the hub's owner can remove it.",
        )
    note.deleted_at = func.now()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
