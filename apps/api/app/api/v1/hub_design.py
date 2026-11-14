"""The design sketch: the pieces of the system and the labelled links between them, which the
web draws as boxes and arrows. Why these rules: docs/decisions/2026-11-14-hub-design-sketch.md

Active members read it once the hub reaches design, and in every later phase. They write only
while the hub is active and in design. Every write locks the hub row first, like the notes
routes, so nothing changes while the owner moves the phase and two requests cannot both take
the last place.
"""

from uuid import UUID

from fastapi import APIRouter, Response, status
from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import require_active_hub, require_active_member
from app.api.v1.hubs import hub_error
from app.models import Hub, HubPhase, HubPiece, HubPieceLink, HubStatus, User
from app.schemas.hubs import (
    AddLinkRequest,
    AddPieceRequest,
    HubDesign,
    HubDesignResponse,
    HubLinkCard,
    HubLinkResponse,
    HubOwner,
    HubPieceCard,
    HubPieceResponse,
    UpdatePieceRequest,
)

router = APIRouter()

# The most pieces and links a hub keeps that are not deleted. Why: the decision record above.
MAX_PIECES = 30
MAX_LINKS = 60


def writable(hub: Hub) -> bool:
    return hub.status == HubStatus.ACTIVE and hub.phase == HubPhase.DESIGN


def require_started(hub: Hub) -> None:
    if hub.phase is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_NOT_CONFIRMED",
            "The team is not confirmed yet, so the hub has no design sketch. "
            "The owner confirms the team.",
        )
    if hub.phase == HubPhase.BRAINSTORM:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_NOT_STARTED",
            "The hub is still in brainstorm. The design sketch opens when the owner moves it on.",
        )


def require_writable(hub: Hub) -> None:
    require_started(hub)
    if hub.phase != HubPhase.DESIGN:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_CLOSED",
            "The design phase is over, so the sketch can no longer change. It stays readable.",
        )
    require_active_hub(hub, "This hub is archived, so its design sketch cannot change.")


def can_delete(hub: Hub, viewer: User, creator_id: UUID) -> bool:
    return writable(hub) and viewer.id in (creator_id, hub.owner_id)


def piece_card(piece: HubPiece, creator: User, hub: Hub, viewer: User) -> HubPieceCard:
    return HubPieceCard(
        id=piece.id,
        name=piece.name,
        summary=piece.summary,
        created_by=HubOwner.model_validate(creator),
        created_at=piece.created_at,
        updated_at=piece.updated_at,
        can_delete=can_delete(hub, viewer, piece.created_by),
    )


def link_card(link: HubPieceLink, creator: User, hub: Hub, viewer: User) -> HubLinkCard:
    return HubLinkCard(
        id=link.id,
        from_piece_id=link.from_piece_id,
        to_piece_id=link.to_piece_id,
        label=link.label,
        created_by=HubOwner.model_validate(creator),
        created_at=link.created_at,
        can_delete=can_delete(hub, viewer, link.created_by),
    )


def live[M: (HubPiece, HubPieceLink)](model: type[M], hub_id: UUID) -> Select[tuple[M]]:
    return select(model).where(model.hub_id == hub_id, model.deleted_at.is_(None))


def with_creator[M: (HubPiece, HubPieceLink)](
    model: type[M], hub_id: UUID
) -> Select[tuple[M, User]]:
    return (
        live(model, hub_id)
        .add_columns(User)
        .join(User, User.id == model.created_by)
        .options(raiseload("*"))
        .order_by(model.created_at, model.id)
    )


async def find_piece(db: AsyncSession, hub: Hub, piece_id: UUID) -> tuple[HubPiece, User]:
    row = (
        await db.execute(with_creator(HubPiece, hub.id).where(HubPiece.id == piece_id))
    ).one_or_none()
    if row is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "PIECE_NOT_FOUND", "Piece not found.")
    piece, creator = row
    return piece, creator


async def find_link(db: AsyncSession, hub: Hub, link_id: UUID) -> HubPieceLink:
    link = await db.scalar(live(HubPieceLink, hub.id).where(HubPieceLink.id == link_id))
    if link is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "LINK_NOT_FOUND", "Link not found.")
    return link


async def require_free_name(
    db: AsyncSession, hub: Hub, name: str, own_id: UUID | None = None
) -> None:
    """Compared the way the hub_pieces_name_uq index does, in the database."""
    same_name = live(HubPiece, hub.id).where(
        func.lower(func.btrim(HubPiece.name)) == func.lower(func.btrim(name))
    )
    if own_id is not None:
        same_name = same_name.where(HubPiece.id != own_id)
    taken = await db.scalar(same_name.with_only_columns(HubPiece.id).limit(1))
    if taken is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PIECE_NAME_TAKEN",
            "Another piece in this hub already has that name. Pick a different name.",
        )


