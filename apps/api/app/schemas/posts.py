"""Request and response schemas for the posts endpoints.

Request validation mirrors the SQL constraints from infra/db/init/002-schema.sql so invalid input
fails before hitting the database. Every request schema forbids unexpected fields.
"""

from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.models.posts import PostType
from app.schemas.lookups import TechnologyRef

# PostgreSQL text cannot hold a null character, so it is refused here instead of failing there.
NO_NULL = r"^[^\x00]*$"

PostTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200, pattern=NO_NULL)
]


def _validate_body(body: str) -> str:
    if not body.strip():
        raise ValueError("body must not be whitespace only")
    if "\x00" in body:
        raise ValueError("body must not contain a null character")
    return body


PostBody = Annotated[
    str,
    StringConstraints(min_length=1, max_length=20000),
    AfterValidator(_validate_body),
]

PostLinkUrl = Annotated[str, StringConstraints(max_length=2048, pattern=r"^https?://[^\x00]*$")]


# --- Requests --------------------------------------------------------------------------------


class PostCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: PostType = PostType.GENERAL
    title: PostTitle | None = None
    body: PostBody
    link_url: PostLinkUrl | None = None
    topics: list[Annotated[str, StringConstraints(pattern=NO_NULL)]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_rfc_title(self) -> Self:
        if self.type == PostType.RFC and not self.title:
            raise ValueError("title is required for RFC posts")
        return self


class PostUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: PostTitle | None = None
    body: PostBody | None = None
    link_url: PostLinkUrl | None = None

    @model_validator(mode="after")
    def _validate_body_not_null(self) -> Self:
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("body cannot be null")
        return self


# --- Responses -------------------------------------------------------------------------------


class PostAuthorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    is_verified: bool


class PostAttachmentResponse(BaseModel):
    id: UUID
    url: str
    mime_type: str
    byte_size: int
    width: int
    height: int
    position: int
    created_at: datetime


class PostAttachmentItemResponse(BaseModel):
    data: PostAttachmentResponse


class PostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: PostType
    title: str | None
    body: str
    link_url: str | None
    attachments: list[PostAttachmentResponse]
    author: PostAuthorRef
    topics: list[TechnologyRef]
    like_count: int
    comment_count: int
    created_at: datetime
    updated_at: datetime
    edited_at: datetime | None
    liked_by_me: bool
    saved_by_me: bool


class PostItemResponse(BaseModel):
    data: PostResponse


class PostListResponse(BaseModel):
    data: list[PostResponse]
    next_offset: int | None = None
