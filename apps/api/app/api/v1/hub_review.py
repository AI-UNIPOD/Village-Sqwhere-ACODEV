"""The review checklist: checks the team writes against each piece, which a teammate ticks, and
the owner finishing the hub. Why these rules: docs/decisions/2026-11-15-hub-review-checklist.md

Active members read it in review. They write only while the hub is active, in review and not
finished. Nobody ticks a check of a piece they build, so the team reads each other's work. Every
write locks the hub row first, like the other tools, so a check cannot be added or ticked while
the owner finishes the hub, and two requests cannot both take a piece's tenth place.
"""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Response, status
from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_build import find_piece, pieces_with_holder
from app.api.v1.hub_members import require_active_hub, require_active_member, require_owner
from app.api.v1.hubs import hub_error
from app.models import Hub, HubCheck, HubPhase, HubPiece, HubStatus, User
from app.schemas.hubs import (
    AddCheckRequest,
    HubCheckCard,
    HubCheckResponse,
    HubOwner,
    HubResponse,
    HubReview,
    HubReviewPiece,
    HubReviewResponse,
)
from app.services.hubs import hub_card, load_hub

router = APIRouter()

# The most checks a piece keeps that are not deleted. Why: the decision record above.
MAX_CHECKS = 10


def writable(hub: Hub) -> bool:
    return (
        hub.status == HubStatus.ACTIVE and hub.phase == HubPhase.REVIEW and hub.finished_at is None
    )


def require_started(hub: Hub) -> None:
    if hub.phase is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_NOT_CONFIRMED",
            "The team is not confirmed yet, so the hub has no review checklist. "
            "The owner confirms the team.",
        )
    if hub.phase != HubPhase.REVIEW:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_NOT_STARTED",
            f"The hub is still in {hub.phase.value}. "
            "The review checklist opens when the owner moves it on.",
        )


def require_not_finished(hub: Hub, message: str) -> None:
    if hub.finished_at is not None:
        raise hub_error(status.HTTP_409_CONFLICT, "HUB_FINISHED", message)


def require_writable(hub: Hub) -> None:
    require_started(hub)
    require_active_hub(hub, "This hub is archived, so its review checklist cannot change.")
    require_not_finished(hub, "This hub is finished, so its review checklist can no longer change.")


def live_checks(hub_id: UUID) -> Select[tuple[HubCheck]]:
    """The checks not deleted, of the pieces not deleted."""
    return (
        select(HubCheck)
        .join(
            HubPiece,
            and_(HubPiece.id == HubCheck.piece_id, HubPiece.deleted_at.is_(None)),
        )
        .where(HubCheck.hub_id == hub_id, HubCheck.deleted_at.is_(None))
    )


def checks_with_people(hub_id: UUID) -> Select[tuple[HubCheck, User, User | None]]:
    writer, ticker = aliased(User), aliased(User)
    return (
        live_checks(hub_id)
        .add_columns(writer, ticker)
        .join(writer, writer.id == HubCheck.created_by)
        .outerjoin(ticker, ticker.id == HubCheck.ticked_by)
        .options(raiseload("*"))
        .order_by(HubCheck.created_at, HubCheck.id)
    )


def check_card(
    check: HubCheck, writer: User, ticker: User | None, holder: User | None, hub: Hub, viewer: User
) -> HubCheckCard:
    can_add = writable(hub)
    return HubCheckCard(
        id=check.id,
        text=check.text,
        created_by=HubOwner.model_validate(writer),
        created_at=check.created_at,
        ticked_by=HubOwner.model_validate(ticker) if ticker else None,
        ticked_at=check.ticked_at,
        can_tick=can_add and ticker is None and (holder is None or holder.id != viewer.id),
        can_untick=can_add and ticker is not None and viewer.id in (ticker.id, hub.owner_id),
        can_delete=can_add and viewer.id in (writer.id, hub.owner_id),
    )


async def clear_ticks_on_own_pieces(db: AsyncSession, hub: Hub) -> None:
    """Take back a tick made by the member who now holds the piece. Claims change in build, and
    a tick made before the claim would let a builder read their own piece. The change commits
    with the phase move that calls this."""
    holders = {piece.id: holder for piece, holder in (await db.execute(pieces_with_holder(hub.id)))}
    for check in await db.scalars(live_checks(hub.id).where(HubCheck.ticked_by.is_not(None))):
        holder = holders.get(check.piece_id)
        if holder is not None and holder.id == check.ticked_by:
            check.ticked_by = check.ticked_at = None


async def find_check(
    db: AsyncSession, hub: Hub, check_id: UUID
) -> tuple[HubCheck, User, User | None, User | None]:
    """The check with who wrote it, who ticked it and who holds its piece."""
    row = (
        await db.execute(checks_with_people(hub.id).where(HubCheck.id == check_id))
    ).one_or_none()
    if row is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "CHECK_NOT_FOUND", "Check not found.")
    check, writer, ticker = row
    _, holder = await find_piece(db, hub, check.piece_id)
    return check, writer, ticker, holder