def require_creator_or_owner(hub: Hub, user: User, creator_id: UUID, code: str, what: str) -> None:
    if user.id not in (creator_id, hub.owner_id):
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            code,
            f"Only the {what}'s creator or the hub's owner can remove it.",
        )


@router.get("/hubs/{hub_id}/design", response_model=HubDesignResponse)
async def get_design(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubDesignResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_started(hub)
    pieces = (await db.execute(with_creator(HubPiece, hub.id))).all()
    links = (await db.execute(with_creator(HubPieceLink, hub.id))).all()
    return HubDesignResponse(
        data=HubDesign(
            pieces=[piece_card(piece, creator, hub, current_user) for piece, creator in pieces],
            links=[link_card(link, creator, hub, current_user) for link, creator in links],
        )
    )


@router.post(
    "/hubs/{hub_id}/pieces", response_model=HubPieceResponse, status_code=status.HTTP_201_CREATED
)
async def add_piece(
    hub_id: UUID, payload: AddPieceRequest, current_user: CurrentUser, db: DbSession
) -> HubPieceResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    count = await db.scalar(select(func.count()).select_from(live(HubPiece, hub.id).subquery()))
    if count >= MAX_PIECES:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PIECES_FULL",
            f"The hub already has {MAX_PIECES} pieces. Remove one before adding another.",
        )
    await require_free_name(db, hub, payload.name)
    piece = HubPiece(
        hub_id=hub.id, name=payload.name, summary=payload.summary, created_by=current_user.id
    )
    db.add(piece)
    await db.commit()
    await db.refresh(piece)
    return HubPieceResponse(data=piece_card(piece, current_user, hub, current_user))


@router.patch("/hubs/{hub_id}/pieces/{piece_id}", response_model=HubPieceResponse)
async def update_piece(
    hub_id: UUID,
    piece_id: UUID,
    payload: UpdatePieceRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HubPieceResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    piece, creator = await find_piece(db, hub, piece_id)
    if payload.name is not None:
        await require_free_name(db, hub, payload.name, piece.id)
        piece.name = payload.name
    if payload.summary is not None:
        piece.summary = payload.summary
    await db.commit()
    await db.refresh(piece)
    return HubPieceResponse(data=piece_card(piece, creator, hub, current_user))


@router.delete("/hubs/{hub_id}/pieces/{piece_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_piece(
    hub_id: UUID, piece_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    piece, _ = await find_piece(db, hub, piece_id)
    require_creator_or_owner(hub, current_user, piece.created_by, "NOT_PIECE_AUTHOR", "piece")
    # its links go with it, in the same transaction
    await db.execute(
        update(HubPieceLink)
        .where(
            HubPieceLink.hub_id == hub.id,
            HubPieceLink.deleted_at.is_(None),
            or_(HubPieceLink.from_piece_id == piece.id, HubPieceLink.to_piece_id == piece.id),
        )
        .values(deleted_at=func.now())
    )
    piece.deleted_at = func.now()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/hubs/{hub_id}/links", response_model=HubLinkResponse, status_code=status.HTTP_201_CREATED
)
async def add_link(
    hub_id: UUID, payload: AddLinkRequest, current_user: CurrentUser, db: DbSession
) -> HubLinkResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    found = await db.scalar(
        select(func.count()).select_from(
            live(HubPiece, hub.id)
            .where(HubPiece.id.in_([payload.from_piece_id, payload.to_piece_id]))
            .subquery()
        )
    )
    if found != 2:
        raise hub_error(status.HTTP_404_NOT_FOUND, "PIECE_NOT_FOUND", "Piece not found.")
    exists = await db.scalar(
        live(HubPieceLink, hub.id)
        .where(
            HubPieceLink.from_piece_id == payload.from_piece_id,
            HubPieceLink.to_piece_id == payload.to_piece_id,
        )
        .with_only_columns(HubPieceLink.id)
        .limit(1)
    )
    if exists is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "LINK_EXISTS",
            "These two pieces are already linked in that direction.",
        )
    count = await db.scalar(select(func.count()).select_from(live(HubPieceLink, hub.id).subquery()))
    if count >= MAX_LINKS:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "LINKS_FULL",
            f"The hub already has {MAX_LINKS} links. Remove one before adding another.",
        )
    link = HubPieceLink(
        hub_id=hub.id,
        from_piece_id=payload.from_piece_id,
        to_piece_id=payload.to_piece_id,
        label=payload.label,
        created_by=current_user.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return HubLinkResponse(data=link_card(link, current_user, hub, current_user))


@router.delete("/hubs/{hub_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    hub_id: UUID, link_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    link = await find_link(db, hub, link_id)
    require_creator_or_owner(hub, current_user, link.created_by, "NOT_LINK_AUTHOR", "link")
    link.deleted_at = func.now()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
