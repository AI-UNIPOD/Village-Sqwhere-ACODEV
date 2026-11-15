from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Path, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, role_to_detail, user_to_profile
from app.models.lookups import Role, Sector, Technology
from app.models.users import User, UserFeedTopic, UserRole, UserSector, UserTechnology
from app.schemas.lookups import SectorRef, TechnologyRef
from app.schemas.users import (
    ClaimRoleRequest,
    DeleteAccountRequest,
    MeResponse,
    ReplaceFeedTopicsRequest,
    ReplaceSectorsRequest,
    ReplaceTechnologiesRequest,
    SectorsResponse,
    TechnologiesResponse,
    UpdateRoleRequest,
    UserProfileUpdate,
    UserRoleResponse,
)
from app.services.account_deletion import delete_account, hubs_with_a_team, lock_hubs

router = APIRouter()


async def lock_own_lists(db: AsyncSession, user: User) -> None:
    """Replacing a list deletes the old rows, then inserts the new ones. Two replacements at
    once would both insert the same rows and one would fail, so they wait on the user's row
    and run one after the other. The last one wins."""
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())


@router.get("/me", response_model=MeResponse)
async def get_my_profile(current_user: CurrentUser) -> MeResponse:
    return MeResponse(data=user_to_profile(current_user))


@router.patch("/me", response_model=MeResponse)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> MeResponse:
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    if payload.bio is not None:
        current_user.bio = payload.bio
    if "country_code" in payload.model_fields_set:
        current_user.country_code = payload.country_code
    if payload.onboarding_completed and current_user.onboarding_completed_at is None:
        # the first time counts; a repeat keeps it, so the web can send it on every finish
        current_user.onboarding_completed_at = datetime.now(UTC)
    if payload.email is not None and payload.email != current_user.email:
        current_user.email = payload.email
        # The new address has not been verified yet.
        current_user.email_verified_at = None

    try:
        await db.commit()
    except IntegrityError:
        # The input is already checked against the table's CHECK constraints, so the one
        # rule left to break is the unique email.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "EMAIL_TAKEN",
                "message": "Another account already uses this email. Use a different one.",
            },
        ) from None
    await db.refresh(current_user)
    return MeResponse(data=user_to_profile(current_user))


@router.post("/me/deletion", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    payload: DeleteAccountRequest, current_user: CurrentUser, db: DbSession
) -> Response:
    if payload.username.lower() != current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "CONFIRMATION_MISMATCH",
                "message": "Type your username exactly to confirm that you want to delete "
                "your account.",
            },
        )
    await lock_hubs(db, current_user)
    await lock_own_lists(db, current_user)
    teams = await hubs_with_a_team(db, current_user)
    if teams:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OWNS_HUB_WITH_TEAM",
                "message": f"You own {teams} hub(s) that other members are still in. Your "
                "account can be deleted once nobody else is in them.",
            },
        )
    await delete_account(db, current_user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/roles", response_model=UserRoleResponse, status_code=status.HTTP_201_CREATED)
async def claim_role(
    payload: ClaimRoleRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> UserRoleResponse:
    # 1. Lookup role by slug
    result = await db.execute(select(Role).where(Role.slug == payload.role))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "UNKNOWN_SLUG", "message": f"Unknown role slug: '{payload.role}'"},
        )

    # 2. Check if already claimed
    result = await db.execute(
        select(UserRole).where(
            UserRole.user_id == current_user.id,
            UserRole.role_id == role.id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ROLE_ALREADY_CLAIMED", "message": "You already have this role."},
        )

    # 3. If primary, clear is_primary on existing roles for this user
    if payload.is_primary:
        await db.execute(
            update(UserRole).where(UserRole.user_id == current_user.id).values(is_primary=False)
        )

    # 4. Insert new UserRole
    user_role = UserRole(
        user_id=current_user.id,
        role_id=role.id,
        is_primary=payload.is_primary,
    )
    db.add(user_role)
    await db.commit()

    # Re-fetch user_role with relationships loaded
    result = await db.execute(
        select(UserRole)
        .options(
            selectinload(UserRole.role),
            selectinload(UserRole.verification_sessions),
        )
        .where(UserRole.user_id == current_user.id, UserRole.role_id == role.id)
    )
    user_role = result.scalar_one()

    return UserRoleResponse(data=role_to_detail(user_role))


@router.patch("/me/roles/{role_slug}", response_model=UserRoleResponse)
async def make_role_primary(
    payload: UpdateRoleRequest,
    current_user: CurrentUser,
    db: DbSession,
    role_slug: str = Path(..., description="Role slug to make primary"),
) -> UserRoleResponse:
    if not payload.is_primary:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "VALIDATION_FAILED", "message": "is_primary must be true"},
        )

    result = await db.execute(
        select(UserRole)
        .join(Role, UserRole.role_id == Role.id)
        .options(
            selectinload(UserRole.role),
            selectinload(UserRole.verification_sessions),
        )
        .where(UserRole.user_id == current_user.id, Role.slug == role_slug)
    )
    user_role = result.scalar_one_or_none()
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Role '{role_slug}' is not claimed."},
        )

    # Clear is_primary on all other roles
    await db.execute(
        update(UserRole).where(UserRole.user_id == current_user.id).values(is_primary=False)
    )

    user_role.is_primary = True
    await db.commit()
    await db.refresh(user_role)

    return UserRoleResponse(data=role_to_detail(user_role))


