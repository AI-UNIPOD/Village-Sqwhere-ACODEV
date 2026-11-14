"""Leaving a hub and removing a member: docs/decisions/2026-11-14-leaving-and-removing-members.md"""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import AgreementSignature, Hub, HubMember, HubMemberStatus, User
from tests.hub_support import add_member, auth, current_template, make_hub, make_user, run


def leave(client: TestClient, hub: Hub, user: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/membership/leave", headers=auth(user))


def remove(client: TestClient, hub: Hub, owner: User, user: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/members/{user.id}/remove", headers=auth(owner))


def row(hub: Hub, user: User) -> tuple[HubMember, int]:
    """The membership and how many signatures the person has for this hub."""

    async def work(session):
        member = await session.scalar(
            select(HubMember).where(HubMember.hub_id == hub.id, HubMember.user_id == user.id)
        )
        signatures = (
            await session.scalars(
                select(AgreementSignature).where(
                    AgreementSignature.hub_id == hub.id, AgreementSignature.user_id == user.id
                )
            )
        ).all()
        return member, len(signatures)

    return run(work)


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def test_a_member_leaves_and_loses_the_team_and_the_brief(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    response = leave(client, hub, member)

    assert response.status_code == 200, response.text
    card = response.json()["data"]
    assert card["viewer"]["membership_status"] == "left"
    assert card["member_count"] == 1
    saved, signatures = row(hub, member)
    assert saved.status == HubMemberStatus.LEFT and saved.left_at is not None
    assert signatures == 1  # what they signed still binds them
    assert_error(client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(member)), 403, "NOT_HUB_MEMBER")
    team = client.get(f"/v1/hubs/{hub.id}/members", headers=auth(owner)).json()["data"]
    assert [card["user"]["username"] for card in team] == [owner.username]


def test_only_an_active_member_who_is_not_the_owner_can_leave(client: TestClient) -> None:
    owner, invited, stranger = make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, invited, HubMemberStatus.INVITED)

    assert_error(leave(client, hub, owner), 409, "OWNER_CANNOT_LEAVE")
    assert_error(leave(client, hub, invited), 404, "MEMBERSHIP_NOT_FOUND")
    assert_error(leave(client, hub, stranger), 404, "MEMBERSHIP_NOT_FOUND")
    assert row(hub, invited)[0].status == HubMemberStatus.INVITED


def test_a_member_can_leave_an_archived_hub(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner, archived=True)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    assert leave(client, hub, member).status_code == 200


def test_the_owner_removes_an_active_member(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    response = remove(client, hub, owner, member)

    assert response.status_code == 200, response.text
    card = response.json()["data"]
    assert card["user"]["username"] == member.username
    assert card["status"] == "removed"
    saved, signatures = row(hub, member)
    assert saved.status == HubMemberStatus.REMOVED and saved.left_at is not None
    assert signatures == 1
    assert_error(client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(member)), 403, "NOT_HUB_MEMBER")
    viewer = client.get(f"/v1/hubs/{hub.id}", headers=auth(member)).json()["data"]["viewer"]
    assert viewer["membership_status"] == "removed"


def test_removing_is_refused_when_it_cannot_apply(client: TestClient) -> None:
    owner, member, invited, stranger = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)

    assert_error(remove(client, hub, member, owner), 403, "NOT_HUB_OWNER")
    assert_error(remove(client, hub, owner, owner), 409, "CANNOT_REMOVE_OWNER")
    assert_error(remove(client, hub, owner, invited), 404, "MEMBER_NOT_FOUND")
    assert_error(remove(client, hub, owner, stranger), 404, "MEMBER_NOT_FOUND")
    archived_owner = make_user()
    archived = make_hub(archived_owner, archived=True)
    add_member(archived, stranger, HubMemberStatus.ACTIVE)
    assert_error(remove(client, archived, archived_owner, stranger), 409, "HUB_ARCHIVED")
    assert row(hub, member)[0].status == HubMemberStatus.ACTIVE


def test_someone_removed_can_be_invited_back_and_signs_nothing_new(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    remove(client, hub, owner, member)

    invited = client.post(
        f"/v1/hubs/{hub.id}/invitations", headers=auth(owner), json={"username": member.username}
    )
    assert invited.status_code == 201, invited.text
    template = current_template()
    accepted = client.post(
        f"/v1/hubs/{hub.id}/invitation/accept",
        headers=auth(member),
        json={
            "template_id": str(template.id),
            "template_sha256": template.body_sha256,
            "signed_legal_name": "Kwame Mensah",
        },
    )

    assert accepted.status_code == 200, accepted.text
    saved, signatures = row(hub, member)
    assert saved.status == HubMemberStatus.ACTIVE and saved.left_at is None
    assert signatures == 1
