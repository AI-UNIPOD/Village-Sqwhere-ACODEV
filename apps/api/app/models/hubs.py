"""Hubs and their NDA agreements: infra/db/init/002-schema.sql (section 6) and 003-hub-terms.sql.

The database enforces the rules (published templates only, frozen terms, the owner's
signature and membership at commit). Columns it computes are read back, never set here.
"""

from datetime import datetime
from enum import StrEnum
from ipaddress import IPv4Address, IPv6Address
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    Enum,
    FetchedValue,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship, validates

from app.models.ideas import Idea
from app.models.lookups import Base
from app.models.users import User


class HubStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class HubMemberRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class HubMemberStatus(StrEnum):
    REQUESTED = "requested"
    INVITED = "invited"
    ACTIVE = "active"
    DECLINED = "declined"
    LEFT = "left"
    REMOVED = "removed"


def _computed_by_the_database(key: str) -> None:
    # The trigger would overwrite the value, but the object would keep what Python set,
    # so code could show a hash or terms nobody signed.
    raise ValueError(f"{key} is computed by the database; do not set it")


def _pg_enum(enum: type[StrEnum], name: str) -> Enum:
    return Enum(
        enum,
        name=name,
        create_type=False,
        native_enum=True,
        values_callable=lambda obj: [e.value for e in obj],
    )


class AgreementTemplate(Base):
    """The agreement text. A published one cannot be edited: a change is a new version."""

    __tablename__ = "agreement_templates"
    # read database-filled columns back with RETURNING, because a lazy load fails in async
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # computed from body by the agreement_templates_guard trigger
    body_sha256: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=FetchedValue(), server_onupdate=FetchedValue()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("version", name="agreement_templates_version_uq"),
        UniqueConstraint("id", "body_sha256", name="agreement_templates_id_hash_uq"),
    )

    @validates("body_sha256")
    def _refuse_body_sha256(self, key: str, value: str) -> str:
        _computed_by_the_database(key)
        return value


class Hub(Base):
    __tablename__ = "hubs"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    idea_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    owner_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agreement_template_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("agreement_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[HubStatus] = mapped_column(
        _pg_enum(HubStatus, "hub_status"), default=HubStatus.ACTIVE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # set by the hubs_set_updated_at trigger
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=FetchedValue(),
        nullable=False,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # set once at creation; the hubs_terms_immutable trigger refuses any change
    terms: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb"), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("idea_id", name="hubs_one_per_idea_uq"),
        # the hub owner must be the idea's author
        ForeignKeyConstraint(
            ["idea_id", "owner_id"],
            ["ideas.id", "ideas.author_id"],
            ondelete="RESTRICT",
            name="hubs_idea_owner_fk",
        ),
    )

    # Read-only: idea_id, owner_id and agreement_template_id are set directly and the
    # database refuses to change them after creation.
    idea: Mapped[Idea] = relationship(lazy="selectin", viewonly=True)
    owner: Mapped[User] = relationship(
        primaryjoin="foreign(Hub.owner_id) == User.id", lazy="selectin", viewonly=True
    )
    agreement_template: Mapped[AgreementTemplate] = relationship(lazy="selectin", viewonly=True)


class AgreementSignature(Base):
    """A member's signature of the agreement. Append-only legal evidence."""

    __tablename__ = "agreement_signatures"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    hub_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("hubs.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    template_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    template_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    signed_legal_name: Mapped[str] = mapped_column(Text, nullable=False)
    # copied from the hub's terms by the agreement_signatures_copy_terms trigger
    terms_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=FetchedValue(), nullable=False
    )
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip_address: Mapped[IPv4Address | IPv6Address | str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # the signer saw exactly this text: id and hash must match the template
        ForeignKeyConstraint(
            ["template_id", "template_sha256"],
            ["agreement_templates.id", "agreement_templates.body_sha256"],
            ondelete="RESTRICT",
            name="agreement_signatures_template_fk",
        ),
        UniqueConstraint("hub_id", "user_id", "template_id", name="agreement_signatures_once_uq"),
        UniqueConstraint("id", "hub_id", "user_id", name="agreement_signatures_member_ref_uq"),
    )

    # Not read-only, so a flush inserts the hub before its signature. Without a relationship
    # SQLAlchemy does not order INSERTs by foreign keys.
    hub: Mapped[Hub] = relationship(lazy="selectin")

    @validates("terms_snapshot")
    def _refuse_terms_snapshot(self, key: str, value: dict[str, Any]) -> dict[str, Any]:
        _computed_by_the_database(key)
        return value


class HubMember(Base):
    __tablename__ = "hub_members"
    __mapper_args__ = {"eager_defaults": True}

    hub_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("hubs.id", ondelete="RESTRICT"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    member_role: Mapped[HubMemberRole] = mapped_column(
        _pg_enum(HubMemberRole, "hub_member_role"), default=HubMemberRole.MEMBER, nullable=False
    )
    status: Mapped[HubMemberStatus] = mapped_column(
        _pg_enum(HubMemberStatus, "hub_member_status"), nullable=False
    )
    invited_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    signature_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # the join request cool-down (infra/db/init/012-join-request-cooldown.sql)
    declines_in_a_row: Mapped[int] = mapped_column(
        SmallInteger, server_default=text("0"), nullable=False
    )
    can_ask_again_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # set by the hub_members_set_updated_at trigger
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=FetchedValue(),
        nullable=False,
    )

    __table_args__ = (
        # the NDA gate: the signature must be this member's, for this hub
        ForeignKeyConstraint(
            ["signature_id", "hub_id", "user_id"],
            [
                "agreement_signatures.id",
                "agreement_signatures.hub_id",
                "agreement_signatures.user_id",
            ],
            ondelete="RESTRICT",
            name="hub_members_signature_fk",
        ),
    )

    # Not read-only, so a flush inserts the hub and the signature before this row. Without a
    # relationship SQLAlchemy does not order INSERTs by foreign keys.
    hub: Mapped[Hub] = relationship(lazy="selectin", overlaps="signature")
    signature: Mapped[AgreementSignature | None] = relationship(lazy="selectin", overlaps="hub")


# The idea's hub, if it has one, so an open idea's card can say where to ask to join. Set here
# because Hub is defined after Idea; an idea has at most one hub (hubs_one_per_idea_uq).
Idea.hub_id = column_property(
    select(Hub.id).where(Hub.idea_id == Idea.id).correlate_except(Hub).scalar_subquery()
)
