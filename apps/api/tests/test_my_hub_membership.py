"""GET /v1/hubs/{hub_id}/membership: my own place in a hub and what I signed."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.models import Hub, HubMember, HubMemberStatus, User
from tests.hub_support import add_member, auth, current_template, make_hub, make_user, run


def mine(client: TestClient, hub: Hub, user: User):
    return client.get(f"/v1/hubs/{hub.id}/membership", headers=auth(user))


def set_membership(hub: Hub, user: User, **values) -> None:
    async def work(session):
        await session.execute(
            update(HubMember)
            .where(HubMember.hub_id == hub.id, HubMember.user_id == user.id)
            .values(**values)
        )
        await session.commit()

    run(work)


def test_an_active_member_sees_their_membership_and_signature(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    response = mine(client, hub, member)

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "active" and data["member_role"] == "member"
    assert data["joined_at"] is not None and data["left_at"] is None
    template = current_template()
    signature = data["signature"]
    assert signature["template_id"] == str(template.id)
    assert signature["version"] == template.version
    assert signature["template_sha256"] == template.body_sha256
    assert signature["signed_legal_name"] == "Kwame Mensah"
    assert isinstance(signature["terms_snapshot"], dict)
    assert set(signature) == {
        "template_id",
        "version",
        "template_sha256",
        "signed_legal_name",
        "terms_snapshot",
        "signed_at",
    }


def test_the_owner_sees_the_signature_they_gave_when_creating_the_hub(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    data = mine(client, hub, owner).json()["data"]

    assert data["member_role"] == "owner" and data["status"] == "active"
    assert data["signature"] is not None


def test_an_invited_person_has_no_signature_yet(client: TestClient) -> None:
    owner, invited = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, invited, HubMemberStatus.INVITED)

    data = mine(client, hub, invited).json()["data"]

    assert data["status"] == "invited" and data["signature"] is None and data["joined_at"] is None


def test_someone_who_left_keeps_the_signature_they_gave(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    set_membership(hub, member, status=HubMemberStatus.LEFT, left_at=datetime.now(UTC))

    data = mine(client, hub, member).json()["data"]

    assert data["status"] == "left" and data["left_at"] is not None
    assert data["signature"]["signed_legal_name"] == "Kwame Mensah"


def test_the_wait_before_asking_again_shows_only_while_it_is_ahead(client: TestClient) -> None:
    owner, declined = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, declined, HubMemberStatus.DECLINED)
    later = datetime.now(UTC) + timedelta(hours=10)
    set_membership(hub, declined, can_ask_again_at=later)
    assert mine(client, hub, declined).json()["data"]["can_ask_again_at"] is not None

    set_membership(hub, declined, can_ask_again_at=datetime.now(UTC) - timedelta(hours=1))
    assert mine(client, hub, declined).json()["data"]["can_ask_again_at"] is None


def test_someone_with_no_membership_is_told_so(client: TestClient) -> None:
    hub = make_hub(make_user())
    response = mine(client, hub, make_user())

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "MEMBERSHIP_NOT_FOUND"
    missing = client.get(
        "/v1/hubs/00000000-0000-4000-8000-000000000000/membership", headers=auth(make_user())
    )
    assert missing.json()["detail"]["code"] == "NOT_FOUND"
