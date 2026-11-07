from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.lookups import TechnologyRef


class UserRoleVerification(BaseModel):
    attempts_used: int = 0
    attempts_remaining: int = 3
    latest_status: str | None = None


class UserRoleDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    is_primary: bool
    verified_at: datetime | None = None
    verification: UserRoleVerification = UserRoleVerification()


class UserIdentityRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str
    provider_username: str
    linked_at: datetime


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    email_verified: bool = False
    avatar_url: str | None = None
    bio: str | None = None
    is_verified: bool = False
    verified_at: datetime | None = None
    platform_role: str = "member"
    roles: list[UserRoleDetail] = []
    technologies: list[TechnologyRef] = []
    feed_topics: list[TechnologyRef] = []
    identities: list[UserIdentityRef] = []
    created_at: datetime


class MeResponse(BaseModel):
    data: UserProfile


class UserProfileUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    bio: str | None = None
    email: str | None = None

