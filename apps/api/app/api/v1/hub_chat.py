"""Hub chat: a flat list of messages for the team, newest first, with an optional quote of an
earlier message. Why these rules: docs/decisions/2026-11-14-hub-chat.md

Only active members read and write. The database itself refuses a message from anyone who is not
an active member of an active hub (hub_messages_before_insert), so a removal that lands while a
message is being sent cannot slip one through.

Members may also listen live: WS /v1/hubs/{hub_id}/messages/live pushes every new, edited and
deleted message, in this one API process only. docs/decisions/2026-11-15-live-hub-chat.md
"""

import asyncio
import json
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import Select, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app import config
from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import find_membership, require_active_hub, require_active_member
from app.api.v1.hubs import hub_error
from app.api.v1.interviews import websocket_user
from app.api.v1.posts import PageLimit, PageOffset
from app.database import async_session
from app.models import Hub, HubMemberStatus, HubMessage, HubStatus, User
from app.schemas.hubs import (
    EditMessageRequest,
    HubMessageCard,
    HubMessageListResponse,
    HubMessageResponse,
    HubOwner,
    PostMessageRequest,
    QuotedMessage,
)

router = APIRouter()

ARCHIVED = "This hub is archived, so its chat can be read but not changed."

# The live listeners of each hub's chat, in this process: hub id -> {socket: listening user}.
# Only one API process runs today; more would need a pub-sub between them.
LISTENERS: defaultdict[UUID, dict[WebSocket, User]] = defaultdict(dict)
# How long a new socket has to send its auth frame.
AUTH_WAIT_SECONDS = 5.0


def live_messages(hub_id: UUID) -> Select[tuple[HubMessage]]:
    return select(HubMessage).where(HubMessage.hub_id == hub_id, HubMessage.deleted_at.is_(None))


async def find_message(db: AsyncSession, hub: Hub, message_id: UUID) -> HubMessage:
    message = await db.scalar(live_messages(hub.id).where(HubMessage.id == message_id))
    if message is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "MESSAGE_NOT_FOUND", "Message not found.")
    return message


async def quotes(db: AsyncSession, messages: list[HubMessage]) -> dict[UUID, QuotedMessage]:
    """The quoted messages of a page, read in one query, deleted ones included."""
    ids = {message.reply_to_id for message in messages if message.reply_to_id}
    if not ids:
        return {}
    rows = await db.execute(
        select(HubMessage, User)
        .join(User, User.id == HubMessage.author_id)
        .options(raiseload("*"))
        .where(HubMessage.id.in_(ids))
    )
    return {
        quoted.id: QuotedMessage(
            id=quoted.id,
            author=HubOwner.model_validate(author),
            body=None if quoted.deleted_at else quoted.body,
        )
        for quoted, author in rows.all()
    }


def message_card(
    message: HubMessage,
    author: User,
    hub: Hub,
    viewer: User,
    quoted: dict[UUID, QuotedMessage],
) -> HubMessageCard:
    open_hub = hub.status == HubStatus.ACTIVE
    return HubMessageCard(
        id=message.id,
        body=message.body,
        author=HubOwner.model_validate(author),
        reply_to=quoted.get(message.reply_to_id) if message.reply_to_id else None,
        created_at=message.created_at,
        edited_at=message.edited_at,
        can_edit=open_hub and viewer.id == message.author_id,
        can_delete=open_hub and viewer.id in (message.author_id, hub.owner_id),
    )


async def one_card(
    db: AsyncSession, message: HubMessage, hub: Hub, viewer: User
) -> HubMessageResponse:
    author = await db.scalar(
        select(User).options(raiseload("*")).where(User.id == message.author_id)
    )
    assert author is not None  # the foreign key keeps the author
    return HubMessageResponse(
        data=message_card(message, author, hub, viewer, await quotes(db, [message]))
    )


@router.get("/hubs/{hub_id}/messages", response_model=HubMessageListResponse)
async def list_messages(
    hub_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 50,
) -> HubMessageListResponse:
    hub = await require_active_member(db, hub_id, current_user)
    rows = (
        await db.execute(
            live_messages(hub.id)
            .add_columns(User)
            .join(User, User.id == HubMessage.author_id)
            .options(raiseload("*"))
            .order_by(HubMessage.created_at.desc(), HubMessage.id.desc())
            .offset(offset)
            .limit(limit + 1)
        )
    ).all()
    page = rows[:limit]
    quoted = await quotes(db, [message for message, _ in page])
    return HubMessageListResponse(
        data=[message_card(message, author, hub, current_user, quoted) for message, author in page],
        next_offset=offset + limit if len(rows) > limit else None,
    )


