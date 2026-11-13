"""GET /v1/hubs/{hub_id}: any signed-in user sees a hub's card and their own place in it.

The card never shows the idea's confidential details, nor the signer's IP address or user
agent, whoever asks.
"""

from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgreementSignature, Hub, HubMember, HubMemberStatus
from tests.hub_support import (
    add_member,
    auth,
    bad_auth_headers,
    make_hub,
    make_user,
    run,
)

HUB_FIELDS = {
    "id",
    "name",
    "description",
    "status",
    "terms",
    "idea",
    "owner",
    "member_count",
    "agreement",
    "created_at",
    "updated_at",
    "archived_at",
    "viewer",
}


def url(hub_id: object) -> str:
    return f"/v1/hubs/{hub_id}"


def count_hub_rows() -> tuple[int, int, int]:
    async def work(session: AsyncSession) -> tuple[int, int, int]:
        counts = []
        for model in (Hub, AgreementSignature, HubMember):
            result = await session.execute(select(func.count()).select_from(model))
            counts.append(result.scalar_one())
        return counts[0], counts[1], counts[2]

    return run(work)


def is_aware_iso(value: str) -> bool:
    return datetime.fromisoformat(value).tzinfo is not None


# --- success ------------------------------------------------------------------------------


def test_the_owner_sees_exactly_the_hub_card(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner, terms={"ownership_model": "custom", "notes": "Partage égal 🤝"})

    resp = client.get(url(hub.id), headers=auth(owner))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"data"}
    card = body["data"]
    assert set(card) == HUB_FIELDS
    assert card["id"] == str(hub.id)
    assert card["name"] == "Farm Ledger Hub"
    assert card["description"] == "Building the offline ledger MVP in Kano."
    assert card["status"] == "active"
    assert card["terms"] == {"ownership_model": "custom", "notes": "Partage égal 🤝"}
    assert set(card["idea"]) == {"id", "title", "summary"}
    assert card["idea"]["id"] == str(hub.idea_id)
    assert card["owner"] == {
        "id": str(owner.id),
        "username": owner.username,
        "display_name": owner.display_name,
        "avatar_url": None,
        "is_verified": False,
    }
    assert card["member_count"] == 1
    assert card["agreement"]["template_id"] == str(hub.agreement_template_id)
    assert set(card["agreement"]) == {"template_id", "version"}
    assert card["viewer"] == {
        "membership_status": "active",
        "member_role": "owner",
        "can_ask_again_at": None,
    }
    assert card["archived_at"] is None
    assert is_aware_iso(card["created_at"]) and is_aware_iso(card["updated_at"])


def test_a_signed_in_stranger_sees_the_card_with_no_membership(client: TestClient) -> None:
    hub = make_hub(make_user())

    resp = client.get(url(hub.id), headers=auth(make_user()))

    assert resp.status_code == 200, resp.text
    card = resp.json()["data"]
    assert card["viewer"] == {
        "membership_status": None,
        "member_role": None,
        "can_ask_again_at": None,
    }
    assert card["name"] == "Farm Ledger Hub"
    assert card["member_count"] == 1


@pytest.mark.parametrize("status", list(HubMemberStatus))
def test_the_viewer_shows_the_callers_own_membership_in_every_status(
    client: TestClient, status: HubMemberStatus
) -> None:
    hub = make_hub(make_user())
    member = make_user()
    add_member(hub, member, status)

    resp = client.get(url(hub.id), headers=auth(member))

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["viewer"] == {
        "membership_status": status.value,
        "member_role": "member",
        "can_ask_again_at": None,
    }


@pytest.mark.parametrize("who", ["owner", "active member", "invited", "stranger", "left"])
def test_nobody_sees_the_idea_details_or_the_signature_evidence(
    client: TestClient, who: str
) -> None:
    owner = make_user()
    hub = make_hub(owner)
    caller = owner if who == "owner" else make_user()
    statuses = {
        "active member": HubMemberStatus.ACTIVE,
        "invited": HubMemberStatus.INVITED,
        "left": HubMemberStatus.LEFT,
    }
    if who in statuses:
        add_member(hub, caller, statuses[who])

    resp = client.get(url(hub.id), headers=auth(caller))

    assert resp.status_code == 200, resp.text
    assert "details" not in resp.json()["data"]["idea"]
    assert "Confidential" not in resp.text
    for evidence in ("ip_address", "user_agent", "signed_legal_name", "terms_snapshot"):
        assert evidence not in resp.text


def test_member_count_counts_only_active_members(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    for status in HubMemberStatus:
        add_member(hub, make_user(), status)

    resp = client.get(url(hub.id), headers=auth(owner))

    # the owner and the one active member; requested, invited, declined, left and removed
    # members are not counted
    assert resp.json()["data"]["member_count"] == 2


def test_an_archived_hub_can_still_be_read(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner, archived=True)

    for caller in (owner, make_user()):
        resp = client.get(url(hub.id), headers=auth(caller))
        assert resp.status_code == 200, resp.text
        card = resp.json()["data"]
        assert card["status"] == "archived"
        assert is_aware_iso(card["archived_at"])


def test_reading_a_hub_saves_nothing(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    stranger = make_user()
    before = count_hub_rows()

    for caller in (owner, stranger):
        assert client.get(url(hub.id), headers=auth(caller)).status_code == 200
    assert count_hub_rows() == before


def test_the_same_hub_reads_the_same_way_twice(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    first = client.get(url(hub.id), headers=auth(owner)).json()
    second = client.get(url(hub.id), headers=auth(owner)).json()

    assert first == second


# --- sign-in ------------------------------------------------------------------------------


@pytest.mark.parametrize("case", list(bad_auth_headers()))
def test_refuses_a_request_that_is_not_signed_in(client: TestClient, case: str) -> None:
    hub = make_hub(make_user())

    resp = client.get(url(hub.id), headers=bad_auth_headers()[case])

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] in {"UNAUTHENTICATED", "TOKEN_EXPIRED"}
    assert "Farm Ledger Hub" not in resp.text


def test_refuses_a_deleted_user_even_the_owner(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    async def delete_owner(session: AsyncSession) -> None:
        saved = await session.get(type(owner), owner.id)
        assert saved is not None
        saved.deleted_at = datetime.now().astimezone()
        await session.commit()

    run(delete_owner)

    resp = client.get(url(hub.id), headers=auth(owner))

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"


# --- not found ----------------------------------------------------------------------------


def test_a_hub_that_does_not_exist_is_not_found(client: TestClient) -> None:
    resp = client.get(url(uuid4()), headers=auth(make_user()))

    assert resp.status_code == 404
    assert resp.json()["detail"] == {"code": "NOT_FOUND", "message": "Hub not found."}


@pytest.mark.parametrize("bad", ["not-a-uuid", "123", "' OR 1=1 --", "%20"])
def test_a_malformed_hub_id_is_refused(client: TestClient, bad: str) -> None:
    resp = client.get(url(bad), headers=auth(make_user()))

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["path", "hub_id"]
