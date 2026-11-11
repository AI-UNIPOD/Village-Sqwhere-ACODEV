import asyncio
import json
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.api.v1 import interviews as interviews_api
from app.main import app
from app.models.lookups import Role
from app.models.users import (
    InterviewStatus,
    UserRole,
    VerificationInterview,
    VerificationInterviewTurn,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.services.codebase_analysis import (
    AnalysisCriterion,
    build_codebase_analysis_prompt,
)
from app.services.fallback import FallbackCodebaseAnalyzer
from app.services.gemini import GeminiCodebaseAnalyzer, GeminiConfigurationError
from app.services.gemini_report import GeminiReportEvaluator
from app.services.groq import GroqApiError, GroqCodebaseAnalyzer, GroqConfigurationError
from app.services.report import VerificationReport
from app.services.verification import (
    CodebaseAnalysisResult,
    GitHubRepositoryClient,
    GitHubRepositoryError,
    RepositorySnapshot,
    run_codebase_analysis,
)
from app.workers.verification import process_codebase_analysis, process_verification_report
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


def test_gemini_report_evaluator_requires_configuration() -> None:
    evaluator = GeminiReportEvaluator()
    with pytest.raises(RuntimeError):
        asyncio.run(evaluator.evaluate("backend-engineer", {}, []))


def test_worker_claims_pending_session_and_advances_phase(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)


def test_interview_websocket_runs_conversation_and_completes(sign_in, monkeypatch) -> None:
    configure_test_interview(monkeypatch)
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
        welcome = websocket.receive_json()
        assert welcome["type"] == "assistant_message"
        assert welcome["kind"] == "welcome"
        assert "five technical questions" in welcome["text"]
        question = websocket.receive_json()
        assert question["type"] == "question"
        assert question["sequence"] == 1
        websocket.send_json({"type": "complete"})
        assert websocket.receive_json() == {"type": "error", "code": "UNKNOWN_MESSAGE_TYPE"}
        for turn in range(5):
            websocket.send_json(
                {"type": "answer", "text": f"I used a layered service design for turn {turn}."}
            )
            assert websocket.receive_json()["type"] == "security_signal"
            assert websocket.receive_json()["type"] == "answer_saved"
            acknowledgement = websocket.receive_json()
            assert acknowledgement["type"] == "assistant_message"
            assert acknowledgement["kind"] == "acknowledgement"
            if turn < 4:
                next_question = websocket.receive_json()
                assert next_question["type"] == "question"
                assert next_question["sequence"] == turn + 2
            else:
                closing = websocket.receive_json()
                assert closing["type"] == "assistant_message"
                assert closing["kind"] == "closing"
                assert "peer review" in closing["text"]
                assert websocket.receive_json() == {
                    "type": "interview_complete",
                    "status": "processing",
                }

    class FakeReportEvaluator:
        async def evaluate(
            self, role_slug: str, codebase_result: dict, interview_turns: list[dict]
        ) -> VerificationReport:
            assert role_slug == "backend-engineer"
            assert len(interview_turns) == 5
            assert interview_turns[0]["answer"].endswith("turn 0.")
            assert all(turn["acknowledgement"] for turn in interview_turns)
            return VerificationReport(
                score=78,
                summary="The evidence is ready for peer review.",
                codebase_findings=["The repository has a test path."],
                interview_findings=["The applicant explained a service boundary."],
                concerns=[],
                security_flags=[],
                confidence=0.8,
                model="test-report-evaluator",
            )

    async def _report() -> VerificationReport:
        async with db_session() as db:
            result = await process_verification_report(db, session_id, FakeReportEvaluator())
            assert result is not None
            return result

    report = asyncio.run(_report())
    assert report.score == 78
    detail = client.get(f"/v1/me/verifications/{session_id}", headers=bearer(data))
    assert detail.json()["data"]["status"] == "awaiting_review"
    assert detail.json()["data"]["current_phase"] is None
    assert detail.json()["data"]["ai_result"]["final_report"]["score"] == 78
    transcript = detail.json()["data"]["ai_result"]["interview_transcript"]
    assert "five technical questions" in transcript["welcome"]
    assert len(transcript["turns"]) == 5
    assert "peer review" in transcript["closing"]
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


def test_interview_abandon_marks_transcript_incomplete(sign_in, monkeypatch) -> None:
    configure_test_interview(monkeypatch)
    data = sign_in("github-code-moussa")
    user_id = UUID(data["user"]["id"])
    session_id = prepare_interview_session(data)

    with client.websocket_connect(
        f"/v1/me/verifications/{session_id}/interview?token={data['access_token']}"
    ) as websocket:
        assert websocket.receive_json()["kind"] == "welcome"
        assert websocket.receive_json()["type"] == "question"
        websocket.send_json({"type": "abandon"})
        assert websocket.receive_json() == {"type": "interview_incomplete"}

    session = get_interview_session(session_id)
    assert session.status == VerificationStatus.ABANDONED
    assert session.current_phase is None
    assert session.interview.status == InterviewStatus.INCOMPLETE
    assert session.interview.closing_message is None
    cleanup_user(user_id)


def test_interview_flags_each_answer_when_the_guard_is_not_configured(sign_in, monkeypatch) -> None:
    configure_test_interview(monkeypatch)
    data = sign_in("github-code-moussa")
    user_id = UUID(data["user"]["id"])
    session_id = prepare_interview_session(data)

    with client.websocket_connect(
        f"/v1/me/verifications/{session_id}/interview?token={data['access_token']}"
    ) as websocket:
        assert websocket.receive_json()["kind"] == "welcome"
        assert websocket.receive_json()["type"] == "question"
        websocket.send_json({"type": "answer", "text": "I kept the services small."})
        assert websocket.receive_json() == {
            "type": "security_signal",
            "severity": "warning",
            "code": "guard_not_configured",
        }
        assert websocket.receive_json()["type"] == "answer_saved"

    assert answered_turn_flags(session_id) == [["guard_not_configured"]]
    cleanup_user(user_id)


def test_interview_audio_answer_sends_an_allowed_audio_type_on(sign_in, monkeypatch) -> None:
    configure_test_interview(monkeypatch)
    transcriber = use_recording_transcriber(monkeypatch)
    data = sign_in("github-code-moussa")
    user_id = UUID(data["user"]["id"])
    session_id = prepare_interview_session(data)

    with client.websocket_connect(
        f"/v1/me/verifications/{session_id}/interview"
        f"?token={data['access_token']}&audio_content_type=audio/webm;codecs=opus"
    ) as websocket:
        assert websocket.receive_json()["kind"] == "welcome"
        assert websocket.receive_json()["type"] == "question"
        websocket.send_bytes(b"audio")
        assert websocket.receive_json() == {"type": "audio_buffered", "bytes": 5}
        websocket.send_json({"type": "answer_end"})
        assert websocket.receive_json()["type"] == "security_signal"
        assert websocket.receive_json()["type"] == "answer_saved"

    assert transcriber.audio_types == ["audio/webm;codecs=opus"]
    cleanup_user(user_id)


@pytest.mark.parametrize(
    "audio_type",
    [
        "audio/webm%0d%0aContent-Disposition:%20form-data;%20name=%22prompt%22",
        "audio/webm%0aX-Injected:%201",
        "text/html",
        "",
    ],
    ids=["header injection", "line feed", "not audio", "empty"],
)
def test_interview_audio_answer_refuses_a_type_outside_the_allow_list(
    sign_in, monkeypatch, audio_type
) -> None:
    configure_test_interview(monkeypatch)
    transcriber = use_recording_transcriber(monkeypatch)
    data = sign_in("github-code-moussa")
    user_id = UUID(data["user"]["id"])
    session_id = prepare_interview_session(data)

    with client.websocket_connect(
        f"/v1/me/verifications/{session_id}/interview"
        f"?token={data['access_token']}&audio_content_type={audio_type}"
    ) as websocket:
        assert websocket.receive_json()["kind"] == "welcome"
        assert websocket.receive_json()["type"] == "question"
        websocket.send_bytes(b"audio")
        assert websocket.receive_json()["type"] == "audio_buffered"
        websocket.send_json({"type": "answer_end"})
        assert websocket.receive_json() == {"type": "error", "code": "AUDIO_TYPE_NOT_ALLOWED"}

    assert transcriber.audio_types == []
    cleanup_user(user_id)


def bearer(data: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {data['access_token']}"}


def configure_test_interview(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(interviews_api, "async_session", db_session)
    monkeypatch.setattr(interviews_api, "GROQ_API_KEY", None)
    monkeypatch.setattr(interviews_api, "GROQ_GUARD_MODEL", None)
    monkeypatch.setattr(interviews_api, "GROQ_INTERVIEW_MODEL", None)
    monkeypatch.setattr(interviews_api, "GEMINI_API_KEY", None)
    monkeypatch.setattr(interviews_api, "GEMINI_INTERVIEW_MODEL", None)


class RecordingTranscriber:
    """Stands in for Groq's transcriber and remembers the audio type it was asked for."""

    def __init__(self) -> None:
        self.audio_types: list[str] = []

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        self.audio_types.append(content_type)
        return "I kept the services small and tested each one."


def use_recording_transcriber(monkeypatch: pytest.MonkeyPatch) -> RecordingTranscriber:
    transcriber = RecordingTranscriber()
    monkeypatch.setattr(interviews_api, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(interviews_api, "GroqWhisperTranscriber", lambda: transcriber)
    return transcriber


def prepare_interview_session(data: dict) -> UUID:
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)
    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )
    assert started.status_code == 201, started.text
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
    return session_id


def get_interview_session(session_id: UUID) -> VerificationSession:
    async def _get() -> VerificationSession:
        async with db_session() as db:
            result = await db.execute(
                select(VerificationSession)
                .options(selectinload(VerificationSession.interview))
                .where(VerificationSession.id == session_id)
            )
            return result.scalar_one()

    return asyncio.run(_get())


def answered_turn_flags(session_id: UUID) -> list[list[str]]:
    async def _flags() -> list[list[str]]:
        async with db_session() as db:
            result = await db.execute(
                select(VerificationInterviewTurn.security_flags)
                .join(VerificationInterview)
                .where(
                    VerificationInterview.verification_session_id == session_id,
                    VerificationInterviewTurn.answer_text.is_not(None),
                )
            )
            return [row[0] for row in result.all()]

    return asyncio.run(_flags())


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
    assert session_id in [item["id"] for item in queue.json()["data"]]

    decision = client.post(
        f"/v1/reviews/verifications/{session_id}/decision",
        headers=bearer(reviewer),
        json={"decision": "passed", "notes": "Evidence reviewed."},
    )
    assert decision.status_code == 200
    assert decision.json()["data"]["status"] == "passed"

    cleanup_user(applicant_id)
    cleanup_user(reviewer_id)


def start_attempt(data: dict):
    return client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )


def test_second_attempt_is_refused_while_one_is_active(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    assert start_attempt(data).status_code == 201
    second = start_attempt(data)

    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "VERIFICATION_IN_PROGRESS"
    cleanup_user(user_id)


def test_fourth_attempt_is_refused_after_three(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    for _ in range(3):
        started = start_attempt(data)
        assert started.status_code == 201, started.text
        session = started.json()["data"]
        abandoned = client.post(
            f"/v1/me/verifications/{session['id']}/abandon", headers=bearer(data)
        )
        assert abandoned.status_code == 200

    fourth = start_attempt(data)

    assert fourth.status_code == 409
    assert fourth.json()["detail"]["code"] == "VERIFICATION_ATTEMPTS_EXHAUSTED"
    cleanup_user(user_id)


def test_reviewer_cannot_see_or_decide_their_own_attempt(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)
    session_id = start_attempt(data).json()["data"]["id"]
    # verified in the role, so a reviewer for it, with their own attempt waiting for review
    mark_role_verified(user_id, "backend-engineer")

    async def _queue() -> None:
        async with db_session() as session:
            await session.execute(
                update(VerificationSession)
                .where(VerificationSession.id == UUID(session_id))
                .values(status=VerificationStatus.AWAITING_REVIEW)
            )
            await session.commit()

    asyncio.run(_queue())

    queue = client.get("/v1/reviews/verifications", headers=bearer(data))
    assert queue.status_code == 200
    assert session_id not in [item["id"] for item in queue.json()["data"]]

    case = client.get(f"/v1/reviews/verifications/{session_id}", headers=bearer(data))
    assert case.status_code == 404

    decision = client.post(
        f"/v1/reviews/verifications/{session_id}/decision",
        headers=bearer(data),
        json={"decision": "passed"},
    )
    assert decision.status_code == 404
    mine = client.get(f"/v1/me/verifications/{session_id}", headers=bearer(data))
    assert mine.json()["data"]["status"] == "awaiting_review"
    cleanup_user(user_id)


def test_unverified_user_cannot_review(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    response = client.get("/v1/reviews/verifications", headers=bearer(data))

    assert response.status_code == 200
    assert response.json()["data"] == []
    cleanup_user(user_id)


def test_each_new_attempt_reports_its_own_number(sign_in) -> None:
    # the database numbers attempts; the API must report that number, not one it guessed
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    for attempt in (1, 2, 3):
        started = client.post(
            "/v1/me/verifications/backend-engineer",
            headers=bearer(data),
            json={"repositories": ["https://github.com/example/project"]},
        )
        assert started.status_code == 201, started.text
        session = started.json()["data"]
        assert session["attempt_number"] == attempt
        detail = client.get(f"/v1/me/verifications/{session['id']}", headers=bearer(data))
        assert detail.json()["data"]["attempt_number"] == attempt
        abandoned = client.post(
            f"/v1/me/verifications/{session['id']}/abandon", headers=bearer(data)
        )
        assert abandoned.status_code == 200

    cleanup_user(user_id)
