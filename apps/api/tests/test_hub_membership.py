"""Joining a hub: invitations, the agreement, the member list and the confidential brief."""

import asyncio
from datetime import UTC, datetime, timedelta
from itertools import permutations
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

MEMBER_CARD = {"user", "member_role", "status", "decline_kind", "joined_at", "updated_at"}


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
    assert viewer == {
        "membership_status": "invited",
        "member_role": "member",
        "can_ask_again_at": None,
    }


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


def fill_team(hub: Hub, active: int) -> None:
    """Brings the hub to this many active members, the owner included."""
    for _ in range(active - 1):
        add_member(hub, make_user(), HubMemberStatus.ACTIVE)


def test_a_full_team_takes_no_more_invitations(client: TestClient) -> None:
    owner, invitee = make_user(), make_user()
    hub = make_hub(owner)
    fill_team(hub, 5)

    assert_error(invite(client, hub, owner, invitee.username), 409, "TEAM_FULL")
    assert membership(hub, invitee) is None


def test_the_fifth_member_can_join_but_not_a_sixth(client: TestClient) -> None:
    owner, fifth, sixth = make_user(), make_user(), make_user()
    hub = make_hub(owner)
    fill_team(hub, 4)
    # both are invited while there is still room
    assert invite(client, hub, owner, fifth.username).status_code == 201
    assert invite(client, hub, owner, sixth.username).status_code == 201

    assert accept(client, hub, fifth).status_code == 200
    assert_error(accept(client, hub, sixth), 409, "TEAM_FULL")
    assert membership(hub, sixth).status == HubMemberStatus.INVITED
    assert signatures(hub, sixth) == []


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

    # The hub lock runs the three one after another, in any order. Whatever the order, the
    # answers and the saved row must be the ones that order gives, never a mix of two.
    observed = (reinvite.status_code, accepted.status_code, withdrawn.status_code)
    stored = membership(hub, invitee)
    final = stored.status if stored else None
    assert (observed, final) in serial_outcomes(), (observed, final)
    assert len(signatures(hub, invitee)) == (1 if final == HubMemberStatus.ACTIVE else 0)


def serial_outcomes() -> set[tuple[tuple[int, int, int], HubMemberStatus | None]]:
    """Every (invite, accept, withdraw) answer and final status that some order produces,
    starting from a pending invitation."""

    def invite(state: HubMemberStatus | None) -> tuple[int, HubMemberStatus | None]:
        if state in (HubMemberStatus.INVITED, HubMemberStatus.ACTIVE):
            return 409, state
        return 201, HubMemberStatus.INVITED

    def accept(state: HubMemberStatus | None) -> tuple[int, HubMemberStatus | None]:
        if state == HubMemberStatus.INVITED:
            return 200, HubMemberStatus.ACTIVE
        return (409 if state == HubMemberStatus.ACTIVE else 404), state

    def withdraw(state: HubMemberStatus | None) -> tuple[int, HubMemberStatus | None]:
        if state == HubMemberStatus.INVITED:
            return 204, None
        return 404, state

    outcomes = set()
    for order in permutations((0, 1, 2)):
        state: HubMemberStatus | None = HubMemberStatus.INVITED
        codes = [0, 0, 0]
        for step in order:
            codes[step], state = (invite, accept, withdraw)[step](state)
        outcomes.add(((codes[0], codes[1], codes[2]), state))
    return outcomes


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
    assert card["viewer"] == {
        "membership_status": "active",
        "member_role": "member",
        "can_ask_again_at": None,
    }
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


# --- join requests -------------------------------------------------------------------------


