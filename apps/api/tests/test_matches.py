"""Matching open ideas with developers by verified roles.

The test database is shared and never cleaned, so every test matches on roles it creates
for itself. Nothing left by another test can then appear in, or reorder, its matches. The
roles and every row that uses them are removed when the test ends.
"""

from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.models import (
    Hub,
    HubMemberStatus,
    IdeaRoleNeed,
    Role,
    Technology,
    User,
    UserRole,
    UserTechnology,
)
from tests.hub_support import add_member, auth, bad_auth_headers, make_user, run

MY_IDEAS = "/v1/me/ideas"
MY_MATCHES = "/v1/me/matches"
DETAILS = "Confidential plan: first partner co-operative in Kaduna, pricing in naira."
DEVELOPER_CARD = {
    "id",
    "username",
    "display_name",
    "avatar_url",
    "is_verified",
    "matched_roles",
    "technologies",
    "shared_technology_count",
}


@pytest.fixture
def new_role() -> Generator[Callable[[], Role]]:
    """Makes active roles that only this test uses."""
    made: list[int] = []

    def make() -> Role:
        async def work(session):
            name = f"test-matching-{uuid4().hex[:12]}"
            role = Role(slug=name, name=name.replace("-", " ").title())
            session.add(role)
            await session.commit()
            return role

        role = run(work)
        made.append(role.id)
        return role

    yield make

    async def clean(session):
        await session.execute(delete(IdeaRoleNeed).where(IdeaRoleNeed.role_id.in_(made)))
        await session.execute(delete(UserRole).where(UserRole.role_id.in_(made)))
        await session.execute(delete(Role).where(Role.id.in_(made)))
        await session.commit()

    run(clean)


def hold(user: User, role: Role, *, verified_at: datetime | None) -> None:
    async def work(session):
        session.add(UserRole(user_id=user.id, role_id=role.id, verified_at=verified_at))
        await session.commit()

    run(work)


def verify(user: User, *roles: Role, at: datetime | None = None) -> None:
    for role in roles:
        hold(user, role, verified_at=at or datetime.now(UTC))


def use_technologies(user: User, *slugs: str) -> None:
    async def work(session):
        found = await session.execute(select(Technology).where(Technology.slug.in_(slugs)))
        for technology in found.scalars():
            session.add(UserTechnology(user_id=user.id, technology_id=technology.id))
        await session.commit()

    run(work)


def set_role_active(role: Role, active: bool) -> None:
    async def work(session):
        await session.execute(update(Role).where(Role.id == role.id).values(is_active=active))
        await session.commit()

    run(work)


def delete_user(user: User) -> None:
    async def work(session):
        await session.execute(
            update(User).where(User.id == user.id).values(deleted_at=datetime.now(UTC))
        )
        await session.commit()

    run(work)


def new_idea(client: TestClient, owner: User, *roles: Role, publish: bool = True) -> str:
    response = client.post(
        MY_IDEAS,
        headers=auth(owner),
        json={
            "title": "Offline farm ledger for co-operatives",
            "summary": "A shared ledger that works offline for farming co-operatives in Kano.",
            "details": DETAILS,
            "roles_needed": [role.slug for role in roles],
        },
    )
    assert response.status_code == 201, response.text
    idea_id = response.json()["data"]["id"]
    if publish:
        published = client.post(f"{MY_IDEAS}/{idea_id}/publish", headers=auth(owner))
        assert published.status_code == 200, published.text
    return idea_id


def hub_for(client: TestClient, owner: User, idea_id: str) -> Hub:
    agreement = client.get("/v1/agreements/current", headers=auth(owner)).json()["data"]
    created = client.post(
        "/v1/hubs",
        headers=auth(owner),
        json={
            "idea_id": idea_id,
            "name": "Farm Ledger Hub",
            "agreement": {
                "template_id": agreement["template_id"],
                "template_sha256": agreement["body_sha256"],
                "signed_legal_name": "Amina Bello",
            },
        },
    )
    assert created.status_code == 201, created.text

    async def work(session):
        return await session.get(Hub, UUID(created.json()["data"]["id"]))

    return run(work)


