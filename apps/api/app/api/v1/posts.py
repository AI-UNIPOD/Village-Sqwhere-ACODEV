"""Developer Exchange posts: create, read, edit, delete, like, save, the feed and lists.

Integrity and revisions are maintained by PostgreSQL triggers. Authors, topics and the
viewer's likes and saves are loaded for a whole page in four queries, never one per post.
"""

from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import StringConstraints
from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DbSession, same_world
from app.models import (
    DeletionReason,
    PlatformRole,
    Post,
    PostAttachment,
    PostLike,
    PostTopic,
    PostType,
    SavedPost,
    Technology,
    User,
)
from app.schemas.lookups import TechnologyRef
from app.schemas.posts import (
    PostAttachmentResponse,
    PostAuthorRef,
    PostCreateRequest,
    PostItemResponse,
    PostListResponse,
    PostResponse,
    PostUpdateRequest,
)
from app.services import uploads as image_storage

router = APIRouter()

PageOffset = Annotated[int, Query(ge=0, le=100_000)]
PageLimit = Annotated[int, Query(ge=1, le=50)]
TopicSlug = Annotated[str, StringConstraints(max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
# The team capped repeatable filters at ten, so a shared link cannot grow without limit.
MAX_TOPIC_FILTERS = 10
TopicFilters = Annotated[list[TopicSlug] | None, Query(max_length=MAX_TOPIC_FILTERS)]
NEWEST_FIRST = (Post.created_at.desc(), Post.id.desc())


# --- Route helpers ---------------------------------------------------------------------------


def visible_posts(viewer: User) -> Select[tuple[Post]]:
    # Hub milestone posts belong to a confidential hub, so no public read path shows them.
    return select(Post).where(
        Post.deleted_at.is_(None), Post.hub_id.is_(None), same_world(Post.author_id, viewer)
    )


async def get_visible_post(
    post_id: UUID, db: AsyncSession, viewer: User, *, lock: bool = False
) -> Post:
    query = visible_posts(viewer).where(Post.id == post_id)
    if lock:
        # A write that waits on a concurrent delete then sees the post gone and answers 404.
        query = query.with_for_update()
    post = (await db.execute(query)).scalar_one_or_none()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "POST_NOT_FOUND", "message": "Post not found or deleted"},
        )
    return post


async def _post_responses(
    posts: list[Post], viewer_id: UUID, db: AsyncSession
) -> list[PostResponse]:
    if not posts:
        return []
    post_ids = [post.id for post in posts]
    author_rows = await db.execute(
        select(User.id, User.username, User.display_name, User.avatar_url, User.is_verified).where(
            User.id.in_({post.author_id for post in posts})
        )
    )
    authors = {row.id: PostAuthorRef.model_validate(row) for row in author_rows}
    topics: dict[UUID, list[TechnologyRef]] = defaultdict(list)
    topic_rows = await db.execute(
        select(PostTopic.post_id, Technology.slug, Technology.name)
        .join(Technology, Technology.id == PostTopic.technology_id)
        .where(PostTopic.post_id.in_(post_ids))
        .order_by(Technology.slug)
    )
    for post_id, slug, name in topic_rows:
        topics[post_id].append(TechnologyRef(slug=slug, name=name))
    attachment_rows = await db.execute(
        select(PostAttachment)
        .where(PostAttachment.post_id.in_(post_ids))
        .order_by(PostAttachment.position)
    )
    attachments: dict[UUID, list[PostAttachmentResponse]] = defaultdict(list)
    for attachment in attachment_rows.scalars():
        attachments[attachment.post_id].append(
            PostAttachmentResponse(
                id=attachment.id,
                url=image_storage.public_image_url(attachment.storage_key),
                mime_type=attachment.mime_type,
                byte_size=attachment.byte_size,
                width=attachment.width,
                height=attachment.height,
                position=attachment.position,
                created_at=attachment.created_at,
            )
        )
    liked = set(
        await db.scalars(
            select(PostLike.post_id).where(
                PostLike.user_id == viewer_id, PostLike.post_id.in_(post_ids)
            )
        )
    )
    saved = set(
        await db.scalars(
            select(SavedPost.post_id).where(
                SavedPost.user_id == viewer_id, SavedPost.post_id.in_(post_ids)
            )
        )
    )
    return [
        PostResponse(
            id=post.id,
            type=post.type,
            title=post.title,
            body=post.body,
            link_url=post.link_url,
            attachments=attachments[post.id],
            author=authors[post.author_id],
            topics=topics[post.id],
            like_count=post.like_count,
            comment_count=post.comment_count,
            created_at=post.created_at,
            updated_at=post.updated_at,
            edited_at=post.edited_at,
            liked_by_me=post.id in liked,
            saved_by_me=post.id in saved,
        )
        for post in posts
    ]