@router.post(
    "/hubs/{hub_id}/messages",
    response_model=HubMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_message(
    hub_id: UUID, payload: PostMessageRequest, current_user: CurrentUser, db: DbSession
) -> HubMessageResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_active_hub(hub, ARCHIVED)
    if payload.reply_to_id is not None:
        await find_message(db, hub, payload.reply_to_id)
    message = HubMessage(
        hub_id=hub.id, author_id=current_user.id, reply_to_id=payload.reply_to_id, body=payload.body
    )
    db.add(message)
    try:
        await db.commit()
    except DBAPIError:
        # the trigger refused it: the person was removed, or the hub archived, a moment ago
        await db.rollback()
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "HUB_CHANGED",
            "Your place in this hub changed while the message was sent. Load the hub again.",
        ) from None
    await db.refresh(message)
    await publish(db, hub, "message.created", message)
    return await one_card(db, message, hub, current_user)


@router.patch("/hubs/{hub_id}/messages/{message_id}", response_model=HubMessageResponse)
async def edit_message(
    hub_id: UUID,
    message_id: UUID,
    payload: EditMessageRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HubMessageResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_active_hub(hub, ARCHIVED)
    message = await find_message(db, hub, message_id)
    if message.author_id != current_user.id:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_MESSAGE_AUTHOR",
            "Only the message's author can edit it.",
        )
    message.body = payload.body
    await db.commit()
    await db.refresh(message)
    await publish(db, hub, "message.edited", message)
    return await one_card(db, message, hub, current_user)


@router.delete("/hubs/{hub_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    hub_id: UUID, message_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user)
    require_active_hub(hub, ARCHIVED)
    message = await find_message(db, hub, message_id)
    if current_user.id not in (message.author_id, hub.owner_id):
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_MESSAGE_AUTHOR",
            "Only the message's author or the hub's owner can delete it.",
        )
    message.deleted_at = func.now()
    await db.commit()
    await publish(db, hub, "message.deleted", message)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- live listening -------------------------------------------------------------------------


async def publish(db: AsyncSession, hub: Hub, kind: str, message: HubMessage) -> None:
    """Sends one event to everyone listening to this hub, after the change is committed. Each
    listener's membership is checked again first (a team is at most five people), so someone
    who left or was removed hears nothing more."""
    listening = dict(LISTENERS.get(hub.id, {}))
    if not listening:
        return
    if kind != "message.deleted":
        author = await db.scalar(
            select(User).options(raiseload("*")).where(User.id == message.author_id)
        )
        assert author is not None  # the foreign key keeps the author
        quoted = await quotes(db, [message])
    for socket, viewer in listening.items():
        member = await find_membership(db, hub.id, viewer.id)
        if member is None or member.status != HubMemberStatus.ACTIVE:
            await drop(hub.id, socket, close=True)
            continue
        if kind == "message.deleted":
            event: dict[str, Any] = {"type": kind, "message": {"id": str(message.id)}}
        else:
            card = message_card(message, author, hub, viewer, quoted)
            event = {"type": kind, "message": json.loads(card.model_dump_json())}
        try:
            await socket.send_json(event)
        except Exception:
            # a socket that cannot take a send has gone; the rest still hear the event
            await drop(hub.id, socket)


async def drop(hub_id: UUID, socket: WebSocket, *, close: bool = False) -> None:
    LISTENERS.get(hub_id, {}).pop(socket, None)
    if not LISTENERS.get(hub_id):
        LISTENERS.pop(hub_id, None)
    if close:
        try:
            await socket.close(code=1008, reason="You are no longer a member of this hub.")
        except Exception:
            pass


async def listener(websocket: WebSocket, hub_id: UUID) -> User | None:
    """The user behind the socket's first frame, if they may read this hub's chat."""
    try:
        frame = await asyncio.wait_for(websocket.receive_json(), AUTH_WAIT_SECONDS)
    except (TimeoutError, ValueError, KeyError, WebSocketDisconnect):
        return None
    if not isinstance(frame, dict) or frame.get("type") != "auth":
        return None
    token = frame.get("token")
    async with async_session() as db:
        user = await websocket_user(token if isinstance(token, str) else None, db)
        if user is None or (user.is_demo and not config.DEMO_ENABLED):
            return None
        try:
            # the same rule as reading the chat: an active member, in the viewer's world
            await require_active_member(db, hub_id, user)
        except HTTPException:
            return None
        db.expunge(user)
    return user


@router.websocket("/hubs/{hub_id}/messages/live")
async def listen_to_messages(websocket: WebSocket, hub_id: UUID) -> None:
    # The token comes in the first frame, never in the URL, where servers and proxies log it.
    await websocket.accept()
    user = await listener(websocket, hub_id)
    if user is None:
        await websocket.close(code=1008, reason="Sign in as a member of this hub to listen.")
        return
    LISTENERS[hub_id][websocket] = user
    await websocket.send_json({"type": "ready"})
    try:
        # nothing is expected from the client; reading notices when it goes
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: the server already closed it (the person left the team)
        pass
    finally:
        await drop(hub_id, websocket)
