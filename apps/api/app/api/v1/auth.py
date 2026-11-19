import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Body, HTTPException, Path, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import config
from app.api.deps import DbSession, demo_switched_off, user_to_profile
from app.config import (
    FRONTEND_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_pkce,
)
from app.models.sign_in import LoginCode, OAuthState, RevokedRefreshToken
from app.models.users import AuthProvider, User, UserIdentity
from app.schemas.auth import (
    LogoutRequest,
    OAuthStartData,
    OAuthStartRequest,
    OAuthStartResponse,
    TokenData,
    TokenRequestLoginCode,
    TokenRequestRefresh,
    TokenResponse,
)
from app.services.provider_emails import find_signup_email

router = APIRouter()

# OAuth states, login codes and revoked refresh tokens live in the database, so any API instance
# can finish what another started. See docs/decisions/2026-11-19-sign-in-state-in-postgres.md.

# The shared demo account "Try the demo" signs in as. The demo seed script creates it with this
# id; the made-up developers it creates are demo accounts too, but nobody signs in as them.
DEMO_ACCOUNT_ID = UUID("00000000-0000-4000-8000-00000000de30")


def _sha256(value: str) -> str:
    # A state, a code or a token is stored and looked up only as this hash, so a copy of the
    # tables is not enough to sign in as anyone.
    return hashlib.sha256(value.encode()).hexdigest()


async def _drop_expired(
    db: AsyncSession, table: type[OAuthState | LoginCode | RevokedRefreshToken]
) -> None:
    # No worker clears these tables: each write takes the expired rows out first.
    await db.execute(delete(table).where(table.expires_at <= func.now()))


def _refresh_token_revoked() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "REFRESH_TOKEN_INVALID",
            "message": "Refresh token has been revoked",
        },
    )


async def _revoke(db: AsyncSession, refresh_token: str, claims: dict[str, object]) -> bool:
    """Revoke a refresh token for every instance, until it would have expired anyway.

    False when it was revoked already: of two requests with the same token, one gets True.
    """
    await _drop_expired(db, RevokedRefreshToken)
    inserted = await db.execute(
        pg_insert(RevokedRefreshToken)
        .values(
            token_sha256=_sha256(refresh_token),
            expires_at=datetime.fromtimestamp(claims["exp"], UTC),
        )
        .on_conflict_do_nothing()
        .returning(RevokedRefreshToken.token_sha256)
    )
    newly_revoked = inserted.first() is not None
    await db.commit()
    return newly_revoked


@router.post("/auth/oauth/{provider}/start", response_model=OAuthStartResponse)
async def start_oauth(
    provider: Annotated[AuthProvider, Path()],
    payload: OAuthStartRequest,
    db: DbSession,
) -> OAuthStartResponse:
    # Only GitHub has a real code exchange. Without it there is no safe way to sign in.
    if provider != AuthProvider.GITHUB or not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "PROVIDER_NOT_CONFIGURED",
                "message": f"Sign-in with {provider.value} is not set up on this server yet.",
            },
        )

    state = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=10)
    await _drop_expired(db, OAuthState)
    db.add(
        OAuthState(
            state_sha256=_sha256(state),
            provider=provider,
            code_challenge=payload.code_challenge,
            redirect_uri=payload.redirect_uri,
            expires_at=expires_at,
        )
    )
    await db.commit()

    query = urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": payload.redirect_uri,
            "state": state,
            "scope": "read:user,user:email",
        }
    )
    authorize_url = f"https://github.com/login/oauth/authorize?{query}"

    return OAuthStartResponse(
        data=OAuthStartData(
            authorize_url=authorize_url,
            expires_at=expires_at,
        )
    )


async def fetch_github_user(code: str, redirect_uri: str) -> tuple[dict, str] | None:
    """Exchange the OAuth code with GitHub.

    Returns the GitHub user and the access token, or None if GitHub refused the code.
    """
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={
                "Accept": "application/json",
                "User-Agent": "Village-Sqwhere-API",
            },
            timeout=10.0,
        )
        gh_access_token = token_res.json().get("access_token")
        if not gh_access_token:
            return None

        profile_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {gh_access_token}",
                "User-Agent": "Village-Sqwhere-API",
            },
            timeout=10.0,
        )
        profile_res.raise_for_status()
        return profile_res.json(), gh_access_token


async def email_is_taken(db: AsyncSession, email: str) -> bool:
    # Same rule as the unique index users_email_lower_uq: capital letters do not count, and
    # deleted accounts still hold their email.
    result = await db.execute(select(User.id).where(func.lower(User.email) == email.lower()))
    return result.first() is not None


