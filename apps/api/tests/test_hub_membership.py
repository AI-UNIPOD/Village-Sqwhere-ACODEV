"""Joining a hub: invitations, the agreement, the member list and the confidential brief."""

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.main import app
from app.models import (
    AgreementSignature,
    Hub,
    HubMember,
    HubMemberStatus,
    Idea,
    IdeaStatus,
    User,
)
from tests.hub_support import (
    add_member,
    auth,
    bad_auth_headers,
    current_template,
    make_hub,
    make_user,
    run,
)

MEMBER_CARD = {"user", "member_role", "status", "joined_at", "updated_at"}


def invite(client: TestClient, hub: Hub, owner: User, username: str) -> Any:
    return client.post(
        f"/v1/hubs/{hub.id}/invitations", headers=auth(owner), json={"username": username}
    )


def signed(hub: Hub, *, legal_name: str = "Kwame Mensah", **changes: Any) -> dict[str, Any]:
    template = current_template()
    assert template.id == hub.agreement_template_id
    payload = {
        "template_id": str(template.id),
        "template_sha256": template.body_sha256,
        "signed_legal_name": legal_name,
    }
    payload.update(changes)
    return payload


def accept(client: TestClient, hub: Hub, user: User, payload: dict[str, Any] | None = None) -> Any:
    return client.post(
        f"/v1/hubs/{hub.id}/invitation/accept",
        headers={**auth(user), "User-Agent": "village-tests"},
        json=payload or signed(hub),
    )


def decline(client: TestClient, hub: Hub, user: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/invitation/decline", headers=auth(user))


def membership(hub: Hub, user: User) -> HubMember | None:
    async def work(session):
        result = await session.execute(
            select(HubMember).where(HubMember.hub_id == hub.id, HubMember.user_id == user.id)
        )
        return result.scalar_one_or_none()

    return run(work)


def signatures(hub: Hub, user: User) -> list[AgreementSignature]:
    async def work(session):
        result = await session.execute(
            select(AgreementSignature).where(
                AgreementSignature.hub_id == hub.id, AgreementSignature.user_id == user.id
            )
        )
        return list(result.scalars())

    return run(work)


def set_membership(hub: Hub, user: User, **values: Any) -> None:
    async def work(session):
        await session.execute(
            update(HubMember)
            .where(HubMember.hub_id == hub.id, HubMember.user_id == user.id)
            .values(**values)
        )
        await session.commit()

    run(work)


def set_idea(hub: Hub, **values: Any) -> None:
    async def work(session):
        await session.execute(update(Idea).where(Idea.id == hub.idea_id).values(**values))
        await session.commit()

    run(work)


def delete_user(user: User) -> None:
    async def work(session):
        await session.execute(
            update(User).where(User.id == user.id).values(deleted_at=datetime.now(UTC))
        )
        await session.commit()

    run(work)


def count_members(hub: Hub) -> int:
    async def work(session):
        result = await session.execute(
            select(func.count()).select_from(HubMember).where(HubMember.hub_id == hub.id)
        )
        return result.scalar_one()

    return run(work)


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


# --- invitations ---------------------------------------------------------------------------


def test_the_owner_invites_a_developer_by_username(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)

    response = invite(client, hub, owner, invitee.username.upper())

    assert response.status_code == 201, response.text
    card = response.json()["data"]
    assert set(card) == MEMBER_CARD
    assert card["user"]["id"] == str(invitee.id)
    assert card["user"]["username"] == invitee.username
    assert (card["status"], card["member_role"], card["joined_at"]) == ("invited", "member", None)
    stored = membership(hub, invitee)
    assert stored is not None
    assert stored.status == HubMemberStatus.INVITED
    assert stored.invited_by == owner.id
    assert stored.signature_id is None
    viewer = client.get(f"/v1/hubs/{hub.id}", headers=auth(invitee)).json()["data"]["viewer"]
    assert viewer == {"membership_status": "invited", "member_role": "member"}


def test_only_the_owner_can_invite_or_withdraw(client: TestClient) -> None:
    owner, member, stranger, invitee = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invitee, HubMemberStatus.INVITED)

    for caller in (member, stranger):
        assert_error(invite(client, hub, caller, make_user().username), 403, "NOT_HUB_OWNER")
        response = client.delete(
            f"/v1/hubs/{hub.id}/invitations/{invitee.id}", headers=auth(caller)
        )
        assert_error(response, 403, "NOT_HUB_OWNER")
    assert membership(hub, invitee).status == HubMemberStatus.INVITED


