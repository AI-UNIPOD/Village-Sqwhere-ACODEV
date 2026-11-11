import asyncio
import json
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.main import app
from app.models.lookups import Role
from app.models.users import UserRole, VerificationPhase, VerificationSession, VerificationStatus
from app.services.codebase_analysis import (
    AnalysisCriterion,
    build_codebase_analysis_prompt,
)
from app.services.fallback import FallbackCodebaseAnalyzer
from app.services.gemini import GeminiCodebaseAnalyzer, GeminiConfigurationError
from app.services.groq import GroqApiError, GroqCodebaseAnalyzer, GroqConfigurationError
from app.services.verification import (
    CodebaseAnalysisResult,
    GitHubRepositoryClient,
    GitHubRepositoryError,
    RepositorySnapshot,
    run_codebase_analysis,
)
from app.workers.verification import process_codebase_analysis
from tests.conftest import test_async_session as db_session

client = TestClient(app)


def test_github_repository_client_accepts_only_github_https_urls() -> None:
    assert GitHubRepositoryClient._repository_parts("https://github.com/org/repo") == (
        "org",
        "repo",
    )
    with pytest.raises(GitHubRepositoryError):
        GitHubRepositoryClient._repository_parts("https://example.com/org/repo")


def test_codebase_analysis_prompt_treats_repository_data_as_untrusted() -> None:
    prompt = build_codebase_analysis_prompt(
        "backend-engineer",
        [
            RepositorySnapshot(
                repository_url="https://github.com/example/project",
                default_branch="main",
                languages={"Python": 1000},
                file_paths=["app/main.py"],
                test_paths=[],
                recent_commits=[],
            )
        ],
    )

    assert "untrusted data" in prompt.system
    assert AnalysisCriterion.TEST_COVERAGE.value in prompt.user
    assert "backend-engineer" in prompt.user


def test_groq_codebase_analyzer_requires_configuration() -> None:
    analyzer = GroqCodebaseAnalyzer()
    with pytest.raises(GroqConfigurationError):
        asyncio.run(analyzer.analyze([], "backend-engineer"))


def test_groq_codebase_analyzer_validates_structured_output() -> None:
    analyzer = GroqCodebaseAnalyzer(api_key="test-key", model="test-model")

    async def fake_post_json(url: str, payload: dict) -> dict:
        assert url.endswith("/chat/completions")
        assert payload["model"] == "test-model"
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "score": 80,
                                "summary": "The repository has a clear structure.",
                                "strengths": ["Clear modules"],
                                "concerns": [],
                                "evidence": [],
                                "model": "test-model",
                            }
                        )
                    }
                }
            ]
        }

    analyzer._post_json = fake_post_json
    result = asyncio.run(analyzer.analyze([], "backend-engineer"))

    assert result.score == 80
    assert result.model == "test-model"


def test_gemini_codebase_analyzer_requires_configuration() -> None:
    analyzer = GeminiCodebaseAnalyzer()
    with pytest.raises(GeminiConfigurationError):
        asyncio.run(analyzer.analyze([], "backend-engineer"))


def test_codebase_analyzer_falls_back_to_gemini_after_groq_error() -> None:
    primary = GroqCodebaseAnalyzer(api_key="test-key", model="test-model")
    fallback = GeminiCodebaseAnalyzer(api_key="test-key", model="test-model")

    async def failed_primary(repositories: list[RepositorySnapshot], role_slug: str) -> None:
        raise GroqApiError("rate limited")

    async def successful_fallback(
        repositories: list[RepositorySnapshot], role_slug: str
    ) -> CodebaseAnalysisResult:
        return CodebaseAnalysisResult(
            score=70,
            summary="Fallback analysis complete.",
            strengths=[],
            concerns=[],
            evidence=[],
            model="gemini-test-model",
        )

    primary.analyze = failed_primary
    fallback.analyze = successful_fallback
    analyzer = FallbackCodebaseAnalyzer(primary, fallback)
    result = asyncio.run(analyzer.analyze([], "backend-engineer"))

    assert result.model == "gemini-test-model"


