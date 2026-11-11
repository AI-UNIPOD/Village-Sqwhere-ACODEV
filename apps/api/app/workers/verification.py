from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.users import UserRole, VerificationPhase, VerificationSession, VerificationStatus
from app.services.verification import (
    CodebaseAnalysisResult,
    CodebaseAnalyzer,
    RepositorySnapshotClient,
    analyze_codebase,
)


async def process_codebase_analysis(
    db: AsyncSession,
    session_id: UUID,
    repository_client: RepositorySnapshotClient,
    analyzer: CodebaseAnalyzer,
) -> CodebaseAnalysisResult | None:
    """Claim and process one pending session, returning None when another worker owns it."""
    result = await db.execute(
        select(VerificationSession)
        .options(selectinload(VerificationSession.user_role).selectinload(UserRole.role))
        .where(
            VerificationSession.id == session_id,
            VerificationSession.status == VerificationStatus.PENDING,
            VerificationSession.current_phase == VerificationPhase.CODEBASE_ANALYSIS,
        )
        .with_for_update(skip_locked=True)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    session.status = VerificationStatus.IN_PROGRESS
    await db.flush()
    analysis = await analyze_codebase(
        session,
        session.user_role.role.slug,
        repository_client,
        analyzer,
    )
    session.ai_score = analysis.score
    session.ai_result = {"codebase_analysis": analysis.model_dump(mode="json")}
    session.current_phase = VerificationPhase.TECHNICAL_DEFENCE
    await db.commit()
    return analysis
