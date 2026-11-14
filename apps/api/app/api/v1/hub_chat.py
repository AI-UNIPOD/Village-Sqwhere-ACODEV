"""Hub chat: a flat list of messages for the team, newest first, with an optional quote of an
earlier message. Why these rules: docs/decisions/2026-11-14-hub-chat.md

Only active members read and write. The database itself refuses a message from anyone who is not
an active member of an active hub (hub_messages_before_insert), so a removal that lands while a
message is being sent cannot slip one through.
"""

from uuid import UUID

from fastapi import APIRouter, Response, status
from sqlalchemy import Select, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_members import require_active_hub, require_active_member
from app.api.v1.hubs import hub_error
from app.api.v1.posts import PageLimit, PageOffset
from app.models import Hub, HubMessage, HubStatus, User
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)
