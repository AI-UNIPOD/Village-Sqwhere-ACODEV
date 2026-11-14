"""Hub chat: docs/decisions/2026-11-14-hub-chat.md"""

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.models import Hub, HubMember, HubMemberStatus, HubStatus, User
from tests.hub_support import add_member, auth, make_hub, make_user, run


def say(client: TestClient, hub: Hub, user: User, body: str, reply_to: str | None = None) -> Any:
    payload: dict[str, Any] = {"body": body}
    if reply_to:
        payload["reply_to_id"] = reply_to
    return client.post(f"/v1/hubs/{hub.id}/messages", headers=auth(user), json=payload)


def chat(client: TestClient, hub: Hub, user: User, **params: Any) -> Any:
    return client.get(f"/v1/hubs/{hub.id}/messages", headers=auth(user), params=params)


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def team() -> tuple[Hub, User, User]:
    owner, member = make_user(), make_user()
    hub = make_hub(owner)
    add_member(hub, member, HubMemberStatus.ACTIVE)
    return hub, owner, member


def change(model: Any, *where: Any, **values: Any) -> None:
    async def work(session):
        await session.execute(update(model).where(*where).values(**values))
        await session.commit()

    run(work)


def test_members_post_and_read_newest_first_with_quotes(client: TestClient) -> None:
    hub, owner, member = team()
    first = say(client, hub, owner, "  Standup at 9, Lagos time?  ")
    assert first.status_code == 201, first.text
    card = first.json()["data"]
    assert card["body"] == "Standup at 9, Lagos time?"
    assert card["author"]["username"] == owner.username
    assert card["reply_to"] is None and card["edited_at"] is None
    reply = say(client, hub, member, "Works for me.", reply_to=card["id"])
    assert reply.json()["data"]["reply_to"] == {
        "id": card["id"],
        "author": card["author"],
        "body": "Standup at 9, Lagos time?",
    }

    page = chat(client, hub, member).json()
    bodies = [message["body"] for message in page["data"]]
    assert bodies == ["Works for me.", "Standup at 9, Lagos time?"]
    assert page["next_offset"] is None
    mine, theirs = page["data"]
    assert (mine["can_edit"], mine["can_delete"]) == (True, True)
    assert (theirs["can_edit"], theirs["can_delete"]) == (False, False)
    owner_view = chat(client, hub, owner).json()["data"]
    assert owner_view[0]["can_delete"] is True and owner_view[0]["can_edit"] is False


def test_the_chat_pages(client: TestClient) -> None:
    hub, owner, _ = team()
    for number in range(3):
        say(client, hub, owner, f"Message {number}")

    first = chat(client, hub, owner, limit=2).json()
    assert [m["body"] for m in first["data"]] == ["Message 2", "Message 1"]
    assert first["next_offset"] == 2
    second = chat(client, hub, owner, limit=2, offset=2).json()
    assert [m["body"] for m in second["data"]] == ["Message 0"]
    assert second["next_offset"] is None


def test_only_active_members_read_or_write(client: TestClient) -> None:
    hub, owner, member = team()
    invited, stranger = make_user(), make_user()
    add_member(hub, invited, HubMemberStatus.INVITED)
    message = say(client, hub, owner, "Team only.").json()["data"]

    for outsider in (invited, stranger):
        assert_error(chat(client, hub, outsider), 403, "NOT_HUB_MEMBER")
        assert_error(say(client, hub, outsider, "Let me in"), 403, "NOT_HUB_MEMBER")
    change(
        HubMember,
        HubMember.hub_id == hub.id,
        HubMember.user_id == member.id,
        status=HubMemberStatus.LEFT,
        left_at=datetime.now(UTC),
    )
    assert_error(chat(client, hub, member), 403, "NOT_HUB_MEMBER")
    edit = client.patch(
        f"/v1/hubs/{hub.id}/messages/{message['id']}", headers=auth(member), json={"body": "x"}
    )
    assert_error(edit, 403, "NOT_HUB_MEMBER")


def test_the_author_edits_and_the_owner_or_author_deletes(client: TestClient) -> None:
    hub, owner, member = team()
    message = say(client, hub, member, "Draft architecture by Friday.").json()["data"]
    path = f"/v1/hubs/{hub.id}/messages/{message['id']}"

    refused = client.patch(path, headers=auth(owner), json={"body": "No"})
    assert_error(refused, 403, "NOT_MESSAGE_AUTHOR")
    edited = client.patch(
        path, headers=auth(member), json={"body": "Draft architecture by Monday."}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["body"] == "Draft architecture by Monday."
    assert edited.json()["data"]["edited_at"] is not None

    quoting = say(client, hub, owner, "Noted.", reply_to=message["id"]).json()["data"]
    assert client.delete(path, headers=auth(owner)).status_code == 204
    assert_error(client.delete(path, headers=auth(member)), 404, "MESSAGE_NOT_FOUND")
    gone = client.patch(path, headers=auth(member), json={"body": "Back"})
    assert_error(gone, 404, "MESSAGE_NOT_FOUND")
    listed = chat(client, hub, member).json()["data"]
    assert [m["id"] for m in listed] == [quoting["id"]]
    assert listed[0]["reply_to"]["body"] is None  # the quoted message was deleted
    again = say(client, hub, owner, "Again", reply_to=message["id"])
    assert_error(again, 404, "MESSAGE_NOT_FOUND")


def test_a_member_cannot_delete_someone_elses_message(client: TestClient) -> None:
    hub, owner, member = team()
    message = say(client, hub, owner, "A note from the owner.").json()["data"]

    response = client.delete(f"/v1/hubs/{hub.id}/messages/{message['id']}", headers=auth(member))
    assert_error(response, 403, "NOT_MESSAGE_AUTHOR")


def test_a_bad_message_is_refused(client: TestClient) -> None:
    hub, owner, _ = team()
    for body in ("", "   ", "x" * 10001, "null\u0000byte"):
        assert say(client, hub, owner, body).status_code == 422, repr(body[:10])
    other_hub = make_hub(make_user())
    add_member(other_hub, owner, HubMemberStatus.ACTIVE)
    elsewhere = say(client, other_hub, owner, "In another hub.").json()["data"]
    quoted = say(client, hub, owner, "Quote", reply_to=elsewhere["id"])
    assert_error(quoted, 404, "MESSAGE_NOT_FOUND")


def test_an_archived_hubs_chat_is_read_only(client: TestClient) -> None:
    hub, owner, member = team()
    message = say(client, hub, member, "Last word.").json()["data"]
    change(Hub, Hub.id == hub.id, status=HubStatus.ARCHIVED, archived_at=datetime.now(UTC))

    listed = chat(client, hub, member).json()["data"]
    assert [m["body"] for m in listed] == ["Last word."]
    assert (listed[0]["can_edit"], listed[0]["can_delete"]) == (False, False)
    assert_error(say(client, hub, member, "More"), 409, "HUB_ARCHIVED")
    path = f"/v1/hubs/{hub.id}/messages/{message['id']}"
    assert_error(client.patch(path, headers=auth(member), json={"body": "x"}), 409, "HUB_ARCHIVED")
    assert_error(client.delete(path, headers=auth(owner)), 409, "HUB_ARCHIVED")
