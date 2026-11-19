"""Sign-in state every API instance shares: infra/db/init/029-sign-in-state.sql.

Each row is found by the SHA-256 of a state, a code or a token. The value itself is never
stored. Why: docs/decisions/2026-11-19-sign-in-state-in-postgres.md
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.lookups import Base
from app.models.users import AuthProvider


class OAuthState(Base):
    """A one-time state from /auth/oauth/{provider}/start, until GitHub sends it back."""

    __tablename__ = "oauth_states"

    state_sha256: Mapped[str] = mapped_column(Text, primary_key=True)
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
    code_challenge: Mapped[str] = mapped_column(Text, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LoginCode(Base):
    """A one-time login code from the OAuth callback, until /auth/token exchanges it."""

    __tablename__ = "login_codes"

    code_sha256: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_new_user: Mapped[bool] = mapped_column(Boolean, nullable=False)
    code_challenge: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RevokedRefreshToken(Base):
    """A refresh token that was signed out or rotated, until it would have expired anyway."""

    __tablename__ = "revoked_refresh_tokens"

    token_sha256: Mapped[str] = mapped_column(Text, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