def test_inviting_someone_who_cannot_be_invited_is_refused(client: TestClient) -> None:
    owner, member, invited, gone = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)
    delete_user(gone)

    assert_error(invite(client, hub, owner, owner.username), 409, "ALREADY_MEMBER")
    assert_error(invite(client, hub, owner, member.username), 409, "ALREADY_MEMBER")
    assert_error(invite(client, hub, owner, invited.username), 409, "ALREADY_INVITED")
    assert_error(invite(client, hub, owner, gone.username), 404, "USER_NOT_FOUND")
    assert_error(invite(client, hub, owner, "nobody-by-this-name"), 404, "USER_NOT_FOUND")
    assert count_members(hub) == 3


@pytest.mark.parametrize(
    "earlier", [HubMemberStatus.DECLINED, HubMemberStatus.LEFT, HubMemberStatus.REMOVED]
)
def test_someone_who_declined_or_left_can_be_invited_again(
    client: TestClient, earlier: HubMemberStatus
) -> None:
    owner, person = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, person, earlier)

    response = invite(client, hub, owner, person.username)

    assert response.status_code == 201, response.text
    stored = membership(hub, person)
    assert stored.status == HubMemberStatus.INVITED
    assert stored.left_at is None
    assert stored.invited_by == owner.id


def test_an_archived_hub_takes_no_invitations_or_acceptances(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner, archived=True)
    add_member(hub, invitee, HubMemberStatus.INVITED)

    assert_error(invite(client, hub, owner, make_user().username), 409, "HUB_ARCHIVED")
    assert_error(accept(client, hub, invitee), 409, "HUB_ARCHIVED")
    assert membership(hub, invitee).status == HubMemberStatus.INVITED


def test_a_closed_idea_does_not_stop_its_hub_from_inviting(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    set_idea(hub, status=IdeaStatus.CLOSED)

    assert invite(client, hub, owner, invitee.username).status_code == 201
    assert accept(client, hub, invitee).status_code == 200


def test_two_answers_at_once_leave_one_consistent_result() -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, invitee, HubMemberStatus.INVITED)
    agreement = signed(hub)

    async def at_once() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            return list(
                await asyncio.gather(
                    http.post(
                        f"/v1/hubs/{hub.id}/invitations",
                        headers=auth(owner),
                        json={"username": invitee.username},
                    ),
                    http.post(
                        f"/v1/hubs/{hub.id}/invitation/accept",
                        headers=auth(invitee),
                        json=agreement,
                    ),
                    http.delete(f"/v1/hubs/{hub.id}/invitations/{invitee.id}", headers=auth(owner)),
                )
            )

    reinvite, accepted, withdrawn = asyncio.run(at_once())

    # The three wait on the hub's lock in whatever order they arrive, so check what holds in
    # every order: each answer is a real one, and the stored state agrees with the answers.
    assert reinvite.status_code in (201, 409)
    assert accepted.status_code in (200, 404)
    assert withdrawn.status_code in (204, 404)
    if reinvite.status_code == 201:
        assert withdrawn.status_code == 204  # only a withdrawn invitation can be sent again
    stored = membership(hub, invitee)
    if accepted.status_code == 200:
        assert stored.status == HubMemberStatus.ACTIVE
        assert len(signatures(hub, invitee)) == 1
    else:
        assert signatures(hub, invitee) == []
        if reinvite.status_code == 201:
            assert stored.status == HubMemberStatus.INVITED
        else:
            assert stored is None


@pytest.mark.parametrize(
    "body",
    [{}, {"username": "ab"}, {"username": "has space"}, {"username": "ok-name", "role": "owner"}],
)
def test_an_invitation_needs_one_valid_username(client: TestClient, body: dict) -> None:
    owner = make_user()
    hub = make_hub(owner)

    response = client.post(f"/v1/hubs/{hub.id}/invitations", headers=auth(owner), json=body)

    assert response.status_code == 422


def test_the_owner_withdraws_a_pending_invitation(client: TestClient) -> None:
    owner, invitee, member = make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    assert invite(client, hub, owner, invitee.username).status_code == 201
    url = f"/v1/hubs/{hub.id}/invitations/{invitee.id}"

    response = client.delete(url, headers=auth(owner))

    assert response.status_code == 204
    assert response.content == b""
    assert membership(hub, invitee) is None
    assert_error(accept(client, hub, invitee), 404, "INVITATION_NOT_FOUND")
    assert_error(client.delete(url, headers=auth(owner)), 404, "INVITATION_NOT_FOUND")
    active = f"/v1/hubs/{hub.id}/invitations/{member.id}"
    assert_error(client.delete(active, headers=auth(owner)), 404, "INVITATION_NOT_FOUND")
    assert membership(hub, member).status == HubMemberStatus.ACTIVE


