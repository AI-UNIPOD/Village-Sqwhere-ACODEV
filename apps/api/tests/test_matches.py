"""Matching open ideas with developers by verified roles, scored out of 100.

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
    Sector,
    Technology,
    User,
    UserRole,
    UserSector,
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
    "shared_technologies",
    "shared_technology_count",
    "shared_sectors",
    "country_code",
    "score",
    "score_version",
    "partial",
    "breakdown",
}
IDEA_CARD = {
    "idea",
    "matched_roles",
    "shared_technologies",
    "shared_sectors",
    "score",
    "score_version",
    "partial",
    "breakdown",
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


@pytest.fixture
def new_lookup() -> Generator[Callable[[type[Technology | Sector], str], Technology | Sector]]:
    """Makes technologies and sectors that only this test uses, named as the test asks."""
    made: list[Technology | Sector] = []

    def make(model: type[Technology | Sector], name: str) -> Technology | Sector:
        unique = f"{name} {uuid4().hex[:8]}"

        async def work(session):
            row = model(slug=unique.lower().replace(" ", "-"), name=unique)
            session.add(row)
            await session.commit()
            return row

        row = run(work)
        made.append(row)
        return row

    yield make

    async def clean(session):
        technologies = [row.id for row in made if isinstance(row, Technology)]
        sectors = [row.id for row in made if isinstance(row, Sector)]
        await session.execute(
            delete(UserTechnology).where(UserTechnology.technology_id.in_(technologies))
        )
        await session.execute(delete(UserSector).where(UserSector.sector_id.in_(sectors)))
        await session.execute(delete(Technology).where(Technology.id.in_(technologies)))
        await session.execute(delete(Sector).where(Sector.id.in_(sectors)))
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


def share(user: User, *items: Technology | Sector) -> None:
    """Gives the user these technologies and sectors."""

    async def work(session):
        for item in items:
            if isinstance(item, Technology):
                session.add(UserTechnology(user_id=user.id, technology_id=item.id))
            else:
                session.add(UserSector(user_id=user.id, sector_id=item.id))
        await session.commit()

    run(work)


def set_country(user: User, code: str) -> None:
    async def work(session):
        await session.execute(update(User).where(User.id == user.id).values(country_code=code))
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


def test_developers_rank_by_score_then_earliest_verification(
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

    # Scores: two roles 40 of 70, one role and two shared technologies 38, one role and one
    # shared technology 34 twice, so the earlier verification goes first.
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


def test_developer_cards_name_the_shared_technologies_and_count_them(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    use_technologies(owner, "python", "react")
    idea_id = new_idea(client, owner, needed)
    some = make_user()
    verify(some, needed)
    use_technologies(some, "rust", "react", "python")
    none = make_user()
    verify(none, needed)
    use_technologies(none, "rust")

    cards = {card["username"]: card for card in developer_matches(client, owner, idea_id)["data"]}

    named = cards[some.username]
    assert [tech["name"] for tech in named["shared_technologies"]] == ["Python", "React"]
    assert [tech["name"] for tech in named["technologies"]] == ["Python", "React", "Rust"]
    unshared = cards[none.username]
    assert unshared["shared_technologies"] == []
    assert [tech["name"] for tech in unshared["technologies"]] == ["Rust"]
    for card in cards.values():
        assert card["shared_technology_count"] == len(card["shared_technologies"])


def test_developer_cards_carry_the_country_only_when_one_was_named(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    named, unnamed = make_user(), make_user()
    for developer in (named, unnamed):
        verify(developer, needed)
    set_country(named, "KE")

    cards = {card["username"]: card for card in developer_matches(client, owner, idea_id)["data"]}

    assert cards[named.username]["country_code"] == "KE"
    assert cards[unnamed.username]["country_code"] is None


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


def test_people_asking_invited_or_in_the_ideas_hub_are_not_suggested(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    hub = hub_for(client, owner, idea_id)
    connected = {}
    for status in (HubMemberStatus.ACTIVE, HubMemberStatus.INVITED, HubMemberStatus.REQUESTED):
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


def test_people_whose_membership_ended_are_suggested_again(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    owner = make_user()
    idea_id = new_idea(client, owner, needed)
    hub = hub_for(client, owner, idea_id)
    ended = []
    for status in (HubMemberStatus.DECLINED, HubMemberStatus.LEFT, HubMemberStatus.REMOVED):
        member = make_user()
        verify(member, needed)
        add_member(hub, member, status)
        ended.append(member)

    assert sorted(usernames(developer_matches(client, owner, idea_id))) == sorted(
        member.username for member in ended
    )
    for member in ended:
        page = client.get(MY_MATCHES, headers=auth(member)).json()
        assert [match["idea"]["id"] for match in page["data"]] == [idea_id]


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
    # Two roles score 40 of 70 and one role 30, so the idea needing both comes first. The two
    # ideas needing one role tie, and the newest publication goes first.
    assert [match["idea"]["id"] for match in page["data"]] == [
        needs_both,
        needs_one_late,
        needs_one_early,
    ]
    assert page["next_offset"] is None
    best = page["data"][0]
    assert set(best) == IDEA_CARD
    assert [role["slug"] for role in best["matched_roles"]] == [backend.slug, design.slug]
    assert [role["slug"] for role in best["idea"]["roles_needed"]] == [
        backend.slug,
        design.slug,
        unclaimed.slug,
    ]
    assert best["idea"]["author"]["id"] == str(author.id)


def test_ideas_name_the_technologies_i_share_with_each_author(
    client: TestClient, new_role: Callable[[], Role]
) -> None:
    needed = new_role()
    me = make_user()
    verify(me, needed)
    use_technologies(me, "python", "react")
    ideas = {}
    for label, technologies in {
        "both": ("react", "rust", "python"),
        "one": ("rust", "react"),
        "none": ("rust",),
    }.items():
        author = make_user()
        use_technologies(author, *technologies)
        ideas[new_idea(client, author, needed)] = label

    page = client.get(MY_MATCHES, headers=auth(me)).json()

    shared = {
        ideas[match["idea"]["id"]]: [tech["name"] for tech in match["shared_technologies"]]
        for match in page["data"]
    }
    assert shared == {"both": ["Python", "React"], "one": ["React"], "none": []}


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


def parts(card: Any) -> dict[str, Any]:
    """The breakdown as {part: points}, after checking every part's maximum."""
    maxima = {"roles": 40, "technologies": 20, "sectors": 10, "meaning": 30}
    assert {name: part["max"] for name, part in card["breakdown"].items()} == maxima
    return {name: part["points"] for name, part in card["breakdown"].items()}