async def _post_item(post: Post, viewer_id: UUID, db: AsyncSession) -> PostItemResponse:
    return PostItemResponse(data=(await _post_responses([post], viewer_id, db))[0])


async def _post_page(
    ordered: Select[tuple[Post]], offset: int, limit: int, viewer_id: UUID, db: AsyncSession
) -> PostListResponse:
    posts = list(await db.scalars(ordered.offset(offset).limit(limit + 1)))
    return PostListResponse(
        data=await _post_responses(posts[:limit], viewer_id, db),
        next_offset=offset + limit if len(posts) > limit else None,
    )


# --- Endpoints -------------------------------------------------------------------------------


@router.post("/posts", status_code=status.HTTP_201_CREATED, response_model=PostItemResponse)
async def create_post(
    payload: PostCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> PostItemResponse:
    if payload.type == PostType.HUB_MILESTONE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "HUB_MILESTONE_NOT_SUPPORTED",
                "message": "Hub milestone posts are not supported yet",
            },
        )

    if len(payload.topics) > 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "TOO_MANY_TOPICS", "message": "A post may have at most 5 topics"},
        )
    if len(set(payload.topics)) != len(payload.topics):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "DUPLICATE_TOPICS", "message": "Topics must not contain duplicates"},
        )

    tech_map: dict[str, Technology] = {}
    if payload.topics:
        tech_query = select(Technology).where(Technology.slug.in_(payload.topics))
        tech_rows = (await db.execute(tech_query)).scalars().all()
        tech_map = {t.slug: t for t in tech_rows}
        missing = [slug for slug in payload.topics if slug not in tech_map]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "UNKNOWN_TOPIC", "message": f"Unknown topic slug: {missing[0]}"},
            )

    post = Post(
        author_id=current_user.id,
        type=payload.type,
        title=payload.title,
        body=payload.body,
        link_url=payload.link_url,
    )
    db.add(post)
    await db.flush()

    for slug in payload.topics:
        post_topic = PostTopic(post_id=post.id, technology_id=tech_map[slug].id)
        db.add(post_topic)

    await db.commit()
    return await _post_item(post, current_user.id, db)


@router.get("/posts/{post_id}", response_model=PostItemResponse)
async def get_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> PostItemResponse:
    return await _post_item(await get_visible_post(post_id, db, current_user), current_user.id, db)


