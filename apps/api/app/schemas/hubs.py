"""What the hub endpoints accept and return.

Request limits match the CHECK constraints in infra/db/init, so bad input gets a 422 that
names the field instead of a database error. Every request refuses unknown fields, so a
client cannot send owner_id, status or terms_snapshot.
"""

import json
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.hubs import HubMemberRole, HubMemberStatus, HubStatus

# Our own limit, not the database's: hub terms written as compact JSON may be at most this
# many characters. The team can change it here.
MAX_HUB_TERMS_JSON_CHARS = 4096

HubName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
HubDescription = Annotated[str, StringConstraints(max_length=2000)]
LegalName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
TermsNotes = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class OwnershipModel(StrEnum):
    EQUAL_SPLIT = "equal_split"
    OWNER_MAJORITY = "owner_majority"
    CUSTOM = "custom"


# --- requests ----------------------------------------------------------------------------


class HubTerms(BaseModel):
    """The deal every member signs. Set when the hub is created and never changed."""

    model_config = ConfigDict(extra="forbid")

    ownership_model: OwnershipModel
    notes: TermsNotes | None = None

    def stored(self) -> dict[str, Any]:
        """The terms as saved in hubs.terms, without empty optional keys."""
        return self.model_dump(mode="json", exclude_none=True)

    @model_validator(mode="after")
    def fits(self) -> Self:
        # counted as characters, not escapes, so French accents cost one character each
        size = len(json.dumps(self.stored(), separators=(",", ":"), ensure_ascii=False))
        if size > MAX_HUB_TERMS_JSON_CHARS:
            raise ValueError(f"terms must be at most {MAX_HUB_TERMS_JSON_CHARS} characters as JSON")
        return self


class AgreementAcceptance(BaseModel):
    """The agreement the person read: the hash proves it was exactly this text."""

    model_config = ConfigDict(extra="forbid")

    template_id: UUID
    template_sha256: Sha256Hex
    signed_legal_name: LegalName


class CreateHubRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea_id: UUID
    name: HubName
    description: HubDescription | None = None
    terms: HubTerms = Field(
        default_factory=lambda: HubTerms(ownership_model=OwnershipModel.EQUAL_SPLIT)
    )
    agreement: AgreementAcceptance


class UpdateHubRequest(BaseModel):
    """Only name and description change. Terms are frozen once members signed them.

    A description sent as null clears it; a field left out stays as it is. Use
    model_fields_set (or model_dump(exclude_unset=True)) to tell the two apart.
    """

    model_config = ConfigDict(extra="forbid")

    name: HubName | None = None
    description: HubDescription | None = None

    @field_validator("name", mode="before")
    @classmethod
    def name_is_not_null(cls, name: object) -> object:
        if name is None:
            raise ValueError("name cannot be empty; leave it out to keep the current name")
        return name

    @model_validator(mode="after")
    def something_to_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send name or description")
        return self


# --- responses ---------------------------------------------------------------------------


class Agreement(BaseModel):
    template_id: UUID
    version: int
    title: str
    body: str
    body_sha256: str
    published_at: datetime
    # the terms a person signs with this text; empty on GET /v1/agreements/current
    hub_terms: dict[str, Any] = Field(default_factory=dict)


class AgreementResponse(BaseModel):
    data: Agreement


class HubIdea(BaseModel):
    """The public part of the idea. Never the confidential details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    summary: str


class HubOwner(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    is_verified: bool = False


class HubViewer(BaseModel):
    """The signed-in person's place in the hub; both null when they are not a member."""

    membership_status: HubMemberStatus | None = None
    member_role: HubMemberRole | None = None


class HubAgreement(BaseModel):
    template_id: UUID
    version: int


class Hub(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    status: HubStatus
    terms: dict[str, Any]
    idea: HubIdea
    owner: HubOwner
    member_count: int
    agreement: HubAgreement
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    viewer: HubViewer


class HubResponse(BaseModel):
    data: Hub


class HubListResponse(BaseModel):
    data: list[Hub]
    next_offset: int | None = None