def test_developer_scores_follow_the_record_and_say_what_is_missing(
    client: TestClient, new_role: Callable[[], Role], new_lookup: Any
) -> None:
    first, second = new_role(), new_role()
    technologies = [new_lookup(Technology, f"Stack {n}") for n in range(5)]
    sectors = [new_lookup(Sector, f"Field {n}") for n in range(2)]
    owner = make_user()
    share(owner, *technologies, *sectors)
    idea_id = new_idea(client, owner, first, second)
    one_role = make_user()
    verify(one_role, first)
    three_technologies = make_user()
    verify(three_technologies, first)
    share(three_technologies, *technologies[:3])
    mixed = make_user()
    verify(mixed, first, second)
    share(mixed, *technologies[:3], sectors[0])
    everything = make_user()
    verify(everything, first, second)
    share(everything, *technologies, *sectors)

    cards = {card["username"]: card for card in developer_matches(client, owner, idea_id)["data"]}

    # raw points over 70, scaled to 100 and rounded half up: 30 gives 43, 42 gives 60, 57 gives 81
    assert {name: card["score"] for name, card in cards.items()} == {
        one_role.username: 43,
        three_technologies.username: 60,
        mixed.username: 81,
        everything.username: 100,
    }
    assert parts(cards[mixed.username]) == {
        "roles": 40,
        "technologies": 12,
        "sectors": 5,
        "meaning": None,
    }
    assert parts(cards[one_role.username]) == {
        "roles": 30,
        "technologies": 0,
        "sectors": 0,
        "meaning": None,
    }
    assert all(card["score_version"] == 1 and card["partial"] is True for card in cards.values())


def test_shared_technologies_and_sectors_stop_counting_after_five_and_two(
    client: TestClient, new_role: Callable[[], Role], new_lookup: Any
) -> None:
    needed = new_role()
    technologies = [new_lookup(Technology, f"Stack {n}") for n in range(6)]
    sectors = [new_lookup(Sector, f"Field {n}") for n in range(3)]
    owner = make_user()
    share(owner, *technologies, *sectors)
    idea_id = new_idea(client, owner, needed)
    developer = make_user()
    verify(developer, needed)
    share(developer, *technologies, *sectors)

    card = developer_matches(client, owner, idea_id)["data"][0]

    assert card["shared_technology_count"] == 6
    assert len(card["shared_sectors"]) == 3
    assert parts(card) == {"roles": 30, "technologies": 20, "sectors": 10, "meaning": None}
    assert card["score"] == 86


