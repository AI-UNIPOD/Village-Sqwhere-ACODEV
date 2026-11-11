from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.models.lookups import Role
from app.models.users import (
    AuthProvider,
    UserRole,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.schemas.verification import (
    StartVerificationRequest,
    VerificationItemResponse,
    VerificationListResponse,
    VerificationResponse,
)

router = APIRouter()


def session_to_response(session: VerificationSession) -> VerificationResponse:
    return VerificationResponse(
        id=session.id,
        role=session.user_role.role.slug,
        role_name=session.user_role.role.name,
        attempt_number=session.attempt_number,
        status=session.status.value,
        current_phase=session.current_phase.value if session.current_phase else None,
        analysis_attempts=session.analysis_attempts,
        last_error=session.last_error,
        source=session.source.value if session.source else None,
        evidence=session.evidence,
        ai_score=float(session.ai_score) if session.ai_score is not None else None,
        ai_result=session.ai_result,
        reviewer_notes=session.reviewer_notes,
        started_at=session.started_at,
        completed_at=session.completed_at,
        decided_at=session.decided_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def session_options():
    return [
        selectinload(VerificationSession.user_role).selectinload(UserRole.role),
    ]


async def get_applicant_session(
    session_id: UUID, current_user: CurrentUser, db: DbSession
) -> VerificationSession:
    result = await db.execute(
        select(VerificationSession)
        .options(*session_options())
        .where(
            VerificationSession.id == session_id,
            VerificationSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Verification attempt not found."},
        )
    return session


@router.post(
    "/me/verifications/{role_slug}",
    response_model=VerificationItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_verification(
    payload: StartVerificationRequest,
    current_user: CurrentUser,
    db: DbSession,
    role_slug: str = Path(..., description="Claimed role to verify"),
) -> VerificationItemResponse:
    role_result = await db.execute(
        select(UserRole)
        .options(selectinload(UserRole.role), selectinload(UserRole.verification_sessions))
        .join(Role, UserRole.role_id == Role.id)
        .where(UserRole.user_id == current_user.id, Role.slug == role_slug)
    )
    user_role = role_result.scalar_one_or_none()
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ROLE_NOT_CLAIMED", "message": f"Role '{role_slug}' is not claimed."},
        )

    sessions = user_role.verification_sessions
    if any(session.status == VerificationStatus.PASSED for session in sessions):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ROLE_ALREADY_VERIFIED", "message": "This role is already verified."},
        )
    if any(
        session.status
        in {
            VerificationStatus.PENDING,
            VerificationStatus.IN_PROGRESS,
            VerificationStatus.AWAITING_REVIEW,
        }
        for session in sessions
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERIFICATION_IN_PROGRESS",
                "message": "A verification attempt is already in progress.",
            },
        )
    if len(sessions) >= 3:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERIFICATION_ATTEMPTS_EXHAUSTED",
                "message": "No verification attempts remain for this role.",
            },
        )

    session = VerificationSession(
        user_id=current_user.id,
        role_id=user_role.role_id,
        attempt_number=1,
        status=VerificationStatus.PENDING,
        current_phase=VerificationPhase.CODEBASE_ANALYSIS,
        source=AuthProvider.GITHUB,
        evidence=[{"repository_url": repository} for repository in payload.repositories],
        started_at=datetime.now(UTC),
    )
    db.add(session)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERIFICATION_CONFLICT",
                "message": "The verification attempt could not be started. Try again.",
            },
        ) from None

    result = await db.execute(
        select(VerificationSession)
        .options(*session_options())
        .where(VerificationSession.id == session.id)
    )
    return VerificationItemResponse(data=session_to_response(result.scalar_one()))


@router.get("/me/verifications", response_model=VerificationListResponse)
async def list_my_verifications(
    current_user: CurrentUser,
    db: DbSession,
    role_slug: Annotated[str | None, Query()] = None,
    verification_status: Annotated[VerificationStatus | None, Query(alias="status")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> VerificationListResponse:
    query = (
        select(VerificationSession)
        .options(*session_options())
        .join(Role, VerificationSession.role_id == Role.id)
        .where(VerificationSession.user_id == current_user.id)
        .order_by(VerificationSession.created_at.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    if role_slug:
        query = query.where(Role.slug == role_slug)
    if verification_status:
        query = query.where(VerificationSession.status == verification_status)
    result = await db.execute(query)
    sessions = list(result.scalars().unique().all())
    has_more = len(sessions) > limit
    sessions = sessions[:limit]
    return VerificationListResponse(
        data=[session_to_response(session) for session in sessions],
        next_offset=offset + limit if has_more else None,
    )


@router.get("/me/verifications/{session_id}", response_model=VerificationItemResponse)
async def get_my_verification(
    session_id: UUID, current_user: CurrentUser, db: DbSession
) -> VerificationItemResponse:
    session = await get_applicant_session(session_id, current_user, db)
    return VerificationItemResponse(data=session_to_response(session))


@router.post("/me/verifications/{session_id}/abandon", response_model=VerificationItemResponse)
async def abandon_verification(
    session_id: UUID, current_user: CurrentUser, db: DbSession
) -> VerificationItemResponse:
    session = await get_applicant_session(session_id, current_user, db)
    if session.status not in {
        VerificationStatus.PENDING,
        VerificationStatus.IN_PROGRESS,
        VerificationStatus.AWAITING_REVIEW,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERIFICATION_NOT_ACTIVE",
                "message": "Only an active verification can be abandoned.",
            },
        )
    session.status = VerificationStatus.ABANDONED
    await db.commit()
    await db.refresh(session)
    return VerificationItemResponse(data=session_to_response(session))
