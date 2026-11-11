from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, FetchedValue, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.lookups import Base


class IdeaStage(StrEnum):
    CONCEPT = "concept"
    PROTOTYPE = "prototype"
    BUILDING = "building"


class IdeaStatus(StrEnum):
    DRAFT = "draft"
    OPEN = "open"
    CLOSED = "closed"


class Idea(Base):
    """An idea. Its lengths are checked by the database and by the request schemas."""

    __tablename__ = "ideas"
    # read updated_at back with RETURNING, because a lazy load fails in async code
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    author_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # confidential: only for hub members, never in a hub response
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[IdeaStage] = mapped_column(
        Enum(
            IdeaStage,
            name="idea_stage",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=IdeaStage.CONCEPT,
        nullable=False,
    )
    status: Mapped[IdeaStatus] = mapped_column(
        Enum(
            IdeaStatus,
            name="idea_status",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=IdeaStatus.DRAFT,
        nullable=False,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # set by the ideas_set_updated_at trigger
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        server_onupdate=FetchedValue(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("id", "author_id", name="ideas_id_author_uq"),)
