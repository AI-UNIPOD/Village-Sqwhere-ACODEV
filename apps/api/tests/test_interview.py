import asyncio
import json
from io import BytesIO

import pytest

from app.api.v1.interviews import complete_interview, mark_interview_incomplete
from app.models.users import (
    InterviewStatus,
    VerificationInterview,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.services import groq_interview
from app.services.groq_interview import GroqInterviewAgent
from app.services.interview import (
    INTERVIEW_COMPETENCIES,
    DefaultInterviewAgent,
    FallbackInterviewAgent,
    InterviewHistoryItem,
    InterviewUnavailable,
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


@pytest.mark.parametrize("raw", ["not json", "[]", "{}", '{"type": 4}'])
def test_parse_interview_message_rejects_invalid_messages(raw: str) -> None:
    with pytest.raises(InterviewUnavailable):
        parse_interview_message(raw)


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
