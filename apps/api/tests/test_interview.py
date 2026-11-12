import asyncio
import json
from io import BytesIO

import pytest

from app.api.v1 import interviews as interviews_api
from app.api.v1.interviews import complete_interview, mark_interview_incomplete
from app.models.users import (
    InterviewStatus,
    VerificationInterview,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.services import gemini_interview, groq_interview
from app.services.gemini_interview import GeminiAudioTranscriber, GeminiInterviewAgent
from app.services.groq_interview import GroqInterviewAgent
from app.services.interview import (
    INTERVIEW_COMPETENCIES,
    DefaultInterviewAgent,
    FallbackAudioTranscriber,
    FallbackInterviewAgent,
    InterviewHistoryItem,
    InterviewUnavailable,
    UnconfiguredAnswerGuard,
    parse_interview_message,
)


def test_default_agent_covers_five_competencies_with_conversation() -> None:
    agent = DefaultInterviewAgent()
    opening = asyncio.run(agent.opening("backend-engineer", {}))

    assert "five technical questions" in opening.welcome
    assert "backend engineer" in opening.question

    questions = [opening.question]
    history = [
        InterviewHistoryItem(sequence=1, question=opening.question, answer="I owned the API.")
    ]
    for turn in range(2, 6):
        continuation = asyncio.run(agent.continuation("backend-engineer", turn, {}, history))
        assert continuation.acknowledgement == "Thank you. I have recorded that response."
        questions.append(continuation.question)
        history.append(
            InterviewHistoryItem(
                sequence=turn,
                question=continuation.question,
                answer=f"Answer {turn}",
            )
        )

    closing = asyncio.run(agent.closing("backend-engineer", {}, history))

    assert len(INTERVIEW_COMPETENCIES) == 5
    assert len(set(questions)) == 5
    assert "final response" in closing.acknowledgement
    assert "peer review" in closing.closing


def test_fallback_agent_recovers_each_conversation_phase() -> None:
    class UnavailableAgent:
        async def opening(self, role_slug: str, analysis: dict | None):
            raise InterviewUnavailable("opening failed")

        async def continuation(self, role_slug, next_turn, analysis, history):
            raise InterviewUnavailable("continuation failed")

        async def closing(self, role_slug, analysis, history):
            raise InterviewUnavailable("closing failed")

    agent = FallbackInterviewAgent(UnavailableAgent(), DefaultInterviewAgent())
    history = [
        InterviewHistoryItem(sequence=1, question="Question", answer="Answer"),
    ]

    opening = asyncio.run(agent.opening("backend-engineer", {}))
    continuation = asyncio.run(agent.continuation("backend-engineer", 2, {}, history))
    closing = asyncio.run(agent.closing("backend-engineer", {}, history))

    assert opening.welcome.startswith("Welcome")
    assert continuation.question
    assert closing.closing


def test_groq_agent_requests_structured_adaptive_conversation() -> None:
    agent = GroqInterviewAgent(api_key="test-key", model="test-model")
    requests: list[tuple[str, dict]] = []

    async def fake_chat(model: str, system: str, user: str) -> str:
        payload = json.loads(user)
        requests.append((system, payload))
        if payload["phase"] == "opening":
            return json.dumps({"welcome": "Welcome.", "question": "First question?"})
        if payload["phase"] == "continuation":
            return json.dumps({"acknowledgement": "Thank you.", "question": "Adaptive question?"})
        return json.dumps({"acknowledgement": "Thank you.", "closing": "Goodbye."})

    agent._chat = fake_chat
    history = [
        InterviewHistoryItem(
            sequence=1,
            question="How did you design it?",
            answer="I used a queue.",
        )
    ]

    opening = asyncio.run(agent.opening("backend-engineer", {"score": 70}))
    continuation = asyncio.run(agent.continuation("backend-engineer", 4, {}, history))
    closing = asyncio.run(agent.closing("backend-engineer", {}, history))

    assert opening.question == "First question?"
    assert continuation.question == "Adaptive question?"
    assert closing.closing == "Goodbye."
    assert requests[1][1]["competency"] == "adaptive technical depth"
    assert requests[1][1]["history"][0]["answer"] == "I used a queue."
    assert all("untrusted data" in system for system, _ in requests)
    assert all("neutral" in system for system, _ in requests)


def test_groq_agent_rejects_invalid_structured_response() -> None:
    agent = GroqInterviewAgent(api_key="test-key", model="test-model")

    async def fake_chat(model: str, system: str, user: str) -> str:
        return "{}"

    agent._chat = fake_chat

    with pytest.raises(InterviewUnavailable, match="opening is invalid"):
        asyncio.run(agent.opening("backend-engineer", {}))


def test_groq_agent_requests_json_object_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = GroqInterviewAgent(api_key="test-key", model="test-model")
    request_payload: dict = {}

    def fake_urlopen(request, timeout):
        request_payload.update(json.loads(request.data))
        return BytesIO(b'{"choices":[{"message":{"content":"{}"}}]}')

    monkeypatch.setattr(groq_interview, "urlopen", fake_urlopen)

    response = agent._chat_sync("test-model", "system", "user")

    assert response["choices"]
    assert request_payload["response_format"] == {"type": "json_object"}
    assert request_payload["max_completion_tokens"] == 2048


def test_groq_agent_rejects_context_before_calling_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(groq_interview, "GROQ_INTERVIEW_CONTEXT_BUDGET_TOKENS", 10)
    agent = GroqInterviewAgent(api_key="test-key", model="test-model")

    async def provider_must_not_run(model: str, system: str, user: str) -> str:
        raise AssertionError("Groq should not be called over the context budget")

    agent._chat = provider_must_not_run

    with pytest.raises(InterviewUnavailable, match="context budget exceeded"):
        asyncio.run(agent.opening("backend-engineer", {"summary": "evidence"}))


def test_gemini_agent_requires_configuration() -> None:
    agent = GeminiInterviewAgent(api_key=None, model=None)

    with pytest.raises(InterviewUnavailable, match="not configured"):
        asyncio.run(agent.opening("backend-engineer", {}))


def test_gemini_audio_transcriber_sends_inline_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    transcriber = GeminiAudioTranscriber(api_key="test-key", model="test-model")
    captured: dict = {}

    def fake_urlopen(request, timeout):
        captured["payload"] = json.loads(request.data)
        return BytesIO(b'{"candidates":[{"content":{"parts":[{"text":"spoken answer"}]}}]}')

    monkeypatch.setattr(gemini_interview, "urlopen", fake_urlopen)

    transcript = asyncio.run(transcriber.transcribe(b"audio", "audio/webm"))

    assert transcript == "spoken answer"
    part = captured["payload"]["contents"][0]["parts"][1]["inlineData"]
    assert part["mimeType"] == "audio/webm"
    assert part["data"] == "YXVkaW8="


def test_audio_transcriber_falls_back_to_gemini() -> None:
    class Unavailable:
        async def transcribe(self, audio: bytes, content_type: str) -> str:
            raise InterviewUnavailable("Groq unavailable")

    class Available:
        async def transcribe(self, audio: bytes, content_type: str) -> str:
            return "Gemini transcript"

    transcript = asyncio.run(
        FallbackAudioTranscriber(Unavailable(), Available()).transcribe(b"audio", "audio/webm")
    )

    assert transcript == "Gemini transcript"


def test_gemini_agent_generates_structured_adaptive_conversation() -> None:
    agent = GeminiInterviewAgent(api_key="test-key", model="test-model")
    requests: list[dict] = []

    async def fake_generate(payload: dict) -> str:
        requests.append(payload)
        if payload["phase"] == "opening":
            return json.dumps({"welcome": "Welcome.", "question": "First question?"})
        if payload["phase"] == "continuation":
            return json.dumps({"acknowledgement": "Thanks.", "question": "Follow-up?"})
        return json.dumps({"acknowledgement": "Thanks.", "closing": "Goodbye."})

    agent._generate = fake_generate
    history = [
        InterviewHistoryItem(sequence=1, question="Question", answer="I used a queue."),
    ]

    opening = asyncio.run(agent.opening("backend-engineer", {"score": 70}))
    continuation = asyncio.run(agent.continuation("backend-engineer", 5, {}, history))
    closing = asyncio.run(agent.closing("backend-engineer", {}, history))

    assert opening.welcome == "Welcome."
    assert continuation.question == "Follow-up?"
    assert closing.closing == "Goodbye."
    assert requests[1]["competency"] == "trade-offs and problem solving"
    assert requests[1]["history"][0]["answer"] == "I used a queue."


def test_gemini_agent_rejects_invalid_structured_response() -> None:
    agent = GeminiInterviewAgent(api_key="test-key", model="test-model")

    async def fake_generate(payload: dict) -> str:
        return "{}"

    agent._generate = fake_generate

    with pytest.raises(InterviewUnavailable, match="continuation is invalid"):
        asyncio.run(agent.continuation("backend-engineer", 2, {}, []))


def test_gemini_agent_requests_json_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = GeminiInterviewAgent(api_key="test-key", model="gemini/test model")
    captured: dict = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["payload"] = json.loads(request.data)
        return BytesIO(b'{"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}')

    monkeypatch.setattr(gemini_interview, "urlopen", fake_urlopen)

    response = agent._generate_sync({"phase": "opening"})

    assert response["candidates"]
    assert "gemini%2Ftest%20model" in captured["url"]
    assert captured["payload"]["generationConfig"]["responseMimeType"] == "application/json"
    prompt = captured["payload"]["contents"][0]["parts"][0]["text"]
    assert "untrusted data" in prompt


def test_interview_agent_falls_back_from_groq_to_gemini(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    class UnavailableGroq:
        async def opening(self, role_slug, analysis):
            calls.append("groq")
            raise InterviewUnavailable("Groq unavailable")

    class AvailableGemini(DefaultInterviewAgent):
        async def opening(self, role_slug, analysis):
            calls.append("gemini")
            return await super().opening(role_slug, analysis)

    monkeypatch.setattr(interviews_api, "GROQ_API_KEY", "groq-key")
    monkeypatch.setattr(interviews_api, "GROQ_INTERVIEW_MODEL", "groq-model")
    monkeypatch.setattr(interviews_api, "GEMINI_API_KEY", "gemini-key")
    monkeypatch.setattr(interviews_api, "GEMINI_INTERVIEW_MODEL", "gemini-model")
    monkeypatch.setattr(interviews_api, "GroqInterviewAgent", UnavailableGroq)
    monkeypatch.setattr(interviews_api, "GeminiInterviewAgent", AvailableGemini)

    opening = asyncio.run(interviews_api.interview_agent().opening("backend-engineer", {}))

    assert opening.welcome.startswith("Welcome")
    assert calls == ["groq", "gemini"]


def test_interview_agent_uses_gemini_when_groq_is_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    class AvailableGemini(DefaultInterviewAgent):
        async def opening(self, role_slug, analysis):
            calls.append("gemini")
            return await super().opening(role_slug, analysis)

    monkeypatch.setattr(interviews_api, "GROQ_API_KEY", None)
    monkeypatch.setattr(interviews_api, "GROQ_INTERVIEW_MODEL", None)
    monkeypatch.setattr(interviews_api, "GEMINI_API_KEY", "gemini-key")
    monkeypatch.setattr(interviews_api, "GEMINI_INTERVIEW_MODEL", "gemini-model")
    monkeypatch.setattr(interviews_api, "GeminiInterviewAgent", AvailableGemini)

    opening = asyncio.run(interviews_api.interview_agent().opening("backend-engineer", {}))

    assert opening.question
    assert calls == ["gemini"]


def test_interview_agent_uses_local_fallback_when_both_providers_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    class UnavailableAgent:
        def __init__(self, provider: str) -> None:
            self.provider = provider

        async def opening(self, role_slug, analysis):
            calls.append(self.provider)
            raise InterviewUnavailable(f"{self.provider} unavailable")

    monkeypatch.setattr(interviews_api, "GROQ_API_KEY", "groq-key")
    monkeypatch.setattr(interviews_api, "GROQ_INTERVIEW_MODEL", "groq-model")
    monkeypatch.setattr(interviews_api, "GEMINI_API_KEY", "gemini-key")
    monkeypatch.setattr(interviews_api, "GEMINI_INTERVIEW_MODEL", "gemini-model")
    monkeypatch.setattr(
        interviews_api,
        "GroqInterviewAgent",
        lambda: UnavailableAgent("groq"),
    )
    monkeypatch.setattr(
        interviews_api,
        "GeminiInterviewAgent",
        lambda: UnavailableAgent("gemini"),
    )

    opening = asyncio.run(interviews_api.interview_agent().opening("backend-engineer", {}))

    assert opening.welcome.startswith("Welcome")
    assert calls == ["groq", "gemini"]


@pytest.mark.parametrize("raw", ["not json", "[]", "{}", '{"type": 4}'])
def test_parse_interview_message_rejects_invalid_messages(raw: str) -> None:
    with pytest.raises(InterviewUnavailable):
        parse_interview_message(raw)


def test_unconfigured_answer_guard_flags_that_nothing_was_checked() -> None:
    flags = asyncio.run(UnconfiguredAnswerGuard().inspect("I used a layered service design."))

    assert flags == ["guard_not_configured"]


def test_parse_interview_message_accepts_known_shape() -> None:
    assert parse_interview_message('{"type":"answer","text":"hello"}') == {
        "type": "answer",
        "text": "hello",
    }


def test_interview_terminal_state_transitions() -> None:
    incomplete_interview = VerificationInterview()
    incomplete_session = VerificationSession(
        status=VerificationStatus.IN_PROGRESS,
        current_phase=VerificationPhase.TECHNICAL_DEFENCE,
    )

    mark_interview_incomplete(incomplete_interview, incomplete_session)

    assert incomplete_interview.status == InterviewStatus.INCOMPLETE
    assert incomplete_interview.completed_at is not None
    assert incomplete_session.status == VerificationStatus.ABANDONED
    assert incomplete_session.current_phase is None

    completed_interview = VerificationInterview()
    completed_session = VerificationSession(
        status=VerificationStatus.IN_PROGRESS,
        current_phase=VerificationPhase.TECHNICAL_DEFENCE,
    )

    complete_interview(completed_interview, completed_session)

    assert completed_interview.status == InterviewStatus.COMPLETED
    assert completed_interview.completed_at is not None
    assert completed_session.status == VerificationStatus.IN_PROGRESS
    assert completed_session.current_phase == VerificationPhase.REPORT_GENERATION
