from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    FetchedValue,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Integer,
    LargeBinary,
    SmallInteger,
    Text,
    UniqueConstraint,
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


class PostAttachment(Base):
    __tablename__ = "post_attachments"
    __mapper_args__ = {"eager_defaults": True}
    __table_args__ = (
        CheckConstraint("byte_size BETWEEN 1 AND 4194304", name="post_attachments_byte_size"),
        CheckConstraint("octet_length(data) = byte_size", name="post_attachments_data_size"),
        CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name="post_attachments_mime_type",
        ),
        CheckConstraint(
            "(width IS NULL OR width > 0) AND (height IS NULL OR height > 0)",
            name="post_attachments_dimensions",
        ),
        CheckConstraint("position BETWEEN 0 AND 9", name="post_attachments_position_range"),
        UniqueConstraint("storage_key", name="post_attachments_storage_key_uq"),
        UniqueConstraint("post_id", "position", name="post_attachments_position_uq"),
    )

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    # deferred, so a feed page reads the image facts without loading every image
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
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


class Comment(Base):
    """A comment on a post, or a reply when parent_id is set. The insert trigger checks that
    the post and parent are live and recomputes root_id and depth."""

    __tablename__ = "comments"
    __mapper_args__ = {"eager_defaults": True}
    __table_args__ = (
        ForeignKeyConstraint(
            ["post_id", "parent_id"], ["comments.post_id", "comments.id"], ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["post_id", "root_id"], ["comments.post_id", "comments.id"], ondelete="CASCADE"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    post_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    root_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    depth: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
    reply_count: Mapped[int] = mapped_column(Integer, server_default=text("0"), nullable=False)
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


class CommentRevision(Base):
    """Previous versions of edited comments. Maintained by PostgreSQL trigger."""

    __tablename__ = "comment_revisions"
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    comment_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    replaced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CommentLike(Base):
    __tablename__ = "comment_likes"
    __mapper_args__ = {"eager_defaults": True}

    comment_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
