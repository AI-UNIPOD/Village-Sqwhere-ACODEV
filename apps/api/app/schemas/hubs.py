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

from app.models.hubs import HubDeclineKind, HubMemberRole, HubMemberStatus, HubPhase, HubStatus
from app.models.ideas import IdeaStage, IdeaStatus
from app.schemas.posts import NO_NULL

# Our own limit, not the database's: hub terms written as compact JSON may be at most this
# many characters. The team can change it here.
MAX_HUB_TERMS_JSON_CHARS = 4096

HubName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
HubDescription = Annotated[str, StringConstraints(max_length=2000)]
LegalName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
TermsNotes = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
# the hub_notes_body_length CHECK, counted in characters
NoteBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=280, pattern=NO_NULL)
]
# the hub_pieces and hub_piece_links CHECKs, counted in characters
PieceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60, pattern=NO_NULL)
]
PieceSummary = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=280, pattern=NO_NULL)
]
LinkLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60, pattern=NO_NULL)
]
# the hub_messages_body_length CHECK, counted in characters
MessageBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000, pattern=NO_NULL)
]
# the users_username_format CHECK
Username = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_-]{3,39}$")
]


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


class InviteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Username


class AddNoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: NoteBody


class AddPieceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: PieceName
    summary: PieceSummary = ""


class UpdatePieceRequest(BaseModel):
    """A field left out stays as it is. A summary sent empty clears it."""

    model_config = ConfigDict(extra="forbid")

    name: PieceName | None = None
    summary: PieceSummary | None = None

    @field_validator("name", "summary", mode="before")
    @classmethod
    def not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("leave the field out to keep the current value")
        return value

    @model_validator(mode="after")
    def something_to_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send name or summary")
        return self


class AddLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_piece_id: UUID
    to_piece_id: UUID
    label: LinkLabel

    @model_validator(mode="after")
    def joins_two_pieces(self) -> Self:
        if self.from_piece_id == self.to_piece_id:
            raise ValueError("a link joins two different pieces")
        return self


class MovePhaseRequest(BaseModel):
    """The phase to move to: the one after the hub's current phase, or the one before it."""

    model_config = ConfigDict(extra="forbid")

    phase: HubPhase


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
    # When an owner turned them down: the time they may ask to join again, while it is ahead.
    can_ask_again_at: datetime | None = None


class HubAgreement(BaseModel):
    template_id: UUID
    version: int


class HubPhaseState(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class HubPhaseStep(BaseModel):
    phase: HubPhase
    state: HubPhaseState


class Hub(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    status: HubStatus
    # null until the owner confirms the team; `phases` lists all four in order with their state
    phase: HubPhase | None = None
    team_confirmed_at: datetime | None = None
    phases: list[HubPhaseStep]
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


class MyHubsStatus(StrEnum):
    """The memberships GET /v1/me/hubs can list. Declined, left and removed ones are history,
    not hubs the person is in."""

    ACTIVE = "active"
    REQUESTED = "requested"
    INVITED = "invited"


class HubListResponse(BaseModel):
    data: list[Hub]
    next_offset: int | None = None


class HubMemberCard(BaseModel):
    """One person's place in a hub. `updated_at` is when the status last changed.

    `decline_kind` says which "no" a "declined" status was, and is null for every other status
    and for rows declined before it was recorded.
    """

    user: HubOwner
    member_role: HubMemberRole
    status: HubMemberStatus
    decline_kind: HubDeclineKind | None = None
    joined_at: datetime | None = None
    updated_at: datetime


class HubMemberResponse(BaseModel):
    data: HubMemberCard


class MySignature(BaseModel):
    """What the person signed: the agreement version, its text's hash, the name they typed and
    the hub's terms as they stood. The address and browser it came from are kept, not shown."""

    template_id: UUID
    version: int
    template_sha256: str
    signed_legal_name: str
    terms_snapshot: dict[str, Any]
    signed_at: datetime


class MyMembership(BaseModel):
    """The signed-in person's own membership row in a hub, with the signature it rests on."""

    member_role: HubMemberRole
    status: HubMemberStatus
    decline_kind: HubDeclineKind | None = None
    can_ask_again_at: datetime | None = None
    created_at: datetime
    joined_at: datetime | None = None
    left_at: datetime | None = None
    signature: MySignature | None = None


class MyMembershipResponse(BaseModel):
    data: MyMembership


class HubMembersResponse(BaseModel):
    data: list[HubMemberCard]


class HubIdeaBrief(BaseModel):
    """The whole idea, confidential details included. Only for the hub's active members."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    summary: str
    details: str | None = None
    stage: IdeaStage
    status: IdeaStatus
    published_at: datetime | None = None
    updated_at: datetime


class HubIdeaBriefResponse(BaseModel):
    data: HubIdeaBrief


class HubNoteCard(BaseModel):
    """`can_delete` is true for the note's author and the hub's owner while the hub is active and
    in brainstorm, the only time a note can be removed."""

    id: UUID
    body: str
    author: HubOwner
    created_at: datetime
    can_delete: bool


class QuotedMessage(BaseModel):
    """The message a reply quotes. `body` is null once that message was deleted."""

    id: UUID
    author: HubOwner
    body: str | None = None


class HubMessageCard(BaseModel):
    """`can_edit` is true for the author, and `can_delete` for the author and the hub's owner,
    while the hub is active."""

    id: UUID
    body: str
    author: HubOwner
    reply_to: QuotedMessage | None = None
    created_at: datetime
    edited_at: datetime | None = None
    can_edit: bool
    can_delete: bool


class HubMessageResponse(BaseModel):
    data: HubMessageCard


class HubMessageListResponse(BaseModel):
    data: list[HubMessageCard]
    next_offset: int | None = None


class PostMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: MessageBody
    reply_to_id: UUID | None = None


class EditMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: MessageBody


class HubNoteResponse(BaseModel):
    data: HubNoteCard


class HubNoteListResponse(BaseModel):
    data: list[HubNoteCard]
    next_offset: int | None = None


class HubPieceCard(BaseModel):
    """`can_delete` is true for the piece's creator and the hub's owner while the hub is active
    and in design, the only time a piece can be removed."""

    id: UUID
    name: str
    summary: str
    created_by: HubOwner
    created_at: datetime
    updated_at: datetime
    can_delete: bool


class HubPieceResponse(BaseModel):
    data: HubPieceCard


class HubLinkCard(BaseModel):
    """`can_delete` follows the same rule as a piece's."""

    id: UUID
    from_piece_id: UUID
    to_piece_id: UUID
    label: str
    created_by: HubOwner
    created_at: datetime
    can_delete: bool


class HubLinkResponse(BaseModel):
    data: HubLinkCard


class HubDesign(BaseModel):
    pieces: list[HubPieceCard]
    links: list[HubLinkCard]


class HubDesignResponse(BaseModel):
    data: HubDesign
