from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    FetchedValue,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.lookups import Base, Role, Sector, Technology


class AuthProvider(StrEnum):
    GITHUB = "github"
    BITBUCKET = "bitbucket"


class PlatformRole(StrEnum):
    MEMBER = "member"
    MODERATOR = "moderator"
    ADMIN = "admin"


class VerificationStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    AWAITING_REVIEW = "awaiting_review"
    PASSED = "passed"
    FAILED = "failed"
    ABANDONED = "abandoned"


class InterviewStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    INCOMPLETE = "incomplete"
    ABANDONED = "abandoned"


class VerificationPhase(StrEnum):
    CODEBASE_ANALYSIS = "codebase_analysis"
    TECHNICAL_DEFENCE = "technical_defence"
    REPORT_GENERATION = "report_generation"


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(39), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    country_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform_role: Mapped[PlatformRole] = mapped_column(
        Enum(
            PlatformRole,
            name="platform_role",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=PlatformRole.MEMBER,
        nullable=False,
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    identities: Mapped[list["UserIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    technologies: Mapped[list["UserTechnology"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    feed_topics: Mapped[list["UserFeedTopic"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    sectors: Mapped[list["UserSector"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="UserSector.sector_id",
    )


class UserIdentity(Base):
    __tablename__ = "user_identities"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[AuthProvider] = mapped_column(
        Enum(
            AuthProvider,
            name="auth_provider",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    provider_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    provider_username: Mapped[str] = mapped_column(Text, nullable=False)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="identities")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="roles")
    role: Mapped["Role"] = relationship(lazy="selectin")
    verification_sessions: Mapped[list["VerificationSession"]] = relationship(
        back_populates="user_role",
        lazy="selectin",
        order_by="VerificationSession.attempt_number",
    )


class UserTechnology(Base):
    __tablename__ = "user_technologies"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    technology_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("technologies.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="technologies")
    technology: Mapped["Technology"] = relationship(lazy="selectin")


class UserFeedTopic(Base):
    __tablename__ = "user_feed_topics"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    technology_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("technologies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="feed_topics")
    technology: Mapped["Technology"] = relationship(lazy="selectin")


class UserSector(Base):
    __tablename__ = "user_sectors"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sector_id: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey("sectors.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="sectors")
    sector: Mapped["Sector"] = relationship(lazy="selectin")


class VerificationSession(Base):
    __tablename__ = "verification_sessions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    role_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # numbered by the database trigger; read back after insert, never set here
    attempt_number: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=FetchedValue()
    )
    status: Mapped[VerificationStatus] = mapped_column(
        Enum(
            VerificationStatus,
            name="verification_status",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=VerificationStatus.PENDING,
        nullable=False,
    )
    current_phase: Mapped[VerificationPhase | None] = mapped_column(
        Enum(
            VerificationPhase,
            name="verification_phase",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=True,
    )
    # 'en' or 'fr', set when the attempt starts and never changed; see 015-verification-language.sql
    language: Mapped[str] = mapped_column(Text, default="en", nullable=False)
    analysis_attempts: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[AuthProvider | None] = mapped_column(
        Enum(
            AuthProvider,
            name="auth_provider",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=True,
    )
    evidence: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ai_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    ai_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reviewer_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "role_id"],
            ["user_roles.user_id", "user_roles.role_id"],
            ondelete="RESTRICT",
        ),
    )

    user_role: Mapped["UserRole"] = relationship(back_populates="verification_sessions")
    interview: Mapped["VerificationInterview | None"] = relationship(
        back_populates="verification_session", uselist=False, cascade="all, delete-orphan"
    )


class VerificationInterview(Base):
    __tablename__ = "verification_interviews"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    verification_session_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("verification_sessions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    status: Mapped[InterviewStatus] = mapped_column(
        Enum(
            InterviewStatus,
            name="interview_status",
            create_type=False,
            native_enum=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        default=InterviewStatus.ACTIVE,
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)
    welcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    closing_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    verification_session: Mapped[VerificationSession] = relationship(back_populates="interview")
    turns: Mapped[list["VerificationInterviewTurn"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="VerificationInterviewTurn.sequence",
    )


class VerificationInterviewTurn(Base):
    __tablename__ = "verification_interview_turns"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    interview_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("verification_interviews.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    acknowledgement: Mapped[str | None] = mapped_column(Text, nullable=True)
    security_flags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    interview: Mapped[VerificationInterview] = relationship(back_populates="turns")
