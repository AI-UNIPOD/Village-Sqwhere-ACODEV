"""GET /v1/users/{username}: another developer's profile.

Why: docs/decisions/2026-11-14-public-profile.md
"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.models import Role, Sector, Technology, User, UserRole, UserSector, UserTechnology
from tests.hub_support import auth, bad_auth_headers, make_user, run


def fill_profile(user: User) -> None:
    """Backend verified, Product Designer verified later, UI/UX only claimed; Python; Fintech."""

    async def work(session):
        roles = {
            role.slug: role
            for role in await session.scalars(
                select(Role).where(
                    Role.slug.in_(["backend-engineer", "ui-ux-engineer", "ai-ml-engineer"])
                )
            )
        }
        now = datetime.now(UTC)
        session.add_all(
            [
                UserRole(user_id=user.id, role_id=roles["ai-ml-engineer"].id, verified_at=now),
                UserRole(
                    user_id=user.id,
                    role_id=roles["backend-engineer"].id,
                    is_primary=True,
                    verified_at=now - timedelta(days=3),
                ),
                UserRole(user_id=user.id, role_id=roles["ui-ux-engineer"].id),
            ]
        )
        python = await session.scalar(select(Technology).where(Technology.slug == "python"))
        fintech = await session.scalar(select(Sector).where(Sector.slug == "fintech"))
        session.add_all(
            [
                UserTechnology(user_id=user.id, technology_id=python.id),
                UserSector(user_id=user.id, sector_id=fintech.id),
            ]
        )
        await session.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                bio="I build payment tools for market traders in Ibadan.",
                country_code="NG",
                first_name="Adaeze",
                last_name="Okafor",
                email=f"{user.username}@example.com",
            )
        )
        await session.commit()

    run(work)


def set_user(user: User, **values) -> None:
    async def work(session):
        await session.execute(update(User).where(User.id == user.id).values(**values))
        await session.commit()

    run(work)


def profile(client: TestClient, viewer: User, username: str):
    return client.get(f"/v1/users/{username}", headers=auth(viewer))


def test_a_developer_sees_another_developers_public_profile(client: TestClient) -> None:
    viewer, other = make_user(), make_user()
    fill_profile(other)

    response = profile(client, viewer, other.username.upper())

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert set(data) == {
        "id",
        "username",
        "display_name",
        "avatar_url",
        "bio",
        "country_code",
        "is_verified",
        "verified_roles",
        "technologies",
        "sectors",
    }
    assert data["username"] == other.username
    assert data["bio"] == "I build payment tools for market traders in Ibadan."
    assert data["country_code"] == "NG"
    # verified roles only, earliest verification first
    assert [role["slug"] for role in data["verified_roles"]] == [
        "backend-engineer",
        "ai-ml-engineer",
    ]
    assert [tech["slug"] for tech in data["technologies"]] == ["python"]
    assert [sector["slug"] for sector in data["sectors"]] == ["fintech"]
    text = response.text
    assert "Adaeze" not in text and "Okafor" not in text and "example.com" not in text


def test_an_unknown_or_deleted_developer_is_not_found(client: TestClient) -> None:
    viewer, gone = make_user(), make_user()
    set_user(gone, deleted_at=datetime.now(UTC))

    for username in ("nobody-by-this-name", gone.username):
        response = profile(client, viewer, username)
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "USER_NOT_FOUND"


def test_a_made_up_demo_developer_is_hidden_from_real_developers(client: TestClient) -> None:
    viewer, made_up = make_user(), make_user()
    set_user(made_up, is_demo=True)

    assert profile(client, viewer, made_up.username).status_code == 404


def test_a_profile_needs_a_signed_in_caller(client: TestClient) -> None:
    other = make_user()
    for headers in bad_auth_headers().values():
        assert client.get(f"/v1/users/{other.username}", headers=headers).status_code == 401
