"""Requests and responses for the idea lifecycle.

The public shape deliberately excludes `details`. It is an idea brief, not a matching-card
field, and only its owner may read it through the API today.
"""

from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.ideas import IdeaStage, IdeaStatus
from app.schemas.lookups import RoleRef

IdeaTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=150)]
IdeaSummary = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=20, max_length=1000)
]
IdeaDetails = Annotated[str, StringConstraints(max_length=20000)]
RoleSlug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"
    ),
]


class IdeaRolesInput(BaseModel):
    """A reusable role list that rejects duplicate matching signals."""

    roles_needed: list[RoleSlug] = Field(default_factory=list, max_length=9)

    @field_validator("roles_needed")
    @classmethod
    def roles_are_distinct(cls, roles: list[str]) -> list[str]:
        if len(set(roles)) != len(roles):
            raise ValueError("Duplicate roles are not allowed.")
        return roles


class CreateIdeaRequest(IdeaRolesInput):
    model_config = ConfigDict(extra="forbid")

    title: IdeaTitle
    summary: IdeaSummary
    details: IdeaDetails | None = None
    stage: IdeaStage = IdeaStage.CONCEPT


class UpdateIdeaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: IdeaTitle | None = None
    summary: IdeaSummary | None = None
    details: IdeaDetails | None = None
    stage: IdeaStage | None = None
    roles_needed: list[RoleSlug] | None = Field(default=None, max_length=9)

    @field_validator("title", "summary", "stage", "roles_needed", mode="before")
    @classmethod
    def required_update_value_is_not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null. Leave it out to keep its current value.")
        return value

    @field_validator("roles_needed")
    @classmethod
    def roles_are_distinct(cls, roles: list[str] | None) -> list[str] | None:
        if roles is not None and len(set(roles)) != len(roles):
            raise ValueError("Duplicate roles are not allowed.")
        return roles

    @model_validator(mode="after")
    def has_a_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Send at least one idea field to update.")
        return self


class IdeaAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    is_verified: bool = False


class PublicIdea(BaseModel):
    """An open idea's safe matching/discovery card, without its confidential brief."""

    id: UUID
    title: str
    summary: str
    stage: IdeaStage
    status: IdeaStatus
    roles_needed: list[RoleRef]
    author: IdeaAuthor
    hub_id: UUID | None
    published_at: datetime
    created_at: datetime
    updated_at: datetime


class OwnedIdeaCard(BaseModel):
    """An owner list item. Details stay out of collection responses to keep them small."""

    id: UUID
    title: str
    summary: str
    stage: IdeaStage
    status: IdeaStatus
    roles_needed: list[RoleRef]
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class OwnedIdea(OwnedIdeaCard):
    """The owner-only view, including the confidential brief."""

    details: str | None = None


class IdeaResponse(BaseModel):
    data: OwnedIdea


class PublicIdeaResponse(BaseModel):
    data: PublicIdea


class MyIdeasResponse(BaseModel):
    data: list[OwnedIdeaCard]
    next_offset: int | None = None


class PublicIdeasResponse(BaseModel):
    data: list[PublicIdea]
    next_offset: int | None = None
