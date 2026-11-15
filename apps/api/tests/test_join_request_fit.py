"""The owner sees the match score on each pending join request.

Why: docs/decisions/2026-11-15-score-on-join-requests.md
"""

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.models import (
    Hub,
    HubMemberStatus,
    IdeaRoleNeed,
    Role,
    Sector,
    Technology,
    User,
    UserRole,
    UserSector,
    UserTechnology,
)
from app.services.match_score import match_score
from tests.hub_support import add_member, auth, make_hub, make_user, run


def give(user: User, *, verified: list[str] = (), technologies: list[str] = (), sectors=()) -> None:
    async def work(session):
        for slug in verified:
            role = await session.scalar(select(Role).where(Role.slug == slug))
            session.add(UserRole(user_id=user.id, role_id=role.id, verified_at=datetime.now(UTC)))
        for slug in technologies:
            tech = await session.scalar(select(Technology).where(Technology.slug == slug))
            session.add(UserTechnology(user_id=user.id, technology_id=tech.id))
        for slug in sectors:
            sector = await session.scalar(select(Sector).where(Sector.slug == slug))
            session.add(UserSector(user_id=user.id, sector_id=sector.id))
        await session.execute(update(User).where(User.id == user.id).values(country_code="GH"))
        await session.commit()

    run(work)


def need(hub: Hub, *slugs: str) -> None:
    async def work(session):
        for slug in slugs:
            role = await session.scalar(select(Role).where(Role.slug == slug))
            session.add(IdeaRoleNeed(idea_id=hub.idea_id, role_id=role.id))
        await session.commit()

    run(work)


def team(client: TestClient, hub: Hub, viewer: User) -> dict[str, Any]:
    response = client.get(f"/v1/hubs/{hub.id}/members", headers=auth(viewer))
    assert response.status_code == 200, response.text
    return {card["user"]["username"]: card for card in response.json()["data"]}


def test_the_owner_sees_the_fit_of_a_pending_request(client: TestClient) -> None:
    owner, asking = make_user(), make_user()
    hub = make_hub(owner)
    need(hub, "backend-engineer", "ai-ml-engineer")
    give(owner, technologies=["python", "go"], sectors=["fintech"])
    give(
        asking,
        verified=["backend-engineer"],
        technologies=["python", "java"],
        sectors=["fintech", "health"],
    )
    add_member(hub, asking, HubMemberStatus.REQUESTED)

    fit = team(client, hub, owner)[asking.username]["fit"]

    expected = match_score(1, 1, 1)
    assert fit["score"] == expected.score
    assert fit["score_version"] == expected.score_version and fit["partial"] is True
    assert fit["breakdown"] == expected.breakdown.model_dump()
    assert [role["slug"] for role in fit["matched_roles"]] == ["backend-engineer"]
    assert [tech["slug"] for tech in fit["shared_technologies"]] == ["python"]
    assert [sector["slug"] for sector in fit["shared_sectors"]] == ["fintech"]
    assert fit["country_code"] == "GH"
    assert fit["username"] == asking.username


def test_a_request_with_no_needed_role_still_gets_a_low_score(client: TestClient) -> None:
    owner, asking = make_user(), make_user()
    hub = make_hub(owner)
    need(hub, "backend-engineer")
    add_member(hub, asking, HubMemberStatus.REQUESTED)

    fit = team(client, hub, owner)[asking.username]["fit"]

    assert fit["score"] == match_score(0, 0, 0).score
    assert fit["matched_roles"] == []


def test_only_requests_get_a_fit_and_only_the_owner_sees_it(client: TestClient) -> None:
    owner, member, invited, declined, asking = (make_user() for _ in range(5))
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)
    add_member(hub, declined, HubMemberStatus.DECLINED)
    add_member(hub, asking, HubMemberStatus.REQUESTED)

    as_owner = team(client, hub, owner)
    assert as_owner[asking.username]["fit"] is not None
    for person in (owner, member, invited, declined):
        assert as_owner[person.username]["fit"] is None
    as_member = team(client, hub, member)
    assert asking.username not in as_member
    assert all(card["fit"] is None for card in as_member.values())
