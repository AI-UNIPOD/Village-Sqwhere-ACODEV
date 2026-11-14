"""Another developer's profile, for any signed-in developer. It shows what a match card shows,
plus the bio. Why: docs/decisions/2026-11-14-public-profile.md
"""

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, same_world
from app.api.v1.hubs import hub_error
from app.models.users import User, UserRole, UserSector, UserTechnology
from app.schemas.lookups import RoleRef, SectorRef, TechnologyRef
from app.schemas.users import PublicProfile, PublicProfileResponse

router = APIRouter()


@router.get("/users/{username}", response_model=PublicProfileResponse)
async def get_profile(
    username: str, current_user: CurrentUser, db: DbSession
) -> PublicProfileResponse:
    user = await db.scalar(
        select(User)
        .options(
            selectinload(User.roles).selectinload(UserRole.role),
            selectinload(User.technologies).selectinload(UserTechnology.technology),
            selectinload(User.sectors).selectinload(UserSector.sector),
        )
        # usernames are unique without regard to capital letters (users_username_lower_uq)
        .where(
            func.lower(User.username) == username.lower(),
            User.deleted_at.is_(None),
            same_world(User.id, current_user),
        )
    )
    if user is None:
        raise hub_error(
            status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "No developer has this username."
        )
    verified = sorted(
        (held for held in user.roles if held.verified_at is not None and held.role.is_active),
        key=lambda held: held.verified_at,
    )
    return PublicProfileResponse(
        data=PublicProfile(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            bio=user.bio,
            country_code=user.country_code,
            is_verified=user.is_verified,
            verified_roles=[RoleRef.model_validate(held.role) for held in verified],
            technologies=[
                TechnologyRef.model_validate(held.technology)
                for held in user.technologies
                if held.technology is not None
            ],
            sectors=[SectorRef.model_validate(held.sector) for held in user.sectors],
        )
    )