@router.delete("/me/roles/{role_slug}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_role(
    current_user: CurrentUser,
    db: DbSession,
    role_slug: str = Path(..., description="Role slug to remove"),
) -> Response:
    result = await db.execute(
        select(UserRole)
        .join(Role, UserRole.role_id == Role.id)
        .options(
            selectinload(UserRole.role),
            selectinload(UserRole.verification_sessions),
        )
        .where(UserRole.user_id == current_user.id, Role.slug == role_slug)
    )
    user_role = result.scalar_one_or_none()
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Role '{role_slug}' is not claimed."},
        )

    if user_role.verification_sessions and len(user_role.verification_sessions) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ROLE_HAS_VERIFICATION_HISTORY",
                "message": (
                    "A role with verification attempts can't be removed (it would reset "
                    "the 3-attempt limit)."
                ),
            },
        )

    await db.delete(user_role)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/me/technologies", response_model=TechnologiesResponse)
async def replace_technologies(
    payload: ReplaceTechnologiesRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TechnologiesResponse:
    slugs = payload.technologies
    if len(slugs) != len(set(slugs)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_FAILED",
                "message": "Duplicate technologies are not allowed.",
            },
        )

    matched_technologies: list[Technology] = []
    if slugs:
        result = await db.execute(select(Technology).where(Technology.slug.in_(slugs)))
        matched_technologies = list(result.scalars().all())
        found_slugs = {t.slug for t in matched_technologies}
        missing_slugs = [s for s in slugs if s not in found_slugs]
        if missing_slugs:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "UNKNOWN_SLUG",
                    "message": f"Unknown technology slugs: {', '.join(missing_slugs)}",
                },
            )

    tech_map = {t.slug: t for t in matched_technologies}

    await lock_own_lists(db, current_user)
    await db.execute(delete(UserTechnology).where(UserTechnology.user_id == current_user.id))

    for slug in slugs:
        db.add(UserTechnology(user_id=current_user.id, technology_id=tech_map[slug].id))

    await db.commit()

    return TechnologiesResponse(
        data=[TechnologyRef(slug=tech_map[s].slug, name=tech_map[s].name) for s in slugs]
    )


@router.put("/me/feed-topics", response_model=TechnologiesResponse)
async def replace_feed_topics(
    payload: ReplaceFeedTopicsRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TechnologiesResponse:
    slugs = payload.technologies
    if len(slugs) != len(set(slugs)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "VALIDATION_FAILED",
                "message": "Duplicate topics are not allowed.",
            },
        )

    matched_technologies: list[Technology] = []
    if slugs:
        result = await db.execute(select(Technology).where(Technology.slug.in_(slugs)))
        matched_technologies = list(result.scalars().all())
        found_slugs = {t.slug for t in matched_technologies}
        missing_slugs = [s for s in slugs if s not in found_slugs]
        if missing_slugs:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "code": "UNKNOWN_SLUG",
                    "message": f"Unknown technology slugs: {', '.join(missing_slugs)}",
                },
            )

    tech_map = {t.slug: t for t in matched_technologies}

    await lock_own_lists(db, current_user)
    await db.execute(delete(UserFeedTopic).where(UserFeedTopic.user_id == current_user.id))

    for slug in slugs:
        db.add(UserFeedTopic(user_id=current_user.id, technology_id=tech_map[slug].id))

    await db.commit()

    return TechnologiesResponse(
        data=[TechnologyRef(slug=tech_map[s].slug, name=tech_map[s].name) for s in slugs]
    )


@router.put("/me/sectors", response_model=SectorsResponse)
async def replace_sectors(
    payload: ReplaceSectorsRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SectorsResponse:
    slugs = payload.sectors
    if len(slugs) != len(set(slugs)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "VALIDATION_FAILED", "message": "Duplicate sectors are not allowed."},
        )
    sectors = {
        sector.slug: sector
        for sector in await db.scalars(
            select(Sector).where(Sector.slug.in_(slugs), Sector.is_active.is_(True))
        )
    }
    missing = [slug for slug in slugs if slug not in sectors]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "UNKNOWN_SLUG",
                "message": f"Unknown sector slugs: {', '.join(missing)}",
            },
        )

    await lock_own_lists(db, current_user)
    await db.execute(delete(UserSector).where(UserSector.user_id == current_user.id))
    db.add_all(UserSector(user_id=current_user.id, sector_id=sectors[slug].id) for slug in slugs)
    await db.commit()

    return SectorsResponse(data=[SectorRef.model_validate(sectors[slug]) for slug in slugs])