@router.patch("/posts/{post_id}", response_model=PostItemResponse)
async def update_post(
    post_id: UUID,
    payload: PostUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> PostItemResponse:
    post = await get_visible_post(post_id, db, current_user, lock=True)
    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_POST_AUTHOR", "message": "Only the author may edit this post"},
        )

    dump = payload.model_dump(exclude_unset=True)
    if not dump:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "EMPTY_UPDATE", "message": "At least one field must be provided"},
        )

    if post.type == PostType.RFC and "title" in dump and dump["title"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "RFC_TITLE_REQUIRED", "message": "RFC posts must have a title"},
        )

    if "title" in dump:
        post.title = dump["title"]
    if "body" in dump:
        post.body = dump["body"]
    if "link_url" in dump:
        post.link_url = dump["link_url"]

    await db.commit()
    await db.refresh(post)
    return await _post_item(post, current_user.id, db)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    post = await get_visible_post(post_id, db, current_user, lock=True)

    if post.author_id == current_user.id:
        reason = DeletionReason.AUTHOR
    elif current_user.platform_role in (PlatformRole.MODERATOR, PlatformRole.ADMIN):
        reason = DeletionReason.MODERATOR
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "NOT_POST_AUTHOR",
                "message": "Only the author or a moderator may delete this post",
            },
        )

    post.deleted_at = func.now()
    post.deleted_by = current_user.id
    post.deletion_reason = reason
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/posts", response_model=PostListResponse)
async def list_posts(
    current_user: CurrentUser,
    db: DbSession,
    post_type: Annotated[PostType | None, Query(alias="type")] = None,
    topic: TopicFilters = None,
    author: Annotated[str | None, Query(pattern=r"^[A-Za-z0-9_-]{3,39}$")] = None,
    offset: PageOffset = 0,
    limit: PageLimit = 20,
) -> PostListResponse:
    if post_type == PostType.HUB_MILESTONE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "HUB_MILESTONE_NOT_SUPPORTED",
                "message": "Hub milestone posts are not supported yet",
            },
        )
    query = visible_posts(current_user)
    if post_type is not None:
        query = query.where(Post.type == post_type)
    if topic:
        query = query.where(
            Post.id.in_(
                select(PostTopic.post_id)
                .join(Technology, Technology.id == PostTopic.technology_id)
                .where(Technology.slug.in_(topic))
            )
        )
    if author is not None:
        query = query.where(
            Post.author_id.in_(
                select(User.id).where(func.lower(User.username) == func.lower(author))
            )
        )
    return await _post_page(query.order_by(*NEWEST_FIRST), offset, limit, current_user.id, db)


@router.get("/feed", response_model=PostListResponse)
async def my_feed(
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 20,
) -> PostListResponse:
    query = visible_posts(current_user)
    topic_ids = [feed_topic.technology_id for feed_topic in current_user.feed_topics]
    # With no topics chosen yet, the feed is every post, so a new developer never sees an
    # empty page. Your own posts always show, even when they have none of your topics.
    if topic_ids:
        query = query.where(
            or_(
                Post.author_id == current_user.id,
                Post.id.in_(
                    select(PostTopic.post_id).where(PostTopic.technology_id.in_(topic_ids))
                ),
            )
        )
    return await _post_page(query.order_by(*NEWEST_FIRST), offset, limit, current_user.id, db)


async def _set_mark(
    mark: type[PostLike] | type[SavedPost],
    post_id: UUID,
    user: User,
    db: AsyncSession,
    *,
    on: bool,
) -> Response:
    await get_visible_post(post_id, db, user)
    if on:
        statement = (
            pg_insert(mark).values(post_id=post_id, user_id=user.id).on_conflict_do_nothing()
        )
    else:
        statement = delete(mark).where(mark.post_id == post_id, mark.user_id == user.id)
    await db.execute(statement)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
async def like_post(post_id: UUID, current_user: CurrentUser, db: DbSession) -> Response:
    return await _set_mark(PostLike, post_id, current_user, db, on=True)


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
async def unlike_post(post_id: UUID, current_user: CurrentUser, db: DbSession) -> Response:
    return await _set_mark(PostLike, post_id, current_user, db, on=False)


@router.put("/posts/{post_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def save_post(post_id: UUID, current_user: CurrentUser, db: DbSession) -> Response:
    return await _set_mark(SavedPost, post_id, current_user, db, on=True)


@router.delete("/posts/{post_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_post(post_id: UUID, current_user: CurrentUser, db: DbSession) -> Response:
    return await _set_mark(SavedPost, post_id, current_user, db, on=False)


@router.get("/me/saved-posts", response_model=PostListResponse)
async def my_saved_posts(
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 20,
) -> PostListResponse:
    query = (
        visible_posts(current_user)
        .join(SavedPost, SavedPost.post_id == Post.id)
        .where(SavedPost.user_id == current_user.id)
        .order_by(SavedPost.created_at.desc(), Post.id.desc())
    )
    return await _post_page(query, offset, limit, current_user.id, db)
