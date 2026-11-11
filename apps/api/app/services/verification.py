from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Protocol

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import VerificationPhase, VerificationSession, VerificationStatus


class CodebaseAnalysisResult(BaseModel):
    score: float = Field(ge=0, le=100)
    summary: str = Field(min_length=1, max_length=4000)
    strengths: list[str] = Field(max_length=20)
    concerns: list[str] = Field(max_length=20)
    evidence: list[dict] = Field(max_length=50)
    model: str = Field(min_length=1, max_length=100)


class CodebaseAnalyzer(Protocol):
    async def analyze(
        self, repositories: Sequence[str], role_slug: str
    ) -> CodebaseAnalysisResult: ...


async def run_codebase_analysis(
    db: AsyncSession,
    session: VerificationSession,
    role_slug: str,
    analyzer: CodebaseAnalyzer,
) -> CodebaseAnalysisResult:
    """Run and persist phase one without making the HTTP request wait for analysis."""
    if session.status not in {VerificationStatus.PENDING, VerificationStatus.IN_PROGRESS}:
        raise ValueError("Verification session is not available for codebase analysis.")
    if session.current_phase != VerificationPhase.CODEBASE_ANALYSIS:
        raise ValueError("Verification session is not in the codebase analysis phase.")

    session.status = VerificationStatus.IN_PROGRESS
    await db.commit()

    repositories = [item["repository_url"] for item in session.evidence]
    result = await analyzer.analyze(repositories, role_slug)

    session.ai_score = result.score
    session.ai_result = {"codebase_analysis": result.model_dump(mode="json")}
    session.current_phase = VerificationPhase.TECHNICAL_DEFENCE
    session.updated_at = datetime.now(UTC)
    await db.commit()
    return result
