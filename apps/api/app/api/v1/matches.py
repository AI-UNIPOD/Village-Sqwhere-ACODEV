"""Match open ideas with developers by verified roles, then by shared technologies.

Matching reads only an idea's public card and the roles it needs. Ideas are loaded with
`details` set to raise, so no code path here can read or return the confidential brief.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import defer, raiseload, selectinload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.ideas import get_owned_idea, idea_error, idea_options, public_idea
from app.models import (
    Hub,
    HubMember,
    Idea,
    IdeaRoleNeed,
    IdeaStatus,
    User,
    UserRole,
    UserTechnology,
)
from app.schemas.lookups import RoleRef, TechnologyRef
from app.schemas.matches import (
    DeveloperMatchesResponse,
    IdeaMatch,
    IdeaMatchesResponse,
    MatchedDeveloper,
)

router = APIRouter()

Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=50)]


@router.get("/me/ideas/{idea_id}/matches", response_model=DeveloperMatchesResponse)
async def match_developers_to_my_idea(
    idea_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: Offset = 0,
    limit: Limit = 20,
) -> DeveloperMatchesResponse:
    idea = await get_owned_idea(idea_id, current_user.id, db)
    if idea.status != IdeaStatus.OPEN:
        raise idea_error(
            status.HTTP_409_CONFLICT,
            "IDEA_NOT_OPEN",
            "Publish the idea to see developers who match it.",
        )
    needed = {need.role_id for need in idea.roles_needed if need.role.is_active}
    if not needed:
        return DeveloperMatchesResponse(data=[])

    verified = (
        select(
            UserRole.user_id,
            func.count().label("role_count"),
            func.min(UserRole.verified_at).label("first_verified_at"),
        )
        .where(UserRole.role_id.in_(needed), UserRole.verified_at.is_not(None))
        .group_by(UserRole.user_id)
        .subquery()
    )
    author_technologies = select(UserTechnology.technology_id).where(
        UserTechnology.user_id == idea.author_id
    )
    shared = (
        select(UserTechnology.user_id, func.count().label("shared_count"))
        .where(UserTechnology.technology_id.in_(author_technologies))
        .group_by(UserTechnology.user_id)
        .subquery()
    )
    shared_count = func.coalesce(shared.c.shared_count, 0)
    # anyone with a membership row in this idea's hub, in any status, is already known
    connected = (
        select(HubMember.user_id)
        .join(Hub, Hub.id == HubMember.hub_id)
        .where(Hub.idea_id == idea.id)
    )
    result = await db.execute(
        select(User, shared_count)
        .join(verified, verified.c.user_id == User.id)
        .outerjoin(shared, shared.c.user_id == User.id)
        .options(
            selectinload(User.roles),
            selectinload(User.technologies),
            raiseload(User.identities),
            raiseload(User.feed_topics),
        )
        .where(
            User.deleted_at.is_(None),
            User.id != idea.author_id,
            User.id.not_in(connected),
        )
        .order_by(
            verified.c.role_count.desc(),
            shared_count.desc(),
            verified.c.first_verified_at,
            User.id,
        )
        .offset(offset)
        .limit(limit + 1)
    )
    rows = result.all()
    has_more = len(rows) > limit
    return DeveloperMatchesResponse(
        data=[matched_developer(user, needed, count) for user, count in rows[:limit]],
        next_offset=offset + limit if has_more else None,
    )


def matched_developer(user: User, needed: set[int], shared_count: int) -> MatchedDeveloper:
    matched = sorted(
        (held for held in user.roles if held.role_id in needed and held.verified_at is not None),
        key=lambda held: held.role_id,
    )
    return MatchedDeveloper(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        matched_roles=[RoleRef.model_validate(held.role) for held in matched],
        technologies=sorted(
            (TechnologyRef.model_validate(held.technology) for held in user.technologies),
            key=lambda technology: technology.name.lower(),
        ),
        shared_technology_count=shared_count,
    )


@router.get("/me/matches", response_model=IdeaMatchesResponse)
async def match_ideas_to_me(
    current_user: CurrentUser,
    db: DbSession,
    offset: Offset = 0,
    limit: Limit = 20,
) -> IdeaMatchesResponse:
    mine = {
        held.role_id
        for held in current_user.roles
        if held.verified_at is not None and held.role.is_active
    }
    if not mine:
        return IdeaMatchesResponse(data=[])

    needing_me = (
        select(IdeaRoleNeed.idea_id, func.count().label("role_count"))
        .where(IdeaRoleNeed.role_id.in_(mine))
        .group_by(IdeaRoleNeed.idea_id)
        .subquery()
    )
    # ideas whose hub I already have a membership row in, in any status
    connected = (
        select(Hub.idea_id)
        .join(HubMember, HubMember.hub_id == Hub.id)
        .where(HubMember.user_id == current_user.id)
    )
    result = await db.execute(
        select(Idea)
        .join(needing_me, needing_me.c.idea_id == Idea.id)
        .options(*idea_options(), defer(Idea.details, raiseload=True))
        .where(
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            Idea.author_id != current_user.id,
            Idea.id.not_in(connected),
        )
        .order_by(needing_me.c.role_count.desc(), Idea.published_at.desc(), Idea.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    ideas = list(result.scalars().unique().all())
    has_more = len(ideas) > limit
    return IdeaMatchesResponse(
        data=[
            IdeaMatch(
                idea=public_idea(idea),
                matched_roles=[
                    RoleRef.model_validate(need.role)
                    for need in idea.roles_needed
                    if need.role_id in mine
                ],
            )
            for idea in ideas[:limit]
        ],
        next_offset=offset + limit if has_more else None,
    )
