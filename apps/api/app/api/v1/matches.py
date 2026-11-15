"""Match open ideas with developers by verified roles, scored out of 100.

Matching reads only an idea's public card and the roles it needs. Ideas are loaded with
`details` set to raise, so no code path here can read or return the confidential brief.
"""

from collections import defaultdict
from collections.abc import Iterable
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import ColumnElement, Integer, case, cast, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import aliased, defer, raiseload, selectinload

from app.api.deps import CurrentUser, DbSession, same_world
from app.api.v1.ideas import get_owned_idea, idea_error, idea_options, public_idea
from app.models import (
    Hub,
    HubMember,
    HubMemberStatus,
    Idea,
    IdeaEmbedding,
    IdeaRoleNeed,
    IdeaStatus,
    Sector,
    Technology,
    User,
    UserEmbedding,
    UserRole,
    UserSector,
    UserTechnology,
)
from app.schemas.lookups import RoleRef, SectorRef, TechnologyRef
from app.schemas.matches import (
    DeveloperMatchesResponse,
    IdeaMatch,
    IdeaMatchesResponse,
    MatchedDeveloper,
    SimilarIdea,
)
from app.services.match_score import (
    AVAILABLE_MAX,
    MANY_ROLES_POINTS,
    MEANING_BAND,
    MEANING_FLOOR,
    MEANING_MAX,
    ONE_ROLE_POINTS,
    SECTOR_CAP,
    SECTOR_POINTS,
    SIMILAR_FROM,
    TECHNOLOGY_CAP,
    TECHNOLOGY_POINTS,
    match_score,
    similarity,
)

router = APIRouter()

Offset = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=50)]

# A membership that still binds: the person is asking, invited or in the team.
LIVE_STATUSES = (HubMemberStatus.REQUESTED, HubMemberStatus.INVITED, HubMemberStatus.ACTIVE)


def meaning_points_sql(read_alike: Any) -> Any:
    """`meaning_points` in SQL, step for step on double precision numbers. `floor(x + 0.5)`
    rounds half up exactly as Python does, so the two give the same whole number."""
    position = func.least(func.greatest((read_alike - MEANING_FLOOR) / MEANING_BAND, 0.0), 1.0)
    return cast(func.floor(MEANING_MAX * position + 0.5), Integer)


