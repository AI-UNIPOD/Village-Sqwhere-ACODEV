import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Body, HTTPException, Path, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, user_to_profile
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

router = APIRouter()

# These stores live in memory, so they are lost on restart and need a single API process.
# See docs/decisions/2026-11-07-sign-in-without-dev-login.md.

# One-time OAuth states from /start: state -> (provider, code_challenge, redirect_uri, expiry)
_OAUTH_STATES: dict[str, tuple[AuthProvider, str, str, datetime]] = {}

# One-time login codes from the callback: code -> (user_id, is_new_user, code_challenge, expiry)
_LOGIN_CODES: dict[str, tuple[UUID, bool, str, datetime]] = {}

# In-memory revocation set for refresh tokens
_REVOKED_REFRESH_TOKENS: set[str] = set()


@router.post("/auth/oauth/{provider}/start", response_model=OAuthStartResponse)
async def start_oauth(
    provider: Annotated[AuthProvider, Path()],
    payload: OAuthStartRequest,
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
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=10)
    _drop_expired(_OAUTH_STATES, now)
    _OAUTH_STATES[state] = (provider, payload.code_challenge, payload.redirect_uri, expires_at)

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


async def fetch_github_user(code: str, redirect_uri: str) -> dict | None:
    """Exchange the OAuth code with GitHub and return the GitHub user, or None if refused."""
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
        return profile_res.json()


def _drop_expired(store: dict, now: datetime) -> None:
    for key in [key for key, value in store.items() if value[-1] < now]:
        del store[key]


def _redirect_with_error(code: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{FRONTEND_URL}/auth/callback?error={code}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/auth/oauth/{provider}/callback")
async def oauth_callback(
    provider: Annotated[AuthProvider, Path()],
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    db: DbSession,
) -> RedirectResponse:
    # The state must be one this server issued in /start, for this provider, and unused.
    pending = _OAUTH_STATES.pop(state, None)
    now = datetime.now(UTC)
    if pending is None or pending[0] != provider or now > pending[3]:
        return _redirect_with_error("INVALID_STATE")
    _, code_challenge, redirect_uri, _ = pending

    is_new = False
    try:
        gh_user = await fetch_github_user(code, redirect_uri)
        if gh_user is None:
            return _redirect_with_error("ACCESS_DENIED")

        provider_user_id = str(gh_user["id"])
        username = gh_user.get("login") or f"gh_{provider_user_id}"
        display_name = gh_user.get("name") or username
        avatar_url = gh_user.get("avatar_url")
        email = gh_user.get("email")

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

            user = User(
                username=username,
                display_name=display_name,
                email=email,
                avatar_url=avatar_url,
            )
            db.add(user)
            await db.flush()

            identity = UserIdentity(
                user_id=user.id,
                provider=AuthProvider.GITHUB,
                provider_user_id=provider_user_id,
                provider_username=username,
            )
            db.add(identity)
            await db.commit()
        else:
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
            if display_name and user.display_name != display_name:
                user.display_name = display_name
            await db.commit()

    except Exception:
        return _redirect_with_error("OAUTH_EXCHANGE_FAILED")

    login_code = f"lc_{secrets.token_urlsafe(32)}"
    _drop_expired(_LOGIN_CODES, now)
    _LOGIN_CODES[login_code] = (user.id, is_new, code_challenge, now + timedelta(minutes=5))

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
        # with the PKCE verifier that matches the challenge sent to /start.
        pending = _LOGIN_CODES.pop(payload.login_code, None)
        if (
            pending is None
            or datetime.now(UTC) > pending[3]
            or not verify_pkce(payload.code_verifier, pending[2])
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "LOGIN_CODE_INVALID",
                    "message": "This sign-in link is invalid, expired or already used. "
                    "Sign in again.",
                },
            )
        user_id, is_new_user, _, _ = pending

        query = (
            select(User)
            .where(User.id == user_id, User.deleted_at.is_(None))
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
                is_new_user=is_new_user,
                user=user_to_profile(user),
            )
        )

    # grant_type == "refresh_token"
    if payload.refresh_token in _REVOKED_REFRESH_TOKENS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "REFRESH_TOKEN_INVALID",
                "message": "Refresh token has been revoked",
            },
        )

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

    # Invalidate previous refresh token (token rotation)
    _REVOKED_REFRESH_TOKENS.add(payload.refresh_token)

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


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest) -> Response:
    _REVOKED_REFRESH_TOKENS.add(payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
