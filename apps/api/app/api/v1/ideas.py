"""Draft, publish and close ideas without exposing a confidential brief to non-owners."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, same_world
from app.models import Idea, IdeaRoleNeed, IdeaStatus, Role
from app.schemas.ideas import (
    CreateIdeaRequest,
    IdeaAuthor,
    IdeaResponse,
    MyIdeasResponse,
    OwnedIdea,
    OwnedIdeaCard,
    PublicIdea,
    PublicIdeaResponse,
    PublicIdeasResponse,
    UpdateIdeaRequest,
)
from app.schemas.lookups import RoleRef

router = APIRouter()


def idea_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def idea_options():
    return [
        selectinload(Idea.author),
        selectinload(Idea.roles_needed).selectinload(IdeaRoleNeed.role),
    ]


def roles_for_response(idea: Idea) -> list[RoleRef]:
    return [RoleRef.model_validate(needed.role) for needed in idea.roles_needed]


def owned_card(idea: Idea) -> OwnedIdeaCard:
    return OwnedIdeaCard(
        id=idea.id,
        title=idea.title,
        summary=idea.summary,
        stage=idea.stage,
        status=idea.status,
        roles_needed=roles_for_response(idea),
        published_at=idea.published_at,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
    )


def owned_idea(idea: Idea) -> OwnedIdea:
    return OwnedIdea(**owned_card(idea).model_dump(), details=idea.details)


def public_idea(idea: Idea) -> PublicIdea:
    # This function is only used after the query has restricted the idea to open status.
    if idea.published_at is None:
        raise ValueError("Open ideas must have a publication time.")
    return PublicIdea(
        id=idea.id,
        title=idea.title,
        summary=idea.summary,
        stage=idea.stage,
        status=idea.status,
        roles_needed=roles_for_response(idea),
        author=IdeaAuthor.model_validate(idea.author),
        hub_id=idea.hub_id,
        published_at=idea.published_at,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
    )


async def find_roles(db: AsyncSession, slugs: list[str]) -> list[Role]:
    if not slugs:
        return []
    result = await db.execute(select(Role).where(Role.slug.in_(slugs), Role.is_active.is_(True)))
    roles_by_slug = {role.slug: role for role in result.scalars()}
    unknown = [slug for slug in slugs if slug not in roles_by_slug]
    if unknown:
        raise idea_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "UNKNOWN_ROLE",
            f"Unknown or inactive role slugs: {', '.join(unknown)}.",
        )
    return [roles_by_slug[slug] for slug in slugs]


async def get_owned_idea(idea_id: UUID, user_id: UUID, db: AsyncSession) -> Idea:
    result = await db.execute(
        select(Idea)
        .options(*idea_options())
        .where(Idea.id == idea_id, Idea.author_id == user_id, Idea.deleted_at.is_(None))
    )
    idea = result.scalar_one_or_none()
    if idea is None:
        raise idea_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Idea not found.")
    return idea


@router.post("/me/ideas", response_model=IdeaResponse, status_code=status.HTTP_201_CREATED)
async def create_idea(
    payload: CreateIdeaRequest, current_user: CurrentUser, db: DbSession
) -> IdeaResponse:
    roles = await find_roles(db, payload.roles_needed)
    idea = Idea(
        author_id=current_user.id,
        title=payload.title,
        summary=payload.summary,
        details=payload.details,
        stage=payload.stage,
        roles_needed=[IdeaRoleNeed(role=role) for role in roles],
    )
    db.add(idea)
    await db.commit()
    await db.refresh(idea, ["roles_needed"])
    for required_role in idea.roles_needed:
        await db.refresh(required_role, ["role"])
    return IdeaResponse(data=owned_idea(idea))


@router.get("/me/ideas", response_model=MyIdeasResponse)
async def list_my_ideas(
    current_user: CurrentUser,
    db: DbSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> MyIdeasResponse:
    result = await db.execute(
        select(Idea)
        .options(*idea_options())
        .where(Idea.author_id == current_user.id, Idea.deleted_at.is_(None))
        .order_by(Idea.created_at.desc(), Idea.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    ideas = list(result.scalars().unique().all())
    has_more = len(ideas) > limit
    return MyIdeasResponse(
        data=[owned_card(idea) for idea in ideas[:limit]],
        next_offset=offset + limit if has_more else None,
    )


@router.get("/me/ideas/{idea_id}", response_model=IdeaResponse)
async def get_my_idea(idea_id: UUID, current_user: CurrentUser, db: DbSession) -> IdeaResponse:
    return IdeaResponse(data=owned_idea(await get_owned_idea(idea_id, current_user.id, db)))


@router.patch("/me/ideas/{idea_id}", response_model=IdeaResponse)
async def update_idea(
    payload: UpdateIdeaRequest, idea_id: UUID, current_user: CurrentUser, db: DbSession
) -> IdeaResponse:
    idea = await get_owned_idea(idea_id, current_user.id, db)
    changed = payload.model_fields_set
    for field in ("title", "summary", "details", "stage"):
        if field in changed:
            setattr(idea, field, getattr(payload, field))
    if "roles_needed" in changed:
        roles = await find_roles(db, payload.roles_needed or [])
        idea.roles_needed = [IdeaRoleNeed(role=role) for role in roles]
    await db.commit()
    await db.refresh(idea, ["roles_needed"])
    for required_role in idea.roles_needed:
        await db.refresh(required_role, ["role"])
    return IdeaResponse(data=owned_idea(idea))


@router.post("/me/ideas/{idea_id}/publish", response_model=IdeaResponse)
async def publish_idea(idea_id: UUID, current_user: CurrentUser, db: DbSession) -> IdeaResponse:
    idea = await get_owned_idea(idea_id, current_user.id, db)
    if idea.status != IdeaStatus.DRAFT:
        raise idea_error(
            status.HTTP_409_CONFLICT,
            "IDEA_NOT_DRAFT",
            "Only a draft idea can be published.",
        )
    idea.status = IdeaStatus.OPEN
    idea.published_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(idea)
    return IdeaResponse(data=owned_idea(idea))


@router.post("/me/ideas/{idea_id}/close", response_model=IdeaResponse)
async def close_idea(idea_id: UUID, current_user: CurrentUser, db: DbSession) -> IdeaResponse:
    idea = await get_owned_idea(idea_id, current_user.id, db)
    if idea.status != IdeaStatus.OPEN:
        raise idea_error(
            status.HTTP_409_CONFLICT,
            "IDEA_NOT_OPEN",
            "Only an open idea can be closed.",
        )
    idea.status = IdeaStatus.CLOSED
    await db.commit()
    await db.refresh(idea)
    return IdeaResponse(data=owned_idea(idea))


@router.get("/ideas", response_model=PublicIdeasResponse)
async def list_open_ideas(
    current_user: CurrentUser,
    db: DbSession,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> PublicIdeasResponse:
    result = await db.execute(
        select(Idea)
        .options(*idea_options())
        .where(
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            same_world(Idea.author_id, current_user),
        )
        .order_by(Idea.published_at.desc(), Idea.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    ideas = list(result.scalars().unique().all())
    has_more = len(ideas) > limit
    return PublicIdeasResponse(
        data=[public_idea(idea) for idea in ideas[:limit]],
        next_offset=offset + limit if has_more else None,
    )


@router.get("/ideas/{idea_id}", response_model=PublicIdeaResponse)
async def get_open_idea(
    idea_id: UUID, current_user: CurrentUser, db: DbSession
) -> PublicIdeaResponse:
    result = await db.execute(
        select(Idea)
        .options(*idea_options())
        .where(
            Idea.id == idea_id,
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            same_world(Idea.author_id, current_user),
        )
    )
    idea = result.scalar_one_or_none()
    if idea is None:
        raise idea_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Idea not found.")
    return PublicIdeaResponse(data=public_idea(idea))
