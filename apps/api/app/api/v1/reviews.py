from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.v1.verifications import session_options, session_to_response
from app.models.users import UserRole, VerificationSession, VerificationStatus
from app.schemas.verification import (
    VerificationDecisionRequest,
    VerificationItemResponse,
    VerificationListResponse,
)

router = APIRouter()


async def reviewer_role_ids(current_user: CurrentUser, db: DbSession) -> list[int]:
    result = await db.execute(
        select(UserRole.role_id).where(
            UserRole.user_id == current_user.id,
            UserRole.verified_at.is_not(None),
        )
    )
    return list(result.scalars().all())


async def get_review_case(
    session_id: UUID, current_user: CurrentUser, db: DbSession, *, lock: bool = False
) -> VerificationSession:
    role_ids = await reviewer_role_ids(current_user, db)
    query = (
        select(VerificationSession)
        .options(*session_options())
        .where(
            VerificationSession.id == session_id,
            VerificationSession.status == VerificationStatus.AWAITING_REVIEW,
            VerificationSession.role_id.in_(role_ids),
            VerificationSession.user_id != current_user.id,
        )
    )
    if lock:
        query = query.with_for_update()
    result = await db.execute(query)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Review case not found."},
        )
    return session


@router.get("/reviews/verifications", response_model=VerificationListResponse)
async def list_review_queue(
    current_user: CurrentUser,
    db: DbSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> VerificationListResponse:
    role_ids = await reviewer_role_ids(current_user, db)
    query = (
        select(VerificationSession)
        .options(*session_options())
        .where(
            VerificationSession.status == VerificationStatus.AWAITING_REVIEW,
            VerificationSession.role_id.in_(role_ids),
            VerificationSession.user_id != current_user.id,
        )
        .order_by(VerificationSession.created_at.asc())
        .offset(offset)
        .limit(limit + 1)
    )
    result = await db.execute(query)
    sessions = list(result.scalars().unique().all())
    has_more = len(sessions) > limit
    sessions = sessions[:limit]
    return VerificationListResponse(
        data=[session_to_response(session) for session in sessions],
        next_offset=offset + limit if has_more else None,
    )


@router.get("/reviews/verifications/{session_id}", response_model=VerificationItemResponse)
async def get_review_verification(
    session_id: UUID, current_user: CurrentUser, db: DbSession
) -> VerificationItemResponse:
    session = await get_review_case(session_id, current_user, db)
    return VerificationItemResponse(data=session_to_response(session))


@router.post(
    "/reviews/verifications/{session_id}/decision",
    response_model=VerificationItemResponse,
)
async def decide_review(
    payload: VerificationDecisionRequest,
    session_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> VerificationItemResponse:
    session = await get_review_case(session_id, current_user, db, lock=True)
    session.status = VerificationStatus(payload.decision)
    session.reviewer_id = current_user.id
    session.reviewer_notes = payload.notes
    session.decided_at = datetime.now(UTC)
    await db.commit()
    result = await db.execute(
        select(VerificationSession)
        .options(*session_options())
        .where(VerificationSession.id == session.id)
    )
    return VerificationItemResponse(data=session_to_response(result.scalar_one()))
