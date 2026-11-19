import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select

from app.config import (
    VERIFICATION_MAX_ANALYSIS_ATTEMPTS,
    VERIFICATION_WORKER_INTERVAL_SECONDS,
)
from app.database import async_session
from app.demo_seed import redate_if_stale
from app.models.users import VerificationPhase, VerificationSession, VerificationStatus
from app.services.embeddings import OpenAIEmbedder
from app.services.fallback import FallbackCodebaseAnalyzer
from app.services.gemini import GeminiCodebaseAnalyzer
from app.services.gemini_report import GeminiReportEvaluator
from app.services.groq import GroqCodebaseAnalyzer
from app.services.groq_report import GroqReportEvaluator
from app.services.report import FallbackReportEvaluator
from app.services.verification import GitHubRepositoryClient
from app.workers.embeddings import embed_missing
from app.workers.verification import process_codebase_analysis, process_verification_report

logger = logging.getLogger(__name__)

# A run that fails is tried again an hour later, not on every pass of the loop.
REDATE_RETRY_AFTER = timedelta(hours=1)
last_redate_try: datetime | None = None


async def pending_session_ids(limit: int = 10) -> list[UUID]:
    async with async_session() as db:
        result = await db.execute(
            select(VerificationSession.id)
            .where(
                VerificationSession.status == VerificationStatus.PENDING,
                VerificationSession.current_phase == VerificationPhase.CODEBASE_ANALYSIS,
                VerificationSession.analysis_attempts < VERIFICATION_MAX_ANALYSIS_ATTEMPTS,
            )
            .order_by(VerificationSession.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())


async def report_session_ids(limit: int = 10) -> list[UUID]:
    async with async_session() as db:
        result = await db.execute(
            select(VerificationSession.id)
            .where(
                VerificationSession.status == VerificationStatus.IN_PROGRESS,
                VerificationSession.current_phase == VerificationPhase.REPORT_GENERATION,
            )
            .order_by(VerificationSession.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())


async def run_once() -> int:
    codebase_analyzer = FallbackCodebaseAnalyzer(
        GroqCodebaseAnalyzer(),
        GeminiCodebaseAnalyzer(),
    )
    repository_client = GitHubRepositoryClient()
    processed = 0
    for session_id in await pending_session_ids():
        try:
            async with async_session() as db:
                if await process_codebase_analysis(
                    db, session_id, repository_client, codebase_analyzer
                ):
                    processed += 1
        except Exception:
            logger.exception("Codebase analysis failed for verification session %s", session_id)

    report_evaluator = FallbackReportEvaluator(
        GroqReportEvaluator(),
        GeminiReportEvaluator(),
    )
    for session_id in await report_session_ids():
        try:
            async with async_session() as db:
                if await process_verification_report(db, session_id, report_evaluator):
                    processed += 1
        except Exception:
            logger.exception("Verification report failed for session %s", session_id)

    try:
        processed += await embed_missing(OpenAIEmbedder())
    except Exception:
        logger.exception("Embedding run failed")
    await redate_demo()
    return processed


async def redate_demo() -> None:
    """Keeps the demo's feed fresh (app.demo_seed.redate_if_stale): a pass costs one query, and the
    rewrite happens about once a day."""
    global last_redate_try
    now = datetime.now(UTC)
    if last_redate_try is not None and now - last_redate_try < REDATE_RETRY_AFTER:
        return
    try:
        async with async_session() as db:
            wrote = await redate_if_stale(db)
    except Exception:
        last_redate_try = now
        logger.exception("Re-dating the demo failed")
        return
    if wrote:
        logger.info("The demo's posts and comments were dated back from now again.")


async def run_forever(
    interval_seconds: float = VERIFICATION_WORKER_INTERVAL_SECONDS,
    sleep: Callable[[float], object] = asyncio.sleep,
) -> None:
    while True:
        await run_once()
        await sleep(interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_forever())