def test_worker_claims_pending_session_and_advances_phase(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)


def test_interview_websocket_persists_text_turns_and_completes(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)
    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )
    session_id = UUID(started.json()["data"]["id"])

    async def _prepare() -> None:
        async with db_session() as db:
            await db.execute(
                update(VerificationSession)
                .where(VerificationSession.id == session_id)
                .values(
                    status=VerificationStatus.IN_PROGRESS,
                    current_phase=VerificationPhase.TECHNICAL_DEFENCE,
                )
            )
            await db.commit()

    asyncio.run(_prepare())
    with client.websocket_connect(
        f"/v1/me/verifications/{session_id}/interview?token={data['access_token']}"
    ) as websocket:
        question = websocket.receive_json()
        assert question["type"] == "question"
        websocket.send_json({"type": "answer", "text": "I used a layered service design."})
        assert websocket.receive_json()["type"] == "answer_saved"
        assert websocket.receive_json()["type"] == "question"
        websocket.send_json({"type": "complete"})
        assert websocket.receive_json() == {
            "type": "interview_complete",
            "status": "processing",
        }

    detail = client.get(f"/v1/me/verifications/{session_id}", headers=bearer(data))
    assert detail.json()["data"]["current_phase"] == "report_generation"
    cleanup_user(user_id)
    claim_role(data)
    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )
    assert started.status_code == 201, started.text
    session_id = UUID(started.json()["data"]["id"])

    class FakeRepositoryClient:
        async def snapshot(self, repository_url: str) -> RepositorySnapshot:
            return RepositorySnapshot(
                repository_url=repository_url,
                default_branch="main",
                languages={"Python": 1000},
                file_paths=["app/main.py"],
                test_paths=[],
                recent_commits=[],
            )

    class FakeAnalyzer:
        async def analyze(
            self, repositories: list[RepositorySnapshot], role_slug: str
        ) -> CodebaseAnalysisResult:
            assert role_slug == "backend-engineer"
            assert len(repositories) == 1
            return CodebaseAnalysisResult(
                score=75,
                summary="Analysis complete.",
                strengths=[],
                concerns=[],
                evidence=[],
                model="test-worker-analyzer",
            )

    async def _process() -> CodebaseAnalysisResult:
        async with db_session() as db:
            result = await process_codebase_analysis(
                db, session_id, FakeRepositoryClient(), FakeAnalyzer()
            )
            assert result is not None
            return result

    analysis = asyncio.run(_process())
    assert analysis.score == 75
    detail = client.get(f"/v1/me/verifications/{session_id}", headers=bearer(data))
    assert detail.json()["data"]["status"] == "in_progress"
    assert detail.json()["data"]["current_phase"] == "technical_defence"
    cleanup_user(user_id)


