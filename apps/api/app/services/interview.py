import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Protocol

from pydantic import BaseModel, Field

INTERVIEW_COMPETENCIES = (
    "project architecture and ownership",
    "selected-role fundamentals",
    "testing and reliability",
    "adaptive technical depth",
    "trade-offs and problem solving",
)


class InterviewHistoryItem(BaseModel):
    sequence: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=10_000)


class InterviewOpening(BaseModel):
    welcome: str = Field(min_length=1, max_length=2000)
    question: str = Field(min_length=1, max_length=2000)


class InterviewContinuation(BaseModel):
    acknowledgement: str = Field(min_length=1, max_length=1000)
    question: str = Field(min_length=1, max_length=2000)


class InterviewClosing(BaseModel):
    acknowledgement: str = Field(min_length=1, max_length=1000)
    closing: str = Field(min_length=1, max_length=2000)


class InterviewAgent(Protocol):
    async def opening(self, role_slug: str, analysis: dict | None) -> InterviewOpening: ...

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewContinuation: ...

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewClosing: ...


class AudioTranscriber(Protocol):
    async def transcribe(self, audio: bytes, content_type: str) -> str: ...


class AnswerGuard(Protocol):
    async def inspect(self, answer: str) -> list[str]: ...


class InterviewUnavailable(Exception):
    pass


class FallbackAudioTranscriber:
    def __init__(self, primary: AudioTranscriber, fallback: AudioTranscriber) -> None:
        self.primary = primary
        self.fallback = fallback

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        try:
            return await self.primary.transcribe(audio, content_type)
        except InterviewUnavailable:
            return await self.fallback.transcribe(audio, content_type)


class DefaultInterviewAgent:
    _questions: Sequence[str] = (
        "Describe a project you built, its architecture, and the part you personally owned.",
        "Explain a core concept for this role that shaped one of your technical decisions.",
        "How did you test the most important behaviour, and how did you make it reliable?",
        "Describe a difficult technical problem you diagnosed and how you found its cause.",
        "Choose one important trade-off in your solution and explain what you would change now.",
    )

    async def opening(self, role_slug: str, analysis: dict | None) -> InterviewOpening:
        role_name = role_slug.replace("-", " ")
        return InterviewOpening(
            welcome=(
                f"Welcome to your {role_name} verification interview. I will ask five "
                "technical questions based on the role and your submitted work."
            ),
            question=self._question(role_slug, 1),
        )

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewContinuation:
        return InterviewContinuation(
            acknowledgement="Thank you. I have recorded that response.",
            question=self._question(role_slug, next_turn),
        )

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewClosing:
        return InterviewClosing(
            acknowledgement="Thank you. I have recorded your final response.",
            closing=(
                "That completes the technical interview. Your codebase and interview evidence "
                "will now be prepared for peer review."
            ),
        )

    def _question(self, role_slug: str, turn_number: int) -> str:
        index = min(max(turn_number - 1, 0), len(self._questions) - 1)
        role_name = role_slug.replace("-", " ")
        return f"For the {role_name} role: {self._questions[index]}"


class FallbackInterviewAgent:
    def __init__(self, primary: InterviewAgent, fallback: InterviewAgent) -> None:
        self.primary = primary
        self.fallback = fallback

    async def opening(self, role_slug: str, analysis: dict | None) -> InterviewOpening:
        try:
            return await self.primary.opening(role_slug, analysis)
        except InterviewUnavailable:
            return await self.fallback.opening(role_slug, analysis)

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewContinuation:
        try:
            return await self.primary.continuation(role_slug, next_turn, analysis, history)
        except InterviewUnavailable:
            return await self.fallback.continuation(role_slug, next_turn, analysis, history)

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
    ) -> InterviewClosing:
        try:
            return await self.primary.closing(role_slug, analysis, history)
        except InterviewUnavailable:
            return await self.fallback.closing(role_slug, analysis, history)


class UnconfiguredAudioTranscriber:
    async def transcribe(self, audio: bytes, content_type: str) -> str:
        raise InterviewUnavailable("Audio transcription is not configured.")


class UnconfiguredAnswerGuard:
    # An empty list would read as "checked and clean", so peer reviewers could trust an answer
    # nobody screened. The flag says the guard did not run.
    async def inspect(self, answer: str) -> list[str]:
        return ["guard_not_configured"]


def parse_interview_message(raw: str) -> dict:
    try:
        message = json.loads(raw)
    except json.JSONDecodeError as error:
        raise InterviewUnavailable("Interview messages must be valid JSON.") from error
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        raise InterviewUnavailable("Interview messages need a type.")
    return message


def interview_completed_at() -> datetime:
    return datetime.now(UTC)
