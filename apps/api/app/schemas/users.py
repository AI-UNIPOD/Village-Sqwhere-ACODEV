from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.countries import AFRICAN_COUNTRY_CODES
from app.schemas.lookups import SectorRef, TechnologyRef


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
    country_code: str | None = None
    is_verified: bool = False
    verified_at: datetime | None = None
    platform_role: str = "member"
    is_demo: bool = False
    roles: list[UserRoleDetail] = []
    technologies: list[TechnologyRef] = []
    feed_topics: list[TechnologyRef] = []
    sectors: list[SectorRef] = []
    identities: list[UserIdentityRef] = []
    created_at: datetime


class MeResponse(BaseModel):
    data: UserProfile


class UserProfileUpdate(BaseModel):
    # The limits match the CHECK constraints on the users table, so bad input gets a 422
    # that names the field instead of a database error.
    username: str | None = None
    display_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None
    ) = None
    first_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
        | None
    ) = None
    last_name: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
        | None
    ) = None
    bio: Annotated[str, StringConstraints(max_length=1000)] | None = None
    email: (
        Annotated[str, StringConstraints(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
        | None
    ) = None
    # null clears the country; leaving the key out keeps it (the route checks model_fields_set)
    country_code: str | None = None

    @field_validator("country_code")
    @classmethod
    def country_must_be_african(cls, code: str | None) -> str | None:
        if code is not None and code not in AFRICAN_COUNTRY_CODES:
            raise ValueError("must be the two-letter code of an African country, such as NG")
        return code


class UserRoleResponse(BaseModel):
    data: UserRoleDetail


class DeleteAccountRequest(BaseModel):
    """The person types their username to confirm, so a stray request cannot delete an account."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=1, max_length=39)


class ClaimRoleRequest(BaseModel):
    role: str = Field(..., max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    is_primary: bool = False


class UpdateRoleRequest(BaseModel):
    is_primary: bool = Field(True)


class ReplaceTechnologiesRequest(BaseModel):
    technologies: list[str] = Field(..., max_length=30)


class ReplaceFeedTopicsRequest(BaseModel):
    technologies: list[str] = Field(..., max_length=50)


class TechnologiesResponse(BaseModel):
    data: list[TechnologyRef]


SectorSlug = Annotated[str, StringConstraints(max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]


class ReplaceSectorsRequest(BaseModel):
    sectors: list[SectorSlug] = Field(..., max_length=20)


class SectorsResponse(BaseModel):
    data: list[SectorRef]
