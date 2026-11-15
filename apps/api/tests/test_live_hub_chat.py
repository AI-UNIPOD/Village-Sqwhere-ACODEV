"""Live hub chat over a WebSocket. Why: docs/decisions/2026-11-15-live-hub-chat.md"""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from starlette.websockets import WebSocketDisconnect

from app.api.v1 import hub_chat
from app.core.security import create_access_token
from app.models import Hub, HubMember, HubMemberStatus, User
from tests.conftest import test_async_session as db_session
from tests.hub_support import add_member, auth, make_hub, make_user, run


@pytest.fixture(autouse=True)
def listen_on_the_test_database(monkeypatch: pytest.MonkeyPatch) -> None:
    # the socket opens its own session, as the interview socket does
    monkeypatch.setattr(hub_chat, "async_session", db_session)


def live(hub: Hub) -> str:
    return f"/v1/hubs/{hub.id}/messages/live"


def hello(user: User) -> dict[str, str]:
    return {"type": "auth", "token": create_access_token(user.id)}


def say(client: TestClient, hub: Hub, user: User, body: str) -> dict[str, Any]:
    response = client.post(f"/v1/hubs/{hub.id}/messages", headers=auth(user), json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def team() -> tuple[Hub, User, User]:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    return hub, owner, member


def closed_on_connect(client: TestClient, hub: Hub, first_frame: Any) -> bool:
    with client.websocket_connect(live(hub)) as websocket:
        if first_frame is not None:
            websocket.send_json(first_frame)
        with pytest.raises(WebSocketDisconnect) as closed:
            websocket.receive_json()
    return closed.value.code == 1008


def test_members_hear_new_edited_and_deleted_messages(client: TestClient) -> None:
    hub, owner, member = team()
    with client.websocket_connect(live(hub)) as theirs, client.websocket_connect(live(hub)) as mine:
        theirs.send_json(hello(owner))
        mine.send_json(hello(member))
        assert theirs.receive_json() == {"type": "ready"}
        assert mine.receive_json() == {"type": "ready"}

        sent = say(client, hub, member, "Standup at 9, Lagos time?")
        for socket in (theirs, mine):
            event = socket.receive_json()
            assert event["type"] == "message.created"
            assert event["message"]["id"] == sent["id"]
            assert event["message"]["body"] == "Standup at 9, Lagos time?"
        # each listener gets their own card: only the author may edit
        assert mine_can_edit(client, hub, member, sent["id"]) is True

        client.patch(
            f"/v1/hubs/{hub.id}/messages/{sent['id']}",
            headers=auth(member),
            json={"body": "At 10."},
        )
        edited = theirs.receive_json()
        assert edited["type"] == "message.edited" and edited["message"]["body"] == "At 10."
        assert edited["message"]["can_edit"] is False and edited["message"]["can_delete"] is True
        assert mine.receive_json()["message"]["can_edit"] is True

        client.delete(f"/v1/hubs/{hub.id}/messages/{sent['id']}", headers=auth(owner))
        for socket in (theirs, mine):
            assert socket.receive_json() == {
                "type": "message.deleted",
                "message": {"id": sent["id"]},
            }


def mine_can_edit(client: TestClient, hub: Hub, user: User, message_id: str) -> bool:
    listed = client.get(f"/v1/hubs/{hub.id}/messages", headers=auth(user)).json()["data"]
    return next(m for m in listed if m["id"] == message_id)["can_edit"]


def test_a_bad_or_missing_first_frame_closes_the_socket(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    hub, _, _ = team()
    monkeypatch.setattr(hub_chat, "AUTH_WAIT_SECONDS", 0.2)
    assert closed_on_connect(client, hub, {"type": "auth", "token": "not-a-token"})
    assert closed_on_connect(client, hub, {"type": "hello"})
    assert closed_on_connect(client, hub, None)  # says nothing


def test_only_active_members_may_listen(client: TestClient) -> None:
    hub, _, _ = team()
    invited, stranger = make_user(), make_user()
    add_member(hub, invited, HubMemberStatus.INVITED)

    for outsider in (invited, stranger):
        assert closed_on_connect(client, hub, hello(outsider))


def test_someone_removed_hears_nothing_more(client: TestClient) -> None:
    hub, owner, member = team()
    with client.websocket_connect(live(hub)) as theirs:
        theirs.send_json(hello(member))
        assert theirs.receive_json() == {"type": "ready"}

        async def remove(session):
            await session.execute(
                update(HubMember)
                .where(HubMember.hub_id == hub.id, HubMember.user_id == member.id)
                .values(status=HubMemberStatus.REMOVED, left_at=datetime.now(UTC))
            )
            await session.commit()

        run(remove)
        say(client, hub, owner, "Team only from now on.")
        with pytest.raises(WebSocketDisconnect) as closed:
            theirs.receive_json()
        assert closed.value.code == 1008
    assert hub.id not in hub_chat.LISTENERS


def test_a_demo_hub_is_closed_to_real_developers(client: TestClient) -> None:
    hub, owner, _ = team()
    real = make_user()

    async def make_demo(session):
        await session.execute(update(User).where(User.id == owner.id).values(is_demo=True))
        await session.commit()

    run(make_demo)
    assert closed_on_connect(client, hub, hello(real))


def test_posting_with_nobody_listening_still_works(client: TestClient) -> None:
    hub, owner, _ = team()
    assert say(client, hub, owner, "Anyone here?")["body"] == "Anyone here?"
    assert hub.id not in hub_chat.LISTENERS