@router.get("/hubs/{hub_id}/review", response_model=HubReviewResponse)
async def get_review(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubReviewResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_started(hub)
    pieces = (await db.execute(pieces_with_holder(hub.id))).all()
    checks = (await db.execute(checks_with_people(hub.id))).all()
    open_checks = sum(1 for check, _, _ in checks if check.ticked_by is None)
    holders = {piece.id: holder for piece, holder in pieces}
    # The two reads are not one snapshot, so a check may belong to a piece the first read did not
    # list. Such a check is left out.
    cards: defaultdict[UUID, list[HubCheckCard]] = defaultdict(list)
    for check, writer, ticker in checks:
        if check.piece_id in holders:
            cards[check.piece_id].append(
                check_card(check, writer, ticker, holders[check.piece_id], hub, current_user)
            )
    return HubReviewResponse(
        data=HubReview(
            finished_at=hub.finished_at,
            can_add=writable(hub),
            can_finish=writable(hub) and current_user.id == hub.owner_id and open_checks == 0,
            open_checks=open_checks,
            pieces=[
                HubReviewPiece(
                    id=piece.id,
                    name=piece.name,
                    summary=piece.summary,
                    claimed_by=HubOwner.model_validate(holder) if holder else None,
                    checks=cards[piece.id],
                )
                for piece, holder in pieces
            ],
        )
    )


@router.post(
    "/hubs/{hub_id}/pieces/{piece_id}/checks",
    response_model=HubCheckResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_check(
    hub_id: UUID, piece_id: UUID, payload: AddCheckRequest, current_user: CurrentUser, db: DbSession
) -> HubCheckResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    piece, holder = await find_piece(db, hub, piece_id)
    count = await db.scalar(
        select(func.count()).select_from(
            live_checks(hub.id).where(HubCheck.piece_id == piece.id).subquery()
        )
    )
    if count >= MAX_CHECKS:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "CHECK_LIMIT",
            f"This piece already has {MAX_CHECKS} checks. Remove one before adding another.",
        )
    check = HubCheck(
        hub_id=hub.id, piece_id=piece.id, text=payload.text, created_by=current_user.id
    )
    db.add(check)
    await db.commit()
    await db.refresh(check)
    return HubCheckResponse(data=check_card(check, current_user, None, holder, hub, current_user))


@router.post("/hubs/{hub_id}/checks/{check_id}/tick", response_model=HubCheckResponse)
async def tick_check(
    hub_id: UUID, check_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubCheckResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    check, writer, ticker, holder = await find_check(db, hub, check_id)
    if holder is not None and holder.id == current_user.id:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "OWN_PIECE",
            "You are building this piece, so a teammate ticks its checks.",
        )
    if ticker is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "CHECK_TICKED",
            f"{ticker.display_name} already ticked this check.",
        )
    check.ticked_by, check.ticked_at = current_user.id, datetime.now(UTC)
    await db.commit()
    return HubCheckResponse(data=check_card(check, writer, current_user, holder, hub, current_user))


@router.delete("/hubs/{hub_id}/checks/{check_id}/tick", response_model=HubCheckResponse)
async def untick_check(
    hub_id: UUID, check_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubCheckResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    check, writer, ticker, holder = await find_check(db, hub, check_id)
    if ticker is None:
        raise hub_error(status.HTTP_409_CONFLICT, "CHECK_NOT_TICKED", "This check is not ticked.")
    if current_user.id not in (ticker.id, hub.owner_id):
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_CHECK_TICKER",
            "Only the member who ticked a check or the hub's owner can untick it.",
        )
    check.ticked_by = check.ticked_at = None
    await db.commit()
    return HubCheckResponse(data=check_card(check, writer, None, holder, hub, current_user))


@router.delete("/hubs/{hub_id}/checks/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_check(
    hub_id: UUID, check_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    check, writer, _, _ = await find_check(db, hub, check_id)
    if current_user.id not in (writer.id, hub.owner_id):
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_CHECK_AUTHOR",
            "Only the check's author or the hub's owner can remove it.",
        )
    check.deleted_at, check.deleted_by = func.now(), current_user.id
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/hubs/{hub_id}/finish", response_model=HubResponse)
async def finish_hub(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id, "Only the hub's owner can finish the hub.")
    require_writable(hub)
    open_checks = await db.scalar(
        select(func.count()).select_from(
            live_checks(hub.id).where(HubCheck.ticked_by.is_(None)).subquery()
        )
    )
    if open_checks:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "CHECKS_OPEN",
            f"Tick every check before finishing the hub. Still open: {open_checks}.",
        )
    hub.finished_at = datetime.now(UTC)
    await db.commit()

    finished = await load_hub(db, hub.id)
    assert finished is not None
    return HubResponse(data=await hub_card(db, finished, current_user.id))