def shown_score(
    role_count: ColumnElement[int], technologies: Any, sectors: Any, read_alike: Any
) -> Any:
    """The score a match shows, in SQL, so the order can page with offset and limit.

    `technologies` and `sectors` are `shared_counts` subqueries, outer joined by the caller.
    `read_alike` is `similarity(...)` of the two vectors, or null when one is missing. It must
    give what `match_score` counts in Python; the tests compare the two.
    """
    technology_count = func.coalesce(technologies.c.shared_count, 0)
    sector_count = func.coalesce(sectors.c.shared_count, 0)
    roles = case((role_count >= 2, MANY_ROLES_POINTS), (role_count == 1, ONE_ROLE_POINTS), else_=0)
    raw = (
        roles
        + func.least(technology_count, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS
        + func.least(sector_count, SECTOR_CAP) * SECTOR_POINTS
    )
    return case(
        (read_alike.is_(None), (raw * 100 + AVAILABLE_MAX // 2) // AVAILABLE_MAX),
        else_=raw + meaning_points_sql(read_alike),
    )


def shared_counts(key: Any, mine: Any) -> Any:
    """Per person, how many of their technologies (or sectors) are in `mine`."""
    link = key.class_
    return (
        select(link.user_id, func.count().label("shared_count"))
        .where(key.in_(mine))
        .group_by(link.user_id)
        .subquery()
    )


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
    # loaded once, then used for the order and to name what is shared on each card
    author_technologies = set(
        await db.scalars(
            select(UserTechnology.technology_id).where(UserTechnology.user_id == idea.author_id)
        )
    )
    author_sectors = set(
        await db.scalars(select(UserSector.sector_id).where(UserSector.user_id == idea.author_id))
    )
    shared_technologies = shared_counts(UserTechnology.technology_id, author_technologies)
    shared_sectors = shared_counts(UserSector.sector_id, author_sectors)
    # null while the idea or the developer has no vector, which gives them the version 1 score
    idea_vector = (
        select(IdeaEmbedding.embedding).where(IdeaEmbedding.idea_id == idea.id).scalar_subquery()
    )
    read_alike = similarity(UserEmbedding.embedding, idea_vector)
    score = shown_score(verified.c.role_count, shared_technologies, shared_sectors, read_alike)
    # anyone asking, invited or in this idea's hub is already known; after a no, a leave or a
    # removal they may be suggested again (asking again still waits out any cool-down)
    connected = (
        select(HubMember.user_id)
        .join(Hub, Hub.id == HubMember.hub_id)
        .where(Hub.idea_id == idea.id, HubMember.status.in_(LIVE_STATUSES))
    )
    result = await db.execute(
        select(User, read_alike.label("read_alike"))
        .join(verified, verified.c.user_id == User.id)
        .outerjoin(shared_technologies, shared_technologies.c.user_id == User.id)
        .outerjoin(shared_sectors, shared_sectors.c.user_id == User.id)
        .outerjoin(UserEmbedding, UserEmbedding.user_id == User.id)
        .options(
            selectinload(User.roles),
            selectinload(User.technologies),
            selectinload(User.sectors),
            raiseload(User.identities),
            raiseload(User.feed_topics),
        )
        .where(
            User.deleted_at.is_(None),
            User.id != idea.author_id,
            User.id.not_in(connected),
            same_world(User.id, current_user),
        )
        .order_by(score.desc(), verified.c.first_verified_at, User.id)
        .offset(offset)
        .limit(limit + 1)
    )
    rows = result.all()
    has_more = len(rows) > limit
    page = rows[:limit]
    similar = await closest_ideas_to(db, idea_vector, {user.id for user, _ in page})
    return DeveloperMatchesResponse(
        data=[
            matched_developer(
                user, needed, author_technologies, author_sectors, read_alike, similar.get(user.id)
            )
            for user, read_alike in page
        ],
        next_offset=offset + limit if has_more else None,
    )


def sorted_technologies(technologies: Iterable[Technology]) -> list[TechnologyRef]:
    return sorted(
        (TechnologyRef.model_validate(technology) for technology in technologies),
        key=lambda technology: technology.name.lower(),
    )


def sorted_sectors(sectors: Iterable[Sector]) -> list[SectorRef]:
    return sorted(
        (SectorRef.model_validate(sector) for sector in sectors),
        key=lambda sector: sector.name.lower(),
    )


def matched_developer(
    user: User,
    needed: set[int],
    author_technologies: set[int],
    author_sectors: set[int],
    read_alike: float | None,
    similar_idea: SimilarIdea | None,
) -> MatchedDeveloper:
    matched = sorted(
        (held for held in user.roles if held.role_id in needed and held.verified_at is not None),
        key=lambda held: held.role_id,
    )
    shared = sorted_technologies(
        held.technology for held in user.technologies if held.technology_id in author_technologies
    )
    shared_sectors = sorted_sectors(
        held.sector for held in user.sectors if held.sector_id in author_sectors
    )
    return MatchedDeveloper(
        **match_score(len(matched), len(shared), len(shared_sectors), read_alike).model_dump(),
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
        matched_roles=[RoleRef.model_validate(held.role) for held in matched],
        technologies=sorted_technologies(held.technology for held in user.technologies),
        shared_technologies=shared,
        shared_technology_count=len(shared),
        shared_sectors=shared_sectors,
        country_code=user.country_code,
        similar_idea=similar_idea,
    )


async def closest_ideas_to(
    db: DbSession, idea_vector: Any, author_ids: set[UUID]
) -> dict[UUID, SimilarIdea]:
    """For each author, their open idea that reads closest to the vector, if it reads close
    enough. One query for a whole page. The authors come from a list that is already on the
    caller's side of the demo wall."""
    read_alike = similarity(IdeaEmbedding.embedding, idea_vector)
    result = await db.execute(
        select(Idea.author_id, Idea.id, Idea.title)
        .join(IdeaEmbedding, IdeaEmbedding.idea_id == Idea.id)
        .where(
            Idea.author_id.in_(author_ids),
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            read_alike >= SIMILAR_FROM,
        )
        .order_by(Idea.author_id, read_alike.desc(), Idea.id)
        .ext(distinct_on(Idea.author_id))
    )
    return {author_id: SimilarIdea(id=idea_id, title=title) for author_id, idea_id, title in result}


async def my_ideas_closest_to(
    db: DbSession, idea_ids: set[UUID], viewer: User
) -> dict[UUID, SimilarIdea]:
    """For each idea, the viewer's own open idea that reads closest to it, if it reads close
    enough. One query for a whole page."""
    listed = aliased(IdeaEmbedding)
    read_alike = similarity(IdeaEmbedding.embedding, listed.embedding)
    result = await db.execute(
        select(listed.idea_id, Idea.id, Idea.title)
        .select_from(Idea)
        .join(IdeaEmbedding, IdeaEmbedding.idea_id == Idea.id)
        .join(listed, listed.idea_id.in_(idea_ids))
        .where(
            Idea.author_id == viewer.id,
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            read_alike >= SIMILAR_FROM,
        )
        .order_by(listed.idea_id, read_alike.desc(), Idea.id)
        .ext(distinct_on(listed.idea_id))
    )
    return {listed_id: SimilarIdea(id=own_id, title=title) for listed_id, own_id, title in result}


async def shared_with_authors(
    db: DbSession, user_id: UUID, author_ids: set[UUID], key: Any, item: Any
) -> dict[UUID, list[Any]]:
    """One query for a whole page: the caller's technologies (or sectors) each author also has."""
    link = key.class_
    mine = select(key).where(link.user_id == user_id)
    result = await db.execute(
        select(link.user_id, item)
        .join(item, item.id == key)
        .where(link.user_id.in_(author_ids), key.in_(mine))
    )
    found: defaultdict[UUID, list[Any]] = defaultdict(list)
    for author_id, held in result:
        found[author_id].append(held)
    return found


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

    my_technologies = select(UserTechnology.technology_id).where(
        UserTechnology.user_id == current_user.id
    )
    my_sectors = select(UserSector.sector_id).where(UserSector.user_id == current_user.id)
    shared_technologies = shared_counts(UserTechnology.technology_id, my_technologies)
    shared_sectors = shared_counts(UserSector.sector_id, my_sectors)
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
    # null while the idea or I have no vector, which gives the idea the version 1 score
    my_vector = (
        select(UserEmbedding.embedding)
        .where(UserEmbedding.user_id == current_user.id)
        .scalar_subquery()
    )
    read_alike = similarity(IdeaEmbedding.embedding, my_vector)
    result = await db.execute(
        select(Idea, read_alike.label("read_alike"))
        .join(needing_me, needing_me.c.idea_id == Idea.id)
        .outerjoin(shared_technologies, shared_technologies.c.user_id == Idea.author_id)
        .outerjoin(shared_sectors, shared_sectors.c.user_id == Idea.author_id)
        .outerjoin(IdeaEmbedding, IdeaEmbedding.idea_id == Idea.id)
        .options(*idea_options(), defer(Idea.details, raiseload=True))
        .where(
            Idea.status == IdeaStatus.OPEN,
            Idea.deleted_at.is_(None),
            Idea.author_id != current_user.id,
            Idea.id.not_in(connected),
            same_world(Idea.author_id, current_user),
        )
        .order_by(
            shown_score(
                needing_me.c.role_count, shared_technologies, shared_sectors, read_alike
            ).desc(),
            Idea.published_at.desc(),
            Idea.id.desc(),
        )
        .offset(offset)
        .limit(limit + 1)
    )
    rows = result.all()
    has_more = len(rows) > limit
    page = rows[:limit]
    author_ids = {idea.author_id for idea, _ in page}
    similar = await my_ideas_closest_to(db, {idea.id for idea, _ in page}, current_user)
    technologies = await shared_with_authors(
        db, current_user.id, author_ids, UserTechnology.technology_id, Technology
    )
    sectors = await shared_with_authors(
        db, current_user.id, author_ids, UserSector.sector_id, Sector
    )
    data = []
    for idea, read_alike in page:
        matched = [
            RoleRef.model_validate(need.role) for need in idea.roles_needed if need.role_id in mine
        ]
        shared_technologies = sorted_technologies(technologies.get(idea.author_id, []))
        shared_sectors = sorted_sectors(sectors.get(idea.author_id, []))
        data.append(
            IdeaMatch(
                **match_score(
                    len(matched), len(shared_technologies), len(shared_sectors), read_alike
                ).model_dump(),
                idea=public_idea(idea),
                matched_roles=matched,
                shared_technologies=shared_technologies,
                shared_sectors=shared_sectors,
                similar_idea=similar.get(idea.id),
            )
        )
    return IdeaMatchesResponse(
        data=data,
        next_offset=offset + limit if has_more else None,
    )
