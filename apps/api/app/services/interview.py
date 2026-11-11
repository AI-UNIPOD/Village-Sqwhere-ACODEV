import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Protocol

from pydantic import BaseModel, Field


class InterviewQuestion(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class InterviewQuestionProvider(Protocol):
    async def question(
        self, role_slug: str, turn_number: int, analysis: dict | None
    ) -> InterviewQuestion: ...


class AudioTranscriber(Protocol):
    async def transcribe(self, audio: bytes, content_type: str) -> str: ...


class InterviewUnavailable(Exception):
    pass


class DefaultInterviewQuestionProvider:
    _questions: Sequence[str] = (
        "Describe the main architecture of a backend system you built and one trade-off you made.",
        "How did you test the most important behavior in that system, and what would you improve?",
        "Describe a production failure or difficult debugging problem and how you found the cause.",
    )

    async def question(
        self, role_slug: str, turn_number: int, analysis: dict | None
    ) -> InterviewQuestion:
        index = min(max(turn_number - 1, 0), len(self._questions) - 1)
        return InterviewQuestion(text=f"For the {role_slug} role: {self._questions[index]}")


class UnconfiguredAudioTranscriber:
    async def transcribe(self, audio: bytes, content_type: str) -> str:
        raise InterviewUnavailable("Audio transcription is not configured.")


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
