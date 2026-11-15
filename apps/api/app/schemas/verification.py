from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class StartVerificationRequest(BaseModel):
    source: Literal["github"] = "github"
    repositories: list[str] = Field(min_length=1, max_length=10)
    language: Literal["en", "fr"] = "en"

    @field_validator("repositories")
    @classmethod
    def validate_repositories(cls, repositories: list[str]) -> list[str]:
        if len(set(repositories)) != len(repositories):
            raise ValueError("Duplicate repositories are not allowed.")
        for repository in repositories:
            if not repository.startswith("https://github.com/"):
                raise ValueError("Repositories must be GitHub HTTPS URLs.")
            parts = repository.removeprefix("https://github.com/").strip("/").split("/")
            if len(parts) != 2 or not all(parts):
                raise ValueError("Use GitHub repository URLs like https://github.com/org/repo.")
        return repositories


class VerificationDecisionRequest(BaseModel):
    decision: Literal["passed", "failed"]
    notes: str | None = Field(default=None, max_length=2000)


class VerificationResponse(BaseModel):
    id: UUID
    role: str
    role_name: str
    attempt_number: int
    language: str
    status: str
    current_phase: str | None = None
    analysis_attempts: int = 0
    last_error: str | None = None
    source: str | None = None
    evidence: list
    ai_score: float | None = None
    ai_result: dict | None = None
    reviewer_notes: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class VerificationListResponse(BaseModel):
    data: list[VerificationResponse]
    next_offset: int | None = None


class VerificationItemResponse(BaseModel):
    data: VerificationResponse


class InterviewTicket(BaseModel):
    """A one-use pass to open the interview socket with `?ticket=`, valid for about a minute."""

    ticket: str
    expires_at: datetime


class InterviewTicketResponse(BaseModel):
    data: InterviewTicket
