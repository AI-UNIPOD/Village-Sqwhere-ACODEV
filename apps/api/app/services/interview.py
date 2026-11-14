import json
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


# The only source of the language instruction. The key is the language stored on the attempt,
# never text from the applicant.
LANGUAGE_NAMES = {"en": "English", "fr": "French"}


def interview_system_prompt(base: str, language: str) -> str:
    return f"{base} Write every message to the candidate in {LANGUAGE_NAMES[language]}."


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
    async def opening(
        self, role_slug: str, analysis: dict | None, language: str
    ) -> InterviewOpening: ...

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
    ) -> InterviewContinuation: ...

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
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


# Used when no AI provider answers. "\u202f" is the narrow no-break space French puts before
# ":", ";", "?" and "!".
DEFAULT_QUESTIONS = {
    "en": (
        "Describe a project you built, its architecture, and the part you personally owned.",
        "Explain a core concept for this role that shaped one of your technical decisions.",
        "How did you test the most important behaviour, and how did you make it reliable?",
        "Describe a difficult technical problem you diagnosed and how you found its cause.",
        "Choose one important trade-off in your solution and explain what you would change now.",
    ),
    "fr": (
        "Décrivez un projet que vous avez réalisé, son architecture et la partie dont vous "
        "étiez personnellement responsable.",
        "Expliquez un concept essentiel pour ce rôle qui a orienté l'une de vos décisions "
        "techniques.",
        "Comment avez-vous testé le comportement le plus important, et comment l'avez-vous "
        "rendu fiable\u202f?",
        "Décrivez un problème technique difficile que vous avez diagnostiqué et comment vous "
        "en avez trouvé la cause.",
        "Choisissez un compromis important dans votre solution et expliquez ce que vous "
        "changeriez aujourd'hui.",
    ),
}
DEFAULT_MESSAGES = {
    "en": {
        "welcome": (
            "Welcome to your {role_name} verification interview. I will ask five "
            "technical questions based on the role and your submitted work."
        ),
        "question": "For the {role_name} role: {question}",
        "acknowledgement": "Thank you. I have recorded that response.",
        "final_acknowledgement": "Thank you. I have recorded your final response.",
        "closing": (
            "That completes the technical interview. Your codebase and interview evidence "
            "will now be prepared for peer review."
        ),
    },
    "fr": {
        "welcome": (
            "Bienvenue à votre entretien de vérification pour le rôle {role_name}. Je vais "
            "vous poser cinq questions techniques fondées sur le rôle et sur le travail que "
            "vous avez soumis."
        ),
        "question": "Pour le rôle {role_name}\u202f: {question}",
        "acknowledgement": "Merci. J'ai bien enregistré cette réponse.",
        "final_acknowledgement": "Merci. J'ai bien enregistré votre dernière réponse.",
        "closing": (
            "L'entretien technique est terminé. Votre code et les éléments de l'entretien "
            "vont maintenant être préparés pour la revue par vos pairs."
        ),
    },
}


class DefaultInterviewAgent:
    async def opening(
        self, role_slug: str, analysis: dict | None, language: str
    ) -> InterviewOpening:
        return InterviewOpening(
            welcome=DEFAULT_MESSAGES[language]["welcome"].format(
                role_name=role_slug.replace("-", " ")
            ),
            question=self._question(role_slug, 1, language),
        )

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
    ) -> InterviewContinuation:
        return InterviewContinuation(
            acknowledgement=DEFAULT_MESSAGES[language]["acknowledgement"],
            question=self._question(role_slug, next_turn, language),
        )

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
    ) -> InterviewClosing:
        return InterviewClosing(
            acknowledgement=DEFAULT_MESSAGES[language]["final_acknowledgement"],
            closing=DEFAULT_MESSAGES[language]["closing"],
        )

    def _question(self, role_slug: str, turn_number: int, language: str) -> str:
        questions = DEFAULT_QUESTIONS[language]
        index = min(max(turn_number - 1, 0), len(questions) - 1)
        return DEFAULT_MESSAGES[language]["question"].format(
            role_name=role_slug.replace("-", " "), question=questions[index]
        )


class FallbackInterviewAgent:
    def __init__(self, primary: InterviewAgent, fallback: InterviewAgent) -> None:
        self.primary = primary
        self.fallback = fallback

    async def opening(
        self, role_slug: str, analysis: dict | None, language: str
    ) -> InterviewOpening:
        try:
            return await self.primary.opening(role_slug, analysis, language)
        except InterviewUnavailable:
            return await self.fallback.opening(role_slug, analysis, language)

    async def continuation(
        self,
        role_slug: str,
        next_turn: int,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
    ) -> InterviewContinuation:
        try:
            return await self.primary.continuation(
                role_slug, next_turn, analysis, history, language
            )
        except InterviewUnavailable:
            return await self.fallback.continuation(
                role_slug, next_turn, analysis, history, language
            )

    async def closing(
        self,
        role_slug: str,
        analysis: dict | None,
        history: list[InterviewHistoryItem],
        language: str,
    ) -> InterviewClosing:
        try:
            return await self.primary.closing(role_slug, analysis, history, language)
        except InterviewUnavailable:
            return await self.fallback.closing(role_slug, analysis, history, language)


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
