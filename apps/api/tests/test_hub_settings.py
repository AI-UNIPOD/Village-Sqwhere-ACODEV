"""The owner renames, describes and archives a hub.

Why: docs/decisions/2026-11-14-hub-edit-and-archive.md
"""

from typing import Any

from fastapi.testclient import TestClient

from app.models import Hub, HubMemberStatus, User
from tests.hub_support import add_member, auth, make_hub, make_user


def edit(client: TestClient, hub: Hub, caller: User, body: dict[str, Any]) -> Any:
    return client.patch(f"/v1/hubs/{hub.id}", headers=auth(caller), json=body)


def archive(client: TestClient, hub: Hub, caller: User) -> Any:
    return client.post(f"/v1/hubs/{hub.id}/archive", headers=auth(caller))


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def test_the_owner_renames_and_describes_the_hub(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    renamed = edit(client, hub, owner, {"name": "  Susu Ledger Hub  "})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "Susu Ledger Hub"

    described = edit(client, hub, owner, {"description": "Weekly calls on Thursdays, Lagos time."})
    assert described.json()["data"]["name"] == "Susu Ledger Hub"
    assert described.json()["data"]["description"] == "Weekly calls on Thursdays, Lagos time."

    cleared = edit(client, hub, owner, {"description": None})
    assert cleared.json()["data"]["description"] is None
    read = client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]
    assert read["name"] == "Susu Ledger Hub" and read["description"] is None


def test_a_bad_edit_is_refused(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)

    for body in ({}, {"name": None}, {"name": "   "}, {"name": "x" * 121}, {"terms": {}}):
        assert edit(client, hub, owner, body).status_code == 422, body
    assert edit(client, hub, owner, {"description": "x" * 2001}).status_code == 422


def test_only_the_owner_can_edit_or_archive(client: TestClient) -> None:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    assert_error(edit(client, hub, member, {"name": "Mine now"}), 403, "NOT_HUB_OWNER")
    assert_error(archive(client, hub, member), 403, "NOT_HUB_OWNER")
    assert client.get(f"/v1/hubs/{hub.id}", headers=auth(member)).json()["data"]["status"] == (
        "active"
    )


def test_archiving_keeps_the_hub_readable_and_stops_every_change(client: TestClient) -> None:
    owner, member, stranger = make_user(), make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)

    response = archive(client, hub, owner)

    assert response.status_code == 200, response.text
    card = response.json()["data"]
    assert card["status"] == "archived" and card["archived_at"] is not None
    assert client.get(f"/v1/hubs/{hub.id}/idea", headers=auth(member)).status_code == 200
    assert client.get(f"/v1/hubs/{hub.id}/members", headers=auth(member)).status_code == 200
    assert_error(archive(client, hub, owner), 409, "HUB_ARCHIVED")
    assert_error(edit(client, hub, owner, {"name": "Again"}), 409, "HUB_ARCHIVED")
    invite = client.post(
        f"/v1/hubs/{hub.id}/invitations", headers=auth(owner), json={"username": stranger.username}
    )
    assert_error(invite, 409, "HUB_ARCHIVED")
    assert_error(
        client.post(f"/v1/hubs/{hub.id}/join-requests", headers=auth(stranger)), 409, "HUB_ARCHIVED"
    )
    assert_error(
        client.post(f"/v1/hubs/{hub.id}/team/confirm", headers=auth(owner)), 409, "HUB_ARCHIVED"
    )


def test_an_unknown_hub_is_not_found(client: TestClient) -> None:
    owner = make_user()
    missing = Hub(id="00000000-0000-4000-8000-000000000000")
    assert_error(edit(client, missing, owner, {"name": "Ghost"}), 404, "NOT_FOUND")
    assert_error(archive(client, missing, owner), 404, "NOT_FOUND")
