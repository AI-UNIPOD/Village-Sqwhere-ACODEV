from datetime import datetime
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.lookups import Base


class IdeaEmbedding(Base):
    __tablename__ = "idea_embeddings"

    idea_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(Text, nullable=False, default="all-MiniLM-L6-v2")
    embedding: Mapped[list[float]] = mapped_column(Vector(384), nullable=False)
    source_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfileEmbedding(Base):
    __tablename__ = "profile_embeddings"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(Text, nullable=False, default="all-MiniLM-L6-v2")
    embedding: Mapped[list[float]] = mapped_column(Vector(384), nullable=False)
    source_sha256: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