# --- accepting and declining ---------------------------------------------------------------


def test_accepting_signs_the_hubs_agreement_and_joins(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner, terms={"ownership_model": "custom", "notes": "Shares by commits."})
    assert invite(client, hub, owner, invitee.username).status_code == 201

    response = accept(client, hub, invitee)

    assert response.status_code == 200, response.text
    card = response.json()["data"]
    assert card["viewer"] == {"membership_status": "active", "member_role": "member"}
    assert card["member_count"] == 2
    stored = membership(hub, invitee)
    assert stored.status == HubMemberStatus.ACTIVE
    assert stored.joined_at is not None
    [signature] = signatures(hub, invitee)
    assert stored.signature_id == signature.id
    assert signature.signed_legal_name == "Kwame Mensah"
    assert signature.template_id == hub.agreement_template_id
    assert signature.terms_snapshot == {"ownership_model": "custom", "notes": "Shares by commits."}
    assert signature.user_agent == "village-tests"


@pytest.mark.parametrize(
    "changes",
    [{"template_sha256": "0" * 64}, {"template_id": str(uuid4())}],
    ids=["other text", "other template"],
)
def test_accepting_a_different_agreement_is_refused(
    client: TestClient, changes: dict[str, str]
) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, invitee, HubMemberStatus.INVITED)

    response = accept(client, hub, invitee, signed(hub, **changes))

    assert_error(response, 409, "AGREEMENT_MISMATCH")
    assert membership(hub, invitee).status == HubMemberStatus.INVITED
    assert signatures(hub, invitee) == []


@pytest.mark.parametrize(
    "earlier",
    [None, HubMemberStatus.DECLINED, HubMemberStatus.LEFT, HubMemberStatus.REMOVED],
)
def test_only_a_pending_invitation_can_be_answered(
    client: TestClient, earlier: HubMemberStatus | None
) -> None:
    owner, person = make_user(), make_user()
    hub = make_hub(owner)
    if earlier is not None:
        add_member(hub, person, earlier)

    assert_error(accept(client, hub, person), 404, "INVITATION_NOT_FOUND")
    assert_error(decline(client, hub, person), 404, "INVITATION_NOT_FOUND")
    assert signatures(hub, person) == []


def test_an_active_member_cannot_answer_again(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    assert_error(accept(client, hub, member), 409, "ALREADY_MEMBER")
    assert_error(decline(client, hub, member), 409, "ALREADY_MEMBER")
    assert membership(hub, member).status == HubMemberStatus.ACTIVE


def test_declining_keeps_the_answer_and_the_owner_may_ask_again(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    assert invite(client, hub, owner, invitee.username).status_code == 201

    response = decline(client, hub, invitee)

    assert response.status_code == 200, response.text
    assert response.json()["data"]["viewer"]["membership_status"] == "declined"
    assert response.json()["data"]["member_count"] == 1
    assert_error(accept(client, hub, invitee), 404, "INVITATION_NOT_FOUND")
    assert invite(client, hub, owner, invitee.username).status_code == 201
    assert accept(client, hub, invitee).status_code == 200


def test_rejoining_reuses_the_earlier_signature_of_the_same_agreement(
    client: TestClient,
) -> None:
    owner, person = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, person, HubMemberStatus.ACTIVE)
    [first] = signatures(hub, person)
    set_membership(hub, person, status=HubMemberStatus.LEFT, left_at=datetime.now(UTC))
    assert invite(client, hub, owner, person.username).status_code == 201

    response = accept(client, hub, person, signed(hub, legal_name="Another Name"))

    assert response.status_code == 200, response.text
    assert [signature.id for signature in signatures(hub, person)] == [first.id]
    assert membership(hub, person).signature_id == first.id


def test_a_hubs_agreement_is_the_version_it_was_created_on(client: TestClient) -> None:
    hub = make_hub(make_user(), terms={"ownership_model": "owner_majority"})
    template = current_template()

    response = client.get(f"/v1/hubs/{hub.id}/agreement", headers=auth(make_user()))

    assert response.status_code == 200, response.text
    agreement = response.json()["data"]
    assert agreement["template_id"] == str(hub.agreement_template_id)
    assert agreement["body_sha256"] == template.body_sha256
    assert agreement["body"] == template.body
    assert agreement["hub_terms"] == {"ownership_model": "owner_majority"}
    missing = client.get(f"/v1/hubs/{uuid4()}/agreement", headers=auth(make_user()))
    assert_error(missing, 404, "NOT_FOUND")


# --- what members see ----------------------------------------------------------------------


def test_only_active_members_read_the_confidential_brief(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    outsiders = [make_user()]
    for status in (
        HubMemberStatus.INVITED,
        HubMemberStatus.DECLINED,
        HubMemberStatus.LEFT,
        HubMemberStatus.REMOVED,
    ):
        outsider = make_user()
        add_member(hub, outsider, status)
        outsiders.append(outsider)

    for reader in (owner, member):
        response = client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(reader))
        assert response.status_code == 200, response.text
        brief = response.json()["data"]
        assert brief["id"] == str(hub.idea_id)
        assert brief["details"] == "Confidential plan, for hub members only."
        assert brief["status"] == "open"
    for outsider in outsiders:
        response = client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(outsider))
        assert_error(response, 403, "NOT_HUB_MEMBER")
        assert "Confidential plan" not in response.text
    missing = client.get(f"/v1/hubs/{uuid4()}/idea", headers=auth(owner))
    assert_error(missing, 404, "NOT_FOUND")


