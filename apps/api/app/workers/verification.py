from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import VERIFICATION_MAX_ANALYSIS_ATTEMPTS, VERIFICATION_MAX_REPORT_ATTEMPTS
from app.models.users import (
    UserRole,
    VerificationInterview,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.services.report import ReportEvaluator, VerificationReport
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
            VerificationSession.analysis_attempts < VERIFICATION_MAX_ANALYSIS_ATTEMPTS,
        )
        .with_for_update(skip_locked=True)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    session.status = VerificationStatus.IN_PROGRESS
    session.analysis_attempts += 1
    session.last_error = None
    await db.flush()
    try:
        analysis = await analyze_codebase(
            session,
            session.user_role.role.slug,
            repository_client,
            analyzer,
        )
    except Exception:
        if session.analysis_attempts >= VERIFICATION_MAX_ANALYSIS_ATTEMPTS:
            # The worker never picks it up again, so end it: otherwise the page waits forever
            # and a new start is refused as "in progress".
            session.status = VerificationStatus.ABANDONED
            session.last_error = "Codebase analysis failed on every try, so the attempt ended."
        else:
            session.status = VerificationStatus.PENDING
            session.last_error = "Codebase analysis failed. It will be retried if attempts remain."
        await db.commit()
        raise
    session.ai_score = analysis.score
    session.ai_result = {"codebase_analysis": analysis.model_dump(mode="json")}
    session.current_phase = VerificationPhase.TECHNICAL_DEFENCE
    await db.commit()
    return analysis


async def process_verification_report(
    db: AsyncSession,
    session_id: UUID,
    evaluator: ReportEvaluator,
) -> VerificationReport | None:
    result = await db.execute(
        select(VerificationSession)
        .options(
            selectinload(VerificationSession.user_role).selectinload(UserRole.role),
            selectinload(VerificationSession.interview).selectinload(VerificationInterview.turns),
        )
        .where(
            VerificationSession.id == session_id,
            VerificationSession.status == VerificationStatus.IN_PROGRESS,
            VerificationSession.current_phase == VerificationPhase.REPORT_GENERATION,
        )
        .with_for_update(skip_locked=True)
    )
    session = result.scalar_one_or_none()
    if not session or not session.interview:
        return None

    turns = [
        {
            "sequence": turn.sequence,
            "question": turn.question,
            "answer": turn.answer_text,
            "acknowledgement": turn.acknowledgement,
            "security_flags": turn.security_flags,
        }
        for turn in session.interview.turns
    ]
    codebase_result = (session.ai_result or {}).get("codebase_analysis", {})
    try:
        report = await evaluator.evaluate(
            session.user_role.role.slug,
            codebase_result,
            turns,
            session.language,
        )
    except Exception:
        # Counted in ai_result, which needs no new column. Without a cap the worker would call
        # every provider again every few seconds for ever when an answer can never pass.
        failures = (session.ai_result or {}).get("report_failures", 0) + 1
        session.ai_result = {**(session.ai_result or {}), "report_failures": failures}
        if failures >= VERIFICATION_MAX_REPORT_ATTEMPTS:
            session.status = VerificationStatus.ABANDONED
            session.last_error = "The report failed on every try, so the attempt ended."
        await db.commit()
        raise
    session.ai_result = {
        **{
            key: value
            for key, value in (session.ai_result or {}).items()
            if key != "report_failures"
        },
        "interview_transcript": {
            "welcome": session.interview.welcome_message,
            "turns": turns,
            "closing": session.interview.closing_message,
        },
        "final_report": report.model_dump(mode="json"),
    }
    session.status = VerificationStatus.AWAITING_REVIEW
    session.current_phase = None
    session.completed_at = datetime.now(UTC)
    await db.commit()
    return report
