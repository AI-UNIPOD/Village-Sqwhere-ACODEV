"""What the matching endpoints return.

Each match says why it matched, so a person can trust the order. Nothing here carries an
idea's confidential `details`, or a developer's email, names or bio. The one personal field is
the developer's country, when they named one (`2026-11-14-profile-country.md`).
"""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.ideas import PublicIdea
from app.schemas.lookups import RoleRef, SectorRef, TechnologyRef


class ScorePart(BaseModel):
    # the raw points before scaling, so a card can say "30 of 40"; null when not built yet
    points: int | None
    max: int


class ScoreBreakdown(BaseModel):
    roles: ScorePart
    technologies: ScorePart
    sectors: ScorePart
    meaning: ScorePart


class Scored(BaseModel):
    """The score every match carries, out of 100, with the parts that earned it."""

    score: int
    score_version: int
    # version 1 has no meaning part: the points that exist are scaled to 100
    partial: bool
    breakdown: ScoreBreakdown


class MatchedDeveloper(Scored):
    id: UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    is_verified: bool = False
    # the idea's needed roles this developer is verified in
    matched_roles: list[RoleRef]
    technologies: list[TechnologyRef]
    # technologies the developer shares with the idea's author, and how many
    shared_technologies: list[TechnologyRef]
    shared_technology_count: int
    # sectors the developer shares with the idea's author
    shared_sectors: list[SectorRef]
    country_code: str | None = None


class DeveloperMatchesResponse(BaseModel):
    data: list[MatchedDeveloper]
    next_offset: int | None = None


class IdeaMatch(Scored):
    idea: PublicIdea
    # the signed-in developer's verified roles that this idea needs
    matched_roles: list[RoleRef]
    # technologies the signed-in developer shares with the idea's author
    shared_technologies: list[TechnologyRef]
    # sectors the signed-in developer shares with the idea's author
    shared_sectors: list[SectorRef]


class IdeaMatchesResponse(BaseModel):
    data: list[IdeaMatch]
    next_offset: int | None = None
