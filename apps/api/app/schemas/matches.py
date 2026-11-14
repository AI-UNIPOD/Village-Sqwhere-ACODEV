"""What the matching endpoints return.

Each match says why it matched, so a person can trust the order. Nothing here carries an
idea's confidential `details`, or a developer's email, names or bio. The one personal field is
the developer's country, when they named one (`2026-11-14-profile-country.md`).
"""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.ideas import PublicIdea
from app.schemas.lookups import RoleRef, TechnologyRef


class MatchedDeveloper(BaseModel):
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
    country_code: str | None = None


class DeveloperMatchesResponse(BaseModel):
    data: list[MatchedDeveloper]
    next_offset: int | None = None


class IdeaMatch(BaseModel):
    idea: PublicIdea
    # the signed-in developer's verified roles that this idea needs
    matched_roles: list[RoleRef]
    # technologies the signed-in developer shares with the idea's author
    shared_technologies: list[TechnologyRef]


class IdeaMatchesResponse(BaseModel):
    data: list[IdeaMatch]
    next_offset: int | None = None