def bearer(data: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {data['access_token']}"}


def cleanup_user(user_id: UUID) -> None:
    async def _clean() -> None:
        async with db_session() as session:
            await session.execute(
                delete(VerificationSession).where(VerificationSession.user_id == user_id)
            )
            await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
            await session.commit()

    asyncio.run(_clean())


def mark_role_verified(user_id: UUID, role_slug: str) -> None:
    async def _mark() -> None:
        async with db_session() as session:
            role_result = await session.execute(select(Role).where(Role.slug == role_slug))
            role = role_result.scalar_one()
            await session.execute(
                update(UserRole)
                .where(
                    UserRole.user_id == user_id,
                    UserRole.role_id == role.id,
                )
                .values(verified_at=datetime(2026, 11, 10, tzinfo=UTC))
            )
            await session.commit()

    asyncio.run(_mark())


def claim_role(data: dict, role: str = "backend-engineer") -> None:
    response = client.post(
        "/v1/me/roles",
        headers=bearer(data),
        json={"role": role, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def test_applicant_can_start_list_and_abandon_verification(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )

    assert started.status_code == 201, started.text
    session = started.json()["data"]
    assert session["role"] == "backend-engineer"
    assert session["attempt_number"] == 1
    assert session["status"] == "pending"
    assert session["current_phase"] == "codebase_analysis"
    assert session["evidence"] == [{"repository_url": "https://github.com/example/project"}]

    class FakeAnalyzer:
        async def analyze(
            self, repositories: list[RepositorySnapshot], role_slug: str
        ) -> CodebaseAnalysisResult:
            assert repositories[0].repository_url == "https://github.com/example/project"
            assert role_slug == "backend-engineer"
            return CodebaseAnalysisResult(
                score=82,
                summary="The repository has a clear backend structure and automated tests.",
                strengths=["Clear service boundaries"],
                concerns=["Coverage is not reported"],
                evidence=[{"kind": "test_suite", "value": "pytest"}],
                model="test-codebase-analyzer",
            )

    class FakeRepositoryClient:
        async def snapshot(self, repository_url: str) -> RepositorySnapshot:
            return RepositorySnapshot(
                repository_url=repository_url,
                default_branch="main",
                languages={"Python": 1000},
                file_paths=["app/main.py", "tests/test_main.py"],
                test_paths=["tests/test_main.py"],
                recent_commits=[],
            )

    async def _run_analysis() -> None:
        async with db_session() as db:
            result = await db.execute(
                select(VerificationSession).where(VerificationSession.id == UUID(session["id"]))
            )
            verification = result.scalar_one()
            analysis = await run_codebase_analysis(
                db,
                verification,
                "backend-engineer",
                FakeRepositoryClient(),
                FakeAnalyzer(),
            )
            assert analysis.score == 82
            assert verification.status == VerificationStatus.IN_PROGRESS
            assert verification.current_phase == VerificationPhase.TECHNICAL_DEFENCE

    asyncio.run(_run_analysis())

    listed = client.get("/v1/me/verifications", headers=bearer(data))
    assert listed.status_code == 200
    assert listed.json()["data"][0]["id"] == session["id"]

    detail = client.get(f"/v1/me/verifications/{session['id']}", headers=bearer(data))
    assert detail.status_code == 200

    abandoned = client.post(
        f"/v1/me/verifications/{session['id']}/abandon",
        headers=bearer(data),
    )
    assert abandoned.status_code == 200
    assert abandoned.json()["data"]["status"] == "abandoned"
    cleanup_user(user_id)


def test_start_verification_requires_claimed_role(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    response = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ROLE_NOT_CLAIMED"
    cleanup_user(user_id)


def test_verified_peer_can_review_and_pass_attempt(sign_in) -> None:
    applicant = sign_in("github-code-ada")
    reviewer = sign_in("github-code-moussa")
    applicant_id = UUID(applicant["user"]["id"])
    reviewer_id = UUID(reviewer["user"]["id"])
    cleanup_user(applicant_id)
    cleanup_user(reviewer_id)
    claim_role(applicant)
    claim_role(reviewer)
    mark_role_verified(reviewer_id, "backend-engineer")

    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(applicant),
        json={"repositories": ["https://github.com/example/project"]},
    )
    session_id = started.json()["data"]["id"]

    async def _queue() -> None:
        async with db_session() as session:
            await session.execute(
                update(VerificationSession)
                .where(VerificationSession.id == UUID(session_id))
                .values(status=VerificationStatus.AWAITING_REVIEW)
            )
            await session.commit()

    asyncio.run(_queue())

    queue = client.get("/v1/reviews/verifications", headers=bearer(reviewer))
    assert queue.status_code == 200
    assert queue.json()["data"][0]["id"] == session_id

    decision = client.post(
        f"/v1/reviews/verifications/{session_id}/decision",
        headers=bearer(reviewer),
        json={"decision": "passed", "notes": "Evidence reviewed."},
    )
    assert decision.status_code == 200
    assert decision.json()["data"]["status"] == "passed"

    cleanup_user(applicant_id)
    cleanup_user(reviewer_id)


def test_unverified_user_cannot_review(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    response = client.get("/v1/reviews/verifications", headers=bearer(data))

    assert response.status_code == 200
    assert response.json()["data"] == []
    cleanup_user(user_id)
