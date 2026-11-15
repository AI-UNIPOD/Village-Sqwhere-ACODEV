"""POST /v1/me/deletion: the account is anonymised and its content stays.

Why: docs/decisions/2026-11-14-account-deletion.md
"""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.models import (
    Hub,
    HubMember,
    HubMemberStatus,
    HubStatus,
    Idea,
    IdeaStatus,
    Role,
    Technology,
    User,
    UserIdentity,
    UserRole,
    UserTechnology,
    VerificationSession,
    VerificationStatus,
)
from app.models.users import AuthProvider
from tests.hub_support import add_member, auth, make_hub, make_idea, make_user, run


def delete_me(client: TestClient, user: User, username: str | None = None) -> Any:
    return client.post(
        "/v1/me/deletion", headers=auth(user), json={"username": username or user.username}
    )


def stored(model: Any, *where: Any) -> Any:
    async def work(session):
        return await session.scalar(select(model).where(*where))

    return run(work)


def count(model: Any, *where: Any) -> int:
    async def work(session):
        return await session.scalar(select(func.count()).select_from(model).where(*where))

    return run(work)


def give_profile(user: User) -> None:
    """A GitHub link, a technology, a bio and a name, and a verification waiting for review."""

    async def work(session):
        session.add(
            UserIdentity(
                user_id=user.id,
                provider=AuthProvider.GITHUB,
                provider_user_id=f"gh-{user.id.hex}",
                provider_username=user.username,
            )
        )
        python = await session.scalar(select(Technology).where(Technology.slug == "python"))
        session.add(UserTechnology(user_id=user.id, technology_id=python.id))
        role = await session.scalar(select(Role).where(Role.slug == "backend-engineer"))
        session.add(UserRole(user_id=user.id, role_id=role.id, is_primary=True))
        await session.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                bio="Building for market traders in Kumasi.",
                first_name="Kofi",
                last_name="Boateng",
                email=f"{user.username}@example.com",
                country_code="GH",
            )
        )
        await session.flush()
        attempt = VerificationSession(user_id=user.id, role_id=role.id)
        session.add(attempt)
        await session.commit()
        # a new attempt always starts pending; move it on as the worker would
        attempt.status = VerificationStatus.AWAITING_REVIEW
        await session.commit()

    run(work)


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def test_deleting_an_account_anonymises_it_and_ends_every_session(client: TestClient) -> None:
    user = make_user()
    give_profile(user)
    old_username = user.username

    response = delete_me(client, user, old_username.upper())

    assert response.status_code == 204, response.text
    saved = stored(User, User.id == user.id)
    assert saved.deleted_at is not None
    assert saved.username == f"deleted-{user.id.hex[:12]}"
    assert saved.display_name == "Deleted account"
    assert (saved.first_name, saved.last_name, saved.email, saved.bio, saved.country_code) == (
        None,
        None,
        None,
        None,
        None,
    )
    assert count(UserIdentity, UserIdentity.user_id == user.id) == 0
    assert count(UserTechnology, UserTechnology.user_id == user.id) == 0
    attempt = stored(VerificationSession, VerificationSession.user_id == user.id)
    assert attempt.status == VerificationStatus.ABANDONED
    assert client.get("/v1/me", headers=auth(user)).status_code == 401
    # the old GitHub name is free again for a new account
    assert count(User, func.lower(User.username) == old_username.lower()) == 0


def test_the_username_must_be_typed_to_confirm(client: TestClient) -> None:
    user = make_user()

    assert_error(delete_me(client, user, "someone-else"), 422, "CONFIRMATION_MISMATCH")
    assert client.post("/v1/me/deletion", headers=auth(user), json={}).status_code == 422
    assert stored(User, User.id == user.id).deleted_at is None


def test_an_owner_whose_hub_still_has_a_team_cannot_delete(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    assert_error(delete_me(client, owner), 409, "OWNS_HUB_WITH_TEAM")
    assert stored(User, User.id == owner.id).deleted_at is None
    assert stored(Hub, Hub.id == hub.id).status == HubStatus.ACTIVE


def test_an_owner_alone_in_their_hub_deletes_and_the_hub_is_archived(client: TestClient) -> None:
    owner, invited = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, invited, HubMemberStatus.INVITED)

    assert delete_me(client, owner).status_code == 204

    saved = stored(Hub, Hub.id == hub.id)
    assert saved.status == HubStatus.ARCHIVED and saved.archived_at is not None
    idea = stored(Idea, Idea.id == hub.idea_id)
    assert idea.status == IdeaStatus.CLOSED


def test_memberships_elsewhere_end(client: TestClient) -> None:
    user = make_user()
    hubs = {status: make_hub(make_user()) for status in ("active", "invited", "requested")}
    add_member(hubs["active"], user, HubMemberStatus.ACTIVE)
    add_member(hubs["invited"], user, HubMemberStatus.INVITED)
    add_member(hubs["requested"], user, HubMemberStatus.REQUESTED)

    assert delete_me(client, user).status_code == 204

    def status_in(hub: Hub) -> HubMemberStatus | None:
        row = stored(HubMember, HubMember.hub_id == hub.id, HubMember.user_id == user.id)
        return None if row is None else row.status

    assert status_in(hubs["active"]) == HubMemberStatus.LEFT
    assert status_in(hubs["invited"]) is None
    assert status_in(hubs["requested"]) == HubMemberStatus.DECLINED
    for hub in hubs.values():
        assert stored(Hub, Hub.id == hub.id).status == HubStatus.ACTIVE


def test_posts_stay_and_show_a_deleted_account(client: TestClient) -> None:
    author, reader = make_user(), make_user()
    post = client.post(
        "/v1/posts", headers=auth(author), json={"body": "Who else is building with USSD in Accra?"}
    )
    assert post.status_code == 201, post.text
    idea = make_idea(author)

    assert delete_me(client, author).status_code == 204

    read = client.get(f"/v1/posts/{post.json()['data']['id']}", headers=auth(reader))
    assert read.status_code == 200, read.text
    shown = read.json()["data"]["author"]
    assert shown["display_name"] == "Deleted account"
    assert shown["username"].startswith("deleted-")
    assert stored(Idea, Idea.id == idea.id).status == IdeaStatus.CLOSED
    ideas = client.get("/v1/ideas", headers=auth(reader)).json()["data"]
    assert str(idea.id) not in [card["id"] for card in ideas]