def test_developer_cards_name_the_shared_sectors_sorted_by_name(
    client: TestClient, new_role: Callable[[], Role], new_lookup: Any
) -> None:
    needed = new_role()
    # made in this order, so sorting by name differs from sorting by id
    zebra = new_lookup(Sector, "Zebra trade")
    apple = new_lookup(Sector, "apple growing")
    other = new_lookup(Sector, "Other work")
    owner = make_user()
    share(owner, zebra, apple)
    idea_id = new_idea(client, owner, needed)
    some, none = make_user(), make_user()
    for developer in (some, none):
        verify(developer, needed)
    share(some, zebra, apple, other)
    share(none, other)

    cards = {card["username"]: card for card in developer_matches(client, owner, idea_id)["data"]}

    assert [sector["name"][:5] for sector in cards[some.username]["shared_sectors"]] == [
        "apple",
        "Zebra",
    ]
    assert set(cards[some.username]["shared_sectors"][0]) == {"slug", "name"}
    assert cards[none.username]["shared_sectors"] == []


def test_developer_pages_are_ordered_by_score_even_when_roles_say_otherwise(
    client: TestClient, new_role: Callable[[], Role], new_lookup: Any
) -> None:
    first, second = new_role(), new_role()
    technologies = [new_lookup(Technology, f"Stack {n}") for n in range(5)]
    sectors = [new_lookup(Sector, f"Field {n}") for n in range(2)]
    owner = make_user()
    share(owner, *technologies, *sectors)
    idea_id = new_idea(client, owner, first, second)
    long_ago = datetime.now(UTC) - timedelta(days=9)
    # one role with everything shared is 60 of 70, two roles with nothing shared is 40
    one_role_full = make_user()
    verify(one_role_full, first)
    share(one_role_full, *technologies, *sectors)
    two_roles_bare = make_user()
    verify(two_roles_bare, first, second, at=long_ago)
    # one role and two sectors is also 40, and was verified later than the two-role developer
    # it ties with, so it comes after
    one_role_sectors = make_user()
    verify(one_role_sectors, second)
    share(one_role_sectors, *sectors)
    bare = make_user()
    verify(bare, first, at=long_ago)

    first_page = developer_matches(client, owner, idea_id, limit=2)
    second_page = developer_matches(
        client, owner, idea_id, limit=2, offset=first_page["next_offset"]
    )

    cards = first_page["data"] + second_page["data"]
    assert [card["username"] for card in cards] == [
        one_role_full.username,
        two_roles_bare.username,
        one_role_sectors.username,
        bare.username,
    ]
    assert [card["score"] for card in cards] == [86, 57, 57, 43]
    assert [card["score"] for card in cards] == sorted(
        (card["score"] for card in cards), reverse=True
    )
    assert first_page["next_offset"] == 2
    assert second_page["next_offset"] is None


def test_ideas_are_scored_named_and_ordered_by_score_across_pages(
    client: TestClient, new_role: Callable[[], Role], new_lookup: Any
) -> None:
    first, second = new_role(), new_role()
    technologies = [new_lookup(Technology, f"Stack {n}") for n in range(5)]
    zebra = new_lookup(Sector, "Zebra trade")
    apple = new_lookup(Sector, "apple growing")
    me = make_user()
    verify(me, first, second)
    share(me, *technologies, zebra, apple)
    close_friend, stranger = make_user(), make_user()
    share(close_friend, *technologies, zebra, apple)
    # two roles needed and nothing shared is 40 of 70; one role with all shared is 60
    two_roles_bare = new_idea(client, stranger, first, second)
    one_role_full = new_idea(client, close_friend, first)
    one_role_bare = new_idea(client, stranger, first)

    cards = []
    offset: int | None = 0
    while offset is not None:
        response = client.get(MY_MATCHES, headers=auth(me), params={"limit": 1, "offset": offset})
        assert response.status_code == 200, response.text
        cards += response.json()["data"]
        offset = response.json()["next_offset"]

    assert [card["idea"]["id"] for card in cards] == [one_role_full, two_roles_bare, one_role_bare]
    assert [card["score"] for card in cards] == [86, 57, 43]
    assert set(cards[0]) == IDEA_CARD
    assert parts(cards[0]) == {"roles": 30, "technologies": 20, "sectors": 10, "meaning": None}
    assert parts(cards[1]) == {"roles": 40, "technologies": 0, "sectors": 0, "meaning": None}
    assert all(card["score_version"] == 1 and card["partial"] is True for card in cards)
    assert [sector["name"][:5] for sector in cards[0]["shared_sectors"]] == ["apple", "Zebra"]
    assert cards[1]["shared_sectors"] == [] and cards[2]["shared_sectors"] == []
