"""Request and response schemas for comments and replies on posts.

The body limits mirror `comments_body_length` in infra/db/init/002-schema.sql.
"""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from app.schemas.posts import PostAuthorRef


def _validate_body(body: str) -> str:
    if not body.strip():
        raise ValueError("body must not be whitespace only")
    if "\x00" in body:
        raise ValueError("body must not contain a null character")
    return body


CommentBody = Annotated[
    str, StringConstraints(min_length=1, max_length=5000), AfterValidator(_validate_body)
]


class CommentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: CommentBody
    parent_id: UUID | None = None


class CommentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: CommentBody


class CommentResponse(BaseModel):
    id: UUID
    post_id: UUID
    parent_id: UUID | None
    depth: int
    author: PostAuthorRef
    body: str
    like_count: int
    reply_count: int
    created_at: datetime
    edited_at: datetime | None
    liked_by_me: bool


class CommentItemResponse(BaseModel):
    data: CommentResponse