async def _create_user(
    db: AsyncSession,
    username: str,
    display_name: str,
    avatar_url: str | None,
    email: str | None,
    provider_user_id: str,
) -> User:
    user = User(
        username=username,
        display_name=display_name,
        email=email,
        email_verified_at=datetime.now(UTC) if email else None,
        avatar_url=avatar_url,
    )
    db.add(user)
    await db.flush()
    db.add(
        UserIdentity(
            user_id=user.id,
            provider=AuthProvider.GITHUB,
            provider_user_id=provider_user_id,
            provider_username=username,
        )
    )
    await db.commit()
    return user


def _redirect_with_error(code: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{FRONTEND_URL}/auth/callback?error={code}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/auth/oauth/{provider}/callback")
async def oauth_callback(
    provider: Annotated[AuthProvider, Path()],
    db: DbSession,
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    is_new = False
    try:
        # The state must be one this API issued in /start, for this provider, unused and not
        # expired. One DELETE takes it, so two instances cannot both accept the same state.
        pending = None
        if state:
            taken = await db.execute(
                delete(OAuthState)
                .where(
                    OAuthState.state_sha256 == _sha256(state),
                    OAuthState.expires_at > func.now(),
                )
                .returning(OAuthState.provider, OAuthState.code_challenge, OAuthState.redirect_uri)
            )
            pending = taken.first()
            await db.commit()
        if pending is None or pending.provider != provider:
            return _redirect_with_error("INVALID_STATE")
        # When the person clicks Cancel, GitHub sends error=access_denied and no code.
        if not code:
            return _redirect_with_error("ACCESS_DENIED")

        github_account = await fetch_github_user(code, pending.redirect_uri)
        if github_account is None:
            return _redirect_with_error("ACCESS_DENIED")
        gh_user, gh_access_token = github_account

        provider_user_id = str(gh_user["id"])
        username = gh_user.get("login") or f"gh_{provider_user_id}"
        display_name = gh_user.get("name") or username
        avatar_url = gh_user.get("avatar_url")

        # Upsert user in database
        query = (
            select(User)
            .join(UserIdentity)
            .where(
                UserIdentity.provider == AuthProvider.GITHUB,
                UserIdentity.provider_user_id == provider_user_id,
            )
        )
        res = await db.execute(query)
        user = res.scalar_one_or_none()

        if not user:
            is_new = True
            # Check username collision
            existing = (
                await db.execute(select(User).where(User.username == username))
            ).scalar_one_or_none()
            if existing:
                username = f"{username[:34]}_{secrets.token_hex(2)}"

            # An email is a bonus: whatever goes wrong with it, the person still signs in.
            email = await find_signup_email(provider, gh_access_token)
            if email and await email_is_taken(db, email):
                email = None
            try:
                user = await _create_user(
                    db, username, display_name, avatar_url, email, provider_user_id
                )
            except IntegrityError as exc:
                # Two sign-ups can pass the check above together. The unique index lets one
                # win, and the other is created without the email.
                if email is None or "users_email" not in str(exc.orig):
                    raise
                await db.rollback()
                user = await _create_user(
                    db, username, display_name, avatar_url, None, provider_user_id
                )
        else:
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
            if display_name and user.display_name != display_name:
                user.display_name = display_name
            await db.commit()

        login_code = f"lc_{secrets.token_urlsafe(32)}"
        await _drop_expired(db, LoginCode)
        db.add(
            LoginCode(
                code_sha256=_sha256(login_code),
                user_id=user.id,
                is_new_user=is_new,
                code_challenge=pending.code_challenge,
                expires_at=datetime.now(UTC) + timedelta(minutes=5),
            )
        )
        await db.commit()

    except Exception:
        return _redirect_with_error("OAUTH_EXCHANGE_FAILED")

    redirect_url = f"{FRONTEND_URL}/auth/callback?login_code={login_code}"
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.post("/auth/token", response_model=TokenResponse)
async def exchange_token(
    payload: Annotated[
        TokenRequestLoginCode | TokenRequestRefresh,
        Body(discriminator="grant_type"),
    ],
    db: DbSession,
) -> TokenResponse:
    if payload.grant_type == "login_code":
        # Only a code issued by the OAuth callback works, once, before it expires, and only
        # with the PKCE verifier that matches the challenge sent to /start. One DELETE takes
        # it, so two instances cannot both exchange the same code.
        taken = await db.execute(
            delete(LoginCode)
            .where(
                LoginCode.code_sha256 == _sha256(payload.login_code),
                LoginCode.expires_at > func.now(),
            )
            .returning(LoginCode.user_id, LoginCode.is_new_user, LoginCode.code_challenge)
        )
        pending = taken.first()
        await db.commit()
        if pending is None or not verify_pkce(payload.code_verifier, pending.code_challenge):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "LOGIN_CODE_INVALID",
                    "message": "This sign-in link is invalid, expired or already used. "
                    "Sign in again.",
                },
            )
        query = (
            select(User)
            .where(User.id == pending.user_id, User.deleted_at.is_(None))
            .options(
                selectinload(User.identities),
                selectinload(User.roles),
                selectinload(User.technologies),
                selectinload(User.feed_topics),
            )
        )
        res = await db.execute(query)
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "LOGIN_CODE_INVALID", "message": "User not found or deleted"},
            )

        access_token = create_access_token(user.id)
        refresh_token, refresh_expires_at = create_refresh_token(user.id)

        return TokenResponse(
            data=TokenData(
                access_token=access_token,
                token_type="Bearer",
                expires_in=900,
                refresh_token=refresh_token,
                refresh_expires_at=refresh_expires_at,
                is_new_user=pending.is_new_user,
                user=user_to_profile(user),
            )
        )

    # grant_type == "refresh_token"
    revoked = await db.scalar(
        select(RevokedRefreshToken.token_sha256).where(
            RevokedRefreshToken.token_sha256 == _sha256(payload.refresh_token)
        )
    )
    if revoked:
        raise _refresh_token_revoked()

    decoded_payload = decode_refresh_token(payload.refresh_token)
    if not decoded_payload or "sub" not in decoded_payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "REFRESH_TOKEN_INVALID",
                "message": "Invalid or expired refresh token",
            },
        )

    try:
        user_uuid = UUID(str(decoded_payload["sub"]))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "REFRESH_TOKEN_INVALID",
                "message": "Malformed token subject",
            },
        ) from None

    user_query = (
        select(User)
        .where(User.id == user_uuid, User.deleted_at.is_(None))
        .options(
            selectinload(User.identities),
            selectinload(User.roles),
            selectinload(User.technologies),
            selectinload(User.feed_topics),
        )
    )
    user_res = await db.execute(user_query)
    existing_user = user_res.scalar_one_or_none()

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "REFRESH_TOKEN_INVALID",
                "message": "User not found or deleted",
            },
        )
    if existing_user.is_demo and not config.DEMO_ENABLED:
        raise demo_switched_off()

    # Invalidate previous refresh token (token rotation). When two requests bring the same
    # token, only the one that revokes it gets a new pair.
    if not await _revoke(db, payload.refresh_token, decoded_payload):
        raise _refresh_token_revoked()

    # Issue rotated token pair
    new_access_token = create_access_token(existing_user.id)
    new_refresh_token, new_refresh_expires = create_refresh_token(existing_user.id)

    return TokenResponse(
        data=TokenData(
            access_token=new_access_token,
            token_type="Bearer",
            expires_in=900,
            refresh_token=new_refresh_token,
            refresh_expires_at=new_refresh_expires,
            is_new_user=False,
            user=user_to_profile(existing_user),
        )
    )


@router.post("/auth/demo", response_model=TokenResponse)
async def demo_sign_in(db: DbSession) -> TokenResponse:
    """Signs in as the shared, read-only demo account. No GitHub and no body: the demo is for
    looking around before signing up. Refresh and sign-out work as for any account."""
    demo = None
    if config.DEMO_ENABLED:
        demo = await db.scalar(
            select(User).where(User.id == DEMO_ACCOUNT_ID, User.is_demo, User.deleted_at.is_(None))
        )
    if demo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEMO_UNAVAILABLE", "message": "The demo is not available here."},
        )

    access_token = create_access_token(demo.id)
    refresh_token, refresh_expires_at = create_refresh_token(demo.id)
    return TokenResponse(
        data=TokenData(
            access_token=access_token,
            token_type="Bearer",
            expires_in=900,
            refresh_token=refresh_token,
            refresh_expires_at=refresh_expires_at,
            is_new_user=False,
            user=user_to_profile(demo),
        )
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: DbSession) -> Response:
    # Anyone can call this, so only a token this API signed and that has not expired is kept:
    # nothing else could ever be used, and made-up values must not fill the table.
    claims = decode_refresh_token(payload.refresh_token)
    if claims:
        await _revoke(db, payload.refresh_token, claims)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
