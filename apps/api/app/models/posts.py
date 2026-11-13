from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    FetchedValue,
    ForeignKey,
    Identity,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.lookups import Base
from app.models.users import User


class PostType(StrEnum):
    GENERAL = "general"
    QUESTION = "question"
    ARCHITECTURE_CHALLENGE = "architecture_challenge"
    CODE_REVIEW_REQUEST = "code_review_request"
    OSS_RELEASE = "oss_release"
    RFC = "rfc"
    RESEARCH_NOTE = "research_note"
    HUB_MILESTONE = "hub_milestone"


class DeletionReason(StrEnum):
    AUTHOR = "author"
    MODERATOR = "moderator"
    ACCOUNT_DELETED = "account_deleted"


def _pg_enum(enum: type[StrEnum], name: str) -> Enum:
    return Enum(
        enum,
        name=name,
        create_type=False,
        native_enum=True,
        values_callable=lambda obj: [e.value for e in obj],
    )


class Post(Base):
    __tablename__ = "posts"
    # Read database-filled columns back with RETURNING so async code does not lazy-load.
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    author_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[PostType] = mapped_column(
        _pg_enum(PostType, "post_type"),
        default=PostType.GENERAL,
        server_default=text("'general'"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    hub_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("hubs.id", ondelete="RESTRICT"), nullable=True
    )
    like_count: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=FetchedValue(),
        nullable=False,
    )
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_onupdate=FetchedValue(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    deletion_reason: Mapped[DeletionReason | None] = mapped_column(
        _pg_enum(DeletionReason, "deletion_reason"), nullable=True
    )

    # author uses lazy="raise" to avoid loading a full User entity and cascading into
    # roles, identities, technologies and feed_topics.
    author: Mapped[User] = relationship(
        "User",
        foreign_keys=[author_id],
        lazy="raise",
        viewonly=True,
    )


class PostTopic(Base):
    __tablename__ = "post_topics"

    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    technology_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("technologies.id", ondelete="RESTRICT"), primary_key=True
    )


class PostRevision(Base):
    """Previous versions of edited posts. Maintained by PostgreSQL trigger."""

    __tablename__ = "post_revisions"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    replaced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PostLike(Base):
    __tablename__ = "post_likes"
    __mapper_args__ = {"eager_defaults": True}

    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SavedPost(Base):
    __tablename__ = "saved_posts"
    __mapper_args__ = {"eager_defaults": True}

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
