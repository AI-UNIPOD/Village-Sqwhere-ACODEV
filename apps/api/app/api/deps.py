from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.database import get_db
from app.models.users import User, UserFeedTopic, UserRole, UserTechnology
from app.schemas.lookups import TechnologyRef
from app.schemas.users import (
    UserIdentityRef,
    UserProfile,
    UserRoleDetail,
    UserRoleVerification,
)

security_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


def role_to_detail(user_role: UserRole) -> UserRoleDetail:
    sessions = getattr(user_role, "verification_sessions", None) or []
    attempts_used = len(sessions)
    attempts_remaining = max(0, 3 - attempts_used)
    latest_status = (
        (
            sessions[-1].status.value
            if hasattr(sessions[-1].status, "value")
            else str(sessions[-1].status)
        )
        if sessions
        else None
    )

    return UserRoleDetail(
        slug=user_role.role.slug,
        name=user_role.role.name,
        is_primary=user_role.is_primary,
        verified_at=user_role.verified_at,
        verification=UserRoleVerification(
            attempts_used=attempts_used,
            attempts_remaining=attempts_remaining,
            latest_status=latest_status,
        ),
    )


def user_to_profile(user: User) -> UserProfile:
    role_details = [role_to_detail(ur) for ur in user.roles if ur.role is not None]
    technologies = [
        TechnologyRef(slug=ut.technology.slug, name=ut.technology.name)
        for ut in user.technologies
        if ut.technology is not None
    ]
    feed_topics = [
        TechnologyRef(slug=uf.technology.slug, name=uf.technology.name)
        for uf in user.feed_topics
        if uf.technology is not None
    ]
    identities = [
        UserIdentityRef(
            provider=(
                ident.provider.value if hasattr(ident.provider, "value") else str(ident.provider)
            ),
            provider_username=ident.provider_username,
            linked_at=ident.linked_at,
        )
        for ident in user.identities
    ]
    return UserProfile(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        email_verified=user.email_verified_at is not None,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_verified=user.is_verified,
        verified_at=user.verified_at,
        platform_role=(
            user.platform_role.value
            if hasattr(user.platform_role, "value")
            else str(user.platform_role)
        ),
        roles=role_details,
        technologies=technologies,
        feed_topics=feed_topics,
        identities=identities,
        created_at=user.created_at,
    )


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_bearer)],
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "Missing bearer token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Token invalid or expired"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(str(payload["sub"]))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "Invalid token subject"},
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    query = (
        select(User)
        .options(
            selectinload(User.identities),
            selectinload(User.roles).selectinload(UserRole.role),
            selectinload(User.roles).selectinload(UserRole.verification_sessions),
            selectinload(User.technologies).selectinload(UserTechnology.technology),
            selectinload(User.feed_topics).selectinload(UserFeedTopic.technology),
        )
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "User not found or deleted"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