def ask(client: TestClient, hub: Hub, user: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/join-requests", headers=auth(user))


def answer(client: TestClient, hub: Hub, owner: User, user: User, verdict: str) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/members/{user.id}/{verdict}", headers=auth(owner))


def test_a_developer_asks_to_join_and_the_owner_approves(client: TestClient) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    idea = client.get(f"/v1/ideas/{hub.idea_id}", headers=auth(developer)).json()["data"]
    assert idea["hub_id"] == str(hub.id)  # the open idea's card says where to ask

    asked = ask(client, hub, developer)

    assert asked.status_code == 201, asked.text
    assert asked.json()["data"]["viewer"] == {
        "membership_status": "requested",
        "member_role": "member",
        "can_ask_again_at": None,
    }
    stored = membership(hub, developer)
    assert (stored.status, stored.invited_by) == (HubMemberStatus.REQUESTED, None)
    mine = client.get("/v1/me/hubs", headers=auth(developer), params={"status": "requested"})
    assert [card["id"] for card in mine.json()["data"]] == [str(hub.id)]
    team = client.get(f"/v1/hubs/{hub.id}/members", headers=auth(owner)).json()["data"]
    assert (team[-1]["user"]["id"], team[-1]["status"]) == (str(developer.id), "requested")

    approved = answer(client, hub, owner, developer, "approve")

    assert approved.status_code == 200, approved.text
    assert set(approved.json()["data"]) == MEMBER_CARD
    assert approved.json()["data"]["status"] == "invited"
    assert membership(hub, developer).invited_by == owner.id
    # approval is an invitation: the developer joins by signing, like anyone invited
    joined = accept(client, hub, developer)
    assert joined.status_code == 200, joined.text
    assert joined.json()["data"]["member_count"] == 2
    assert membership(hub, developer).status == HubMemberStatus.ACTIVE


def wait_out(hub: Hub, user: User) -> None:
    """As if the developer's wait after a decline had passed."""
    set_membership(hub, user, can_ask_again_at=datetime.now(UTC) - timedelta(seconds=1))


def cooling_until(response: Any) -> datetime:
    assert_error(response, 409, "REQUEST_COOLING_DOWN")
    return datetime.fromisoformat(response.json()["detail"]["can_ask_again_at"])


def test_the_owner_declines_and_the_developer_may_ask_again_after_48_hours(
    client: TestClient,
) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    assert ask(client, hub, developer).status_code == 201

    declined = answer(client, hub, owner, developer, "decline")

    assert declined.status_code == 200, declined.text
    assert declined.json()["data"]["status"] == "declined"
    viewer = client.get(f"/v1/hubs/{hub.id}", headers=auth(developer)).json()["data"]["viewer"]
    assert viewer["membership_status"] == "declined"
    assert_error(accept(client, hub, developer), 404, "INVITATION_NOT_FOUND")
    until = cooling_until(ask(client, hub, developer))
    assert abs(until - (datetime.now(UTC) + timedelta(hours=48))) < timedelta(minutes=1)
    assert membership(hub, developer).status == HubMemberStatus.DECLINED
    # the card shows the same time, so the screen can say it before any press
    assert datetime.fromisoformat(viewer["can_ask_again_at"]) == until

    wait_out(hub, developer)
    card = client.get(f"/v1/hubs/{hub.id}", headers=auth(developer)).json()["data"]
    assert card["viewer"]["can_ask_again_at"] is None  # the wait is over
    assert ask(client, hub, developer).status_code == 201
    assert membership(hub, developer).status == HubMemberStatus.REQUESTED


def test_the_fifth_decline_in_a_row_means_30_days_then_the_count_starts_again(
    client: TestClient,
) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    for _ in range(4):
        assert ask(client, hub, developer).status_code == 201
        assert answer(client, hub, owner, developer, "decline").status_code == 200
        until = cooling_until(ask(client, hub, developer))
        assert until - datetime.now(UTC) < timedelta(hours=49)
        wait_out(hub, developer)

    assert ask(client, hub, developer).status_code == 201
    assert answer(client, hub, owner, developer, "decline").status_code == 200

    until = cooling_until(ask(client, hub, developer))
    assert abs(until - (datetime.now(UTC) + timedelta(days=30))) < timedelta(minutes=1)
    assert membership(hub, developer).declines_in_a_row == 0
    wait_out(hub, developer)
    assert ask(client, hub, developer).status_code == 201
    assert answer(client, hub, owner, developer, "decline").status_code == 200
    until = cooling_until(ask(client, hub, developer))
    assert until - datetime.now(UTC) < timedelta(hours=49)


def test_approval_or_joining_clears_the_count(client: TestClient) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    assert ask(client, hub, developer).status_code == 201
    assert answer(client, hub, owner, developer, "decline").status_code == 200
    wait_out(hub, developer)
    assert ask(client, hub, developer).status_code == 201

    assert answer(client, hub, owner, developer, "approve").status_code == 200

    stored = membership(hub, developer)
    assert (stored.declines_in_a_row, stored.can_ask_again_at) == (0, None)

    invited = make_user()
    add_member(hub, invited, HubMemberStatus.INVITED)
    set_membership(hub, invited, declines_in_a_row=3)
    assert accept(client, hub, invited).status_code == 200
    assert membership(hub, invited).declines_in_a_row == 0


def test_a_decline_only_holds_back_asking_the_same_hub(client: TestClient) -> None:
    developer, owner = make_user(), make_user()
    turned_down, other = make_hub(owner), make_hub(make_user())
    assert ask(client, turned_down, developer).status_code == 201
    assert answer(client, turned_down, owner, developer, "decline").status_code == 200

    assert_error(ask(client, turned_down, developer), 409, "REQUEST_COOLING_DOWN")
    assert ask(client, other, developer).status_code == 201


def test_someone_who_left_or_was_removed_may_ask_again(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    for gone in (HubMemberStatus.LEFT, HubMemberStatus.REMOVED):
        developer = make_user()
        add_member(hub, developer, gone)
        assert ask(client, hub, developer).status_code == 201
        stored = membership(hub, developer)
        assert (stored.status, stored.left_at) == (HubMemberStatus.REQUESTED, None)


def test_asking_to_join_is_refused_when_it_cannot_lead_anywhere(client: TestClient) -> None:
    owner, member, invited, requested = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)
    add_member(hub, requested, HubMemberStatus.REQUESTED)

    assert_error(ask(client, hub, owner), 409, "ALREADY_MEMBER")
    assert_error(ask(client, hub, member), 409, "ALREADY_MEMBER")
    assert_error(ask(client, hub, invited), 409, "ALREADY_INVITED")
    assert_error(ask(client, hub, requested), 409, "ALREADY_REQUESTED")
    missing = client.post(f"/v1/hubs/{uuid4()}/join-requests", headers=auth(member))
    assert_error(missing, 404, "NOT_FOUND")

    archived = make_hub(make_user(), archived=True)
    assert_error(ask(client, archived, make_user()), 409, "HUB_ARCHIVED")
    closed = make_hub(make_user())
    set_idea(closed, status=IdeaStatus.CLOSED)
    assert_error(ask(client, closed, make_user()), 409, "IDEA_CLOSED")
    full = make_hub(make_user())
    fill_team(full, 5)
    stranger = make_user()
    assert_error(ask(client, full, stranger), 409, "TEAM_FULL")
    assert membership(full, stranger) is None


def test_only_the_owner_answers_and_only_a_pending_request(client: TestClient) -> None:
    owner, member, developer = make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    assert ask(client, hub, developer).status_code == 201

    for verdict in ("approve", "decline"):
        assert_error(answer(client, hub, member, developer, verdict), 403, "NOT_HUB_OWNER")
        for nobody in (member, owner, make_user()):
            assert_error(answer(client, hub, owner, nobody, verdict), 404, "REQUEST_NOT_FOUND")
    assert membership(hub, developer).status == HubMemberStatus.REQUESTED


def test_approving_into_a_full_team_waits_for_room(client: TestClient) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    assert ask(client, hub, developer).status_code == 201
    fill_team(hub, 5)

    assert_error(answer(client, hub, owner, developer, "approve"), 409, "TEAM_FULL")
    assert membership(hub, developer).status == HubMemberStatus.REQUESTED
    # declining needs no room
    assert answer(client, hub, owner, developer, "decline").status_code == 200


def test_an_archived_hub_takes_no_approvals_but_can_decline(client: TestClient) -> None:
    owner, waiting, other = make_user(), make_user(), make_user()
    hub = make_hub(owner, archived=True)
    add_member(hub, waiting, HubMemberStatus.REQUESTED)
    add_member(hub, other, HubMemberStatus.REQUESTED)

    assert_error(answer(client, hub, owner, waiting, "approve"), 409, "HUB_ARCHIVED")
    assert answer(client, hub, owner, other, "decline").status_code == 200


def withdraw(client: TestClient, hub: Hub, user: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/join-request/withdraw", headers=auth(user))


def test_a_developer_withdraws_their_request(client: TestClient) -> None:
    owner, developer = make_user(), make_user()
    hub = make_hub(owner)
    assert ask(client, hub, developer).status_code == 201
    set_membership(hub, developer, declines_in_a_row=2)  # turned down twice before

    withdrawn = withdraw(client, hub, developer)

    assert withdrawn.status_code == 200, withdrawn.text
    viewer = withdrawn.json()["data"]["viewer"]
    assert (viewer["membership_status"], viewer["can_ask_again_at"]) == ("declined", None)
    stored = membership(hub, developer)
    assert (stored.status, stored.declines_in_a_row) == (HubMemberStatus.DECLINED, 2)
    assert_error(answer(client, hub, owner, developer, "approve"), 404, "REQUEST_NOT_FOUND")
    # no wait: the owner said nothing
    assert ask(client, hub, developer).status_code == 201


def test_the_owner_sees_which_no_ended_each_declined_row(client: TestClient) -> None:
    owner, invitee, turned_down, withdrew = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    assert invite(client, hub, owner, invitee.username).status_code == 201
    assert decline(client, hub, invitee).status_code == 200
    for developer in (turned_down, withdrew):
        assert ask(client, hub, developer).status_code == 201
    assert answer(client, hub, owner, turned_down, "decline").status_code == 200
    assert withdraw(client, hub, withdrew).status_code == 200

    rows = client.get(f"/v1/hubs/{hub.id}/members", headers=auth(owner)).json()["data"]

    kinds = {row["user"]["id"]: (row["status"], row["decline_kind"]) for row in rows}
    assert kinds == {
        str(owner.id): ("active", None),
        str(invitee.id): ("declined", "invitation_declined"),
        str(turned_down.id): ("declined", "request_declined"),
        str(withdrew.id): ("declined", "request_withdrawn"),
    }
    # asking or being invited again starts afresh, so the old "no" is gone
    wait_out(hub, turned_down)
    assert ask(client, hub, turned_down).status_code == 201
    assert invite(client, hub, owner, withdrew.username).json()["data"]["decline_kind"] is None
    assert membership(hub, turned_down).decline_kind is None


def test_only_a_pending_request_can_be_withdrawn(client: TestClient) -> None:
    owner, member, invited, stranger = make_user(), make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    add_member(hub, invited, HubMemberStatus.INVITED)

    for nobody in (owner, member, invited, stranger):
        assert_error(withdraw(client, hub, nobody), 404, "REQUEST_NOT_FOUND")
    assert membership(hub, invited).status == HubMemberStatus.INVITED
    missing = client.post(f"/v1/hubs/{uuid4()}/join-request/withdraw", headers=auth(member))
    assert_error(missing, 404, "NOT_FOUND")


def test_a_request_to_an_archived_hub_can_still_be_withdrawn(client: TestClient) -> None:
    developer = make_user()
    hub = make_hub(make_user(), archived=True)
    add_member(hub, developer, HubMemberStatus.REQUESTED)

    assert withdraw(client, hub, developer).status_code == 200


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
    ("post", f"/v1/hubs/{HUB}/join-requests"),
    ("post", f"/v1/hubs/{HUB}/join-request/withdraw"),
    ("post", f"/v1/hubs/{HUB}/members/{HUB}/approve"),
    ("post", f"/v1/hubs/{HUB}/members/{HUB}/decline"),
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