def developer_matches(client: TestClient, owner: User, idea_id: str, **params: Any) -> Any:
    response = client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(owner), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def usernames(page: Any) -> list[str]:
    return [match["username"] for match in page["data"]]


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def test_developers_rank_by_roles_then_shared_technologies_then_earliest_verification(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    backend, design = new_role(), new_role()
    owner = make_user()
    use_technologies(owner, "python", "react")
    idea_id = new_idea(client, owner, backend, design)
    earlier = datetime.now(UTC) - timedelta(days=3)

    both_roles = make_user()
    verify(both_roles, backend, design)
    two_shared = make_user()
    verify(two_shared, backend)
    use_technologies(two_shared, "python", "react", "rust")
    one_shared_early = make_user()
    verify(one_shared_early, backend, at=earlier)
    use_technologies(one_shared_early, "python")
    one_shared_late = make_user()
    verify(one_shared_late, design)
    use_technologies(one_shared_late, "react")

    page = developer_matches(client, owner, idea_id)

    assert usernames(page) == [
        both_roles.username,
        two_shared.username,
        one_shared_early.username,
        one_shared_late.username,
    ]
    assert page["next_offset"] is None
    first, second = page["data"][0], page["data"][1]
    assert set(first) == DEVELOPER_CARD
    assert [role["slug"] for role in first["matched_roles"]] == [backend.slug, design.slug]
    assert first["shared_technology_count"] == 0
    assert first["technologies"] == []
    assert [role["slug"] for role in second["matched_roles"]] == [backend.slug]
    assert second["shared_technology_count"] == 2
    assert [tech["name"] for tech in second["technologies"]] == ["Python", "React", "Rust"]
    assert [match["shared_technology_count"] for match in page["data"][2:]] == [1, 1]


def test_only_other_live_developers_with_a_verified_needed_role_match(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed, other = new_role(), new_role()
    owner = make_user()
    verify(owner, needed)
    idea_id = new_idea(client, owner, needed)

    matched = make_user()
    verify(matched, needed)
    unverified = make_user()
    hold(unverified, needed, verified_at=None)
    wrong_role = make_user()
    verify(wrong_role, other)
    deleted = make_user()
    verify(deleted, needed)
    delete_user(deleted)

    assert usernames(developer_matches(client, owner, idea_id)) == [matched.username]


def test_people_already_connected_to_the_ideas_hub_are_not_suggested(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    hub = hub_for(client, owner, idea_id)
    connected = {}
    for status in (HubMemberStatus.ACTIVE, HubMemberStatus.INVITED, HubMemberStatus.DECLINED):
        member = make_user()
        verify(member, needed)
        add_member(hub, member, status)
        connected[status] = member
    stranger = make_user()
    verify(stranger, needed)

    assert usernames(developer_matches(client, owner, idea_id)) == [stranger.username]
    for member in connected.values():
        assert client.get(MY_MATCHES, headers=auth(member)).json()["data"] == []
    assert len(client.get(MY_MATCHES, headers=auth(stranger)).json()["data"]) == 1


def test_a_role_that_is_no_longer_active_stops_matching(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    kept, retired = new_role(), new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, kept, retired)
    both = make_user()
    verify(both, kept, retired)
    retired_only = make_user()
    verify(retired_only, retired)

    set_role_active(retired, False)
    page = developer_matches(client, owner, idea_id)

    assert usernames(page) == [both.username]
    assert [role["slug"] for role in page["data"][0]["matched_roles"]] == [kept.slug]


def test_developer_matches_page_through_offset_and_limit(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    start = datetime.now(UTC) - timedelta(days=10)
    developers = [make_user() for _ in range(3)]
    for days, developer in enumerate(developers):
        verify(developer, needed, at=start + timedelta(days=days))

    first = developer_matches(client, owner, idea_id, limit=2)
    second = developer_matches(client, owner, idea_id, limit=2, offset=first["next_offset"])

    assert usernames(first) == [developers[0].username, developers[1].username]
    assert first["next_offset"] == 2
    assert usernames(second) == [developers[2].username]
    assert second["next_offset"] is None


def test_an_idea_without_needed_roles_has_no_matches(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    owner = make_user()
    idea_id = new_idea(client, owner)

    assert developer_matches(client, owner, idea_id) == {"data": [], "next_offset": None}


def test_only_the_owner_of_an_open_idea_sees_its_matches(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    draft_id = new_idea(client, owner, needed, publish=False)
    closed_id = new_idea(client, owner, needed)
    assert client.post(f"{MY_IDEAS}/{closed_id}/close", headers=auth(owner)).status_code == 200
    open_id = new_idea(client, owner, needed)

    for idea_id in (draft_id, closed_id):
        response = client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(owner))
        assert_error(response, 409, "IDEA_NOT_OPEN")
    for idea_id in (open_id, str(uuid4())):
        response = client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(make_user()))
        assert_error(response, 404, "NOT_FOUND")


def test_ideas_match_a_developer_by_verified_roles_needed(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    backend, design, unclaimed = new_role(), new_role(), new_role()
    me = make_user()
    verify(me, backend, design)
    author = make_user()
    needs_one_early = new_idea(client, author, backend)
    needs_both = new_idea(client, author, backend, design, unclaimed)
    needs_one_late = new_idea(client, author, design)
    new_idea(client, author, unclaimed)
    new_idea(client, author, backend, publish=False)
    closed = new_idea(client, author, backend)
    assert client.post(f"{MY_IDEAS}/{closed}/close", headers=auth(author)).status_code == 200
    new_idea(client, me, backend)

    response = client.get(MY_MATCHES, headers=auth(me))

    assert response.status_code == 200, response.text
    page = response.json()
    assert [match["idea"]["id"] for match in page["data"]] == [
        needs_both,
        needs_one_late,
        needs_one_early,
    ]
    assert page["next_offset"] is None
    best = page["data"][0]
    assert set(best) == {"idea", "matched_roles"}
    assert [role["slug"] for role in best["matched_roles"]] == [backend.slug, design.slug]
    assert [role["slug"] for role in best["idea"]["roles_needed"]] == [
        backend.slug,
        design.slug,
        unclaimed.slug,
    ]
    assert best["idea"]["author"]["id"] == str(author.id)


def test_a_developer_without_a_verified_role_has_no_idea_matches(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    me = make_user()
    hold(me, needed, verified_at=None)
    new_idea(client, make_user(), needed)

    response = client.get(MY_MATCHES, headers=auth(me))

    assert response.json() == {"data": [], "next_offset": None}


def test_matching_never_returns_an_ideas_confidential_details(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    developer = make_user()
    verify(developer, needed)

    for response in (
        client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(owner)),
        client.get(MY_MATCHES, headers=auth(developer)),
    ):
        assert response.status_code == 200, response.text
        assert response.json()["data"], "the test needs a match to inspect"
        assert DETAILS not in response.text
        assert '"details"' not in response.text


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 51}, {"offset": -1}])
def test_matching_pages_are_bounded(client: TestClient, params: dict[str, int]) -> None:
    response = client.get(MY_MATCHES, headers=auth(make_user()), params=params)

    assert response.status_code == 422


@pytest.mark.parametrize("headers", bad_auth_headers().values(), ids=bad_auth_headers().keys())
def test_matching_needs_sign_in(client: TestClient, headers: dict[str, str]) -> None:
    for url in (MY_MATCHES, f"{MY_IDEAS}/{uuid4()}/matches"):
        response = client.get(url, headers=headers)
        assert response.status_code == 401, response.text
