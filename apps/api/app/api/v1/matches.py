"""Match open ideas with developers by verified roles, then by shared technologies.

Matching reads only an idea's public card and the roles it needs. Ideas are loaded with
`details` set to raise, so no code path here can read or return the confidential brief.
"""

from collections import defaultdict
from collections.abc import Iterable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import defer, raiseload, selectinload

from app.api.deps import CurrentUser, DbSession, same_world
from app.api.v1.ideas import get_owned_idea, idea_error, idea_options, public_idea
from app.models import (
    Hub,
    HubMember,
    HubMemberStatus,
    Idea,
    IdeaRoleNeed,
    IdeaStatus,
    Technology,
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

# A membership that still binds: the person is asking, invited or in the team.
LIVE_STATUSES = (HubMemberStatus.REQUESTED, HubMemberStatus.INVITED, HubMemberStatus.ACTIVE)


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
    # loaded once, then used for the order and to name the shared technologies on each card
    author_technologies = set(
        await db.scalars(
            select(UserTechnology.technology_id).where(UserTechnology.user_id == idea.author_id)
        )
    )
    shared = (
        select(UserTechnology.user_id, func.count().label("shared_count"))
        .where(UserTechnology.technology_id.in_(author_technologies))
        .group_by(UserTechnology.user_id)
        .subquery()
    )
    shared_count = func.coalesce(shared.c.shared_count, 0)
    # anyone asking, invited or in this idea's hub is already known; after a no, a leave or a
    # removal they may be suggested again (asking again still waits out any cool-down)
    connected = (
        select(HubMember.user_id)
        .join(Hub, Hub.id == HubMember.hub_id)
        .where(Hub.idea_id == idea.id, HubMember.status.in_(LIVE_STATUSES))
    )
    result = await db.execute(
        select(User)
        .join(verified, verified.c.user_id == User.id)
        .outerjoin(shared, shared.c.user_id == User.id)
        .options(
            selectinload(User.roles),
            selectinload(User.technologies),
            raiseload(User.identities),
            raiseload(User.feed_topics),
            raiseload(User.sectors),
        )
        .where(
            User.deleted_at.is_(None),
            User.id != idea.author_id,
            User.id.not_in(connected),
            same_world(User.id, current_user),
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
    users = list(result.scalars().all())
    has_more = len(users) > limit
    return DeveloperMatchesResponse(
        data=[matched_developer(user, needed, author_technologies) for user in users[:limit]],
        next_offset=offset + limit if has_more else None,
    )


def sorted_technologies(technologies: Iterable[Technology]) -> list[TechnologyRef]:
    return sorted(
        (TechnologyRef.model_validate(technology) for technology in technologies),
        key=lambda technology: technology.name.lower(),
    )


def matched_developer(
    user: User, needed: set[int], author_technologies: set[int]
) -> MatchedDeveloper:
    matched = sorted(
        (held for held in user.roles if held.role_id in needed and held.verified_at is not None),
        key=lambda held: held.role_id,
    )
    shared = sorted_technologies(
        held.technology for held in user.technologies if held.technology_id in author_technologies
    )
    return MatchedDeveloper(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        matched_roles=[RoleRef.model_validate(held.role) for held in matched],
        technologies=sorted_technologies(held.technology for held in user.technologies),
        shared_technologies=shared,
        shared_technology_count=len(shared),
        country_code=user.country_code,
    )


async def technologies_shared_with_authors(
    db: DbSession, user_id: UUID, author_ids: set[UUID]
) -> dict[UUID, list[TechnologyRef]]:
    """One query for a whole page: the caller's technologies that each author also has."""
    mine = select(UserTechnology.technology_id).where(UserTechnology.user_id == user_id)
    result = await db.execute(
        select(UserTechnology.user_id, Technology)
        .join(Technology, Technology.id == UserTechnology.technology_id)
        .where(UserTechnology.user_id.in_(author_ids), UserTechnology.technology_id.in_(mine))
    )
    found: defaultdict[UUID, list[Technology]] = defaultdict(list)
    for author_id, technology in result:
        found[author_id].append(technology)
    return {author_id: sorted_technologies(held) for author_id, held in found.items()}


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
    # ideas whose hub I am asking to join, invited to or in
    connected = (
        select(Hub.idea_id)
        .join(HubMember, HubMember.hub_id == Hub.id)
        .where(HubMember.user_id == current_user.id, HubMember.status.in_(LIVE_STATUSES))
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
            same_world(Idea.author_id, current_user),
        )
        .order_by(needing_me.c.role_count.desc(), Idea.published_at.desc(), Idea.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    ideas = list(result.scalars().unique().all())
    has_more = len(ideas) > limit
    page = ideas[:limit]
    shared = await technologies_shared_with_authors(
        db, current_user.id, {idea.author_id for idea in page}
    )
    return IdeaMatchesResponse(
        data=[
            IdeaMatch(
                idea=public_idea(idea),
                matched_roles=[
                    RoleRef.model_validate(need.role)
                    for need in idea.roles_needed
                    if need.role_id in mine
                ],
                shared_technologies=shared.get(idea.author_id, []),
            )
            for idea in page
        ],
        next_offset=offset + limit if has_more else None,
    )