def test_a_deleted_ideas_brief_is_gone_for_members_too(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    set_idea(hub, deleted_at=datetime.now(UTC))

    response = client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(owner))

    assert_error(response, 404, "NOT_FOUND")
    assert "Confidential plan" not in response.text


def test_accepting_opens_the_brief(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    assert invite(client, hub, owner, invitee.username).status_code == 201
    url = f"/v1/hubs/{hub.id}/idea"

    assert_error(client.get(url, headers=auth(invitee)), 403, "NOT_HUB_MEMBER")
    assert accept(client, hub, invitee).status_code == 200
    assert client.get(url, headers=auth(invitee)).status_code == 200


def test_the_owner_sees_pending_people_and_members_see_the_team(client: TestClient) -> None:
    owner, member, invited, declined, left = (make_user() for _ in range(5))
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)
    add_member(hub, declined, HubMemberStatus.DECLINED)
    add_member(hub, left, HubMemberStatus.LEFT)
    url = f"/v1/hubs/{hub.id}/members"

    as_owner = client.get(url, headers=auth(owner))
    as_member = client.get(url, headers=auth(member))

    assert as_owner.status_code == 200, as_owner.text
    rows = as_owner.json()["data"]
    assert set(rows[0]) == MEMBER_CARD
    assert [(row["user"]["id"], row["status"]) for row in rows] == [
        (str(owner.id), "active"),
        (str(member.id), "active"),
        (str(invited.id), "invited"),
        (str(declined.id), "declined"),
    ]
    assert rows[0]["member_role"] == "owner"
    assert [row["user"]["id"] for row in as_member.json()["data"]] == [
        str(owner.id),
        str(member.id),
    ]
    for outsider in (invited, declined, left, make_user()):
        assert_error(client.get(url, headers=auth(outsider)), 403, "NOT_HUB_MEMBER")
    assert_error(client.get(f"/v1/hubs/{uuid4()}/members", headers=auth(owner)), 404, "NOT_FOUND")


# --- sign-in and malformed ids -------------------------------------------------------------

HUB = "00000000-0000-4000-8000-000000000000"
ROUTES = [
    ("get", f"/v1/hubs/{HUB}/agreement"),
    ("get", f"/v1/hubs/{HUB}/idea"),
    ("get", f"/v1/hubs/{HUB}/members"),
    ("post", f"/v1/hubs/{HUB}/invitations"),
    ("delete", f"/v1/hubs/{HUB}/invitations/{HUB}"),
    ("post", f"/v1/hubs/{HUB}/invitation/accept"),
    ("post", f"/v1/hubs/{HUB}/invitation/decline"),
]


@pytest.mark.parametrize(("method", "url"), ROUTES)
@pytest.mark.parametrize("headers", bad_auth_headers().values(), ids=bad_auth_headers().keys())
def test_every_membership_route_needs_sign_in(
    client: TestClient, method: str, url: str, headers: dict[str, str]
) -> None:
    response = client.request(method.upper(), url, headers=headers)

    assert response.status_code == 401, response.text


@pytest.mark.parametrize(("method", "url"), ROUTES)
def test_a_malformed_hub_id_is_a_validation_error(
    client: TestClient, method: str, url: str
) -> None:
    response = client.request(
        method.upper(), url.replace(HUB, "not-a-uuid", 1), headers=auth(make_user())
    )

    assert response.status_code == 422
