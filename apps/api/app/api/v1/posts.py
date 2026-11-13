"""Core posts CRUD endpoints: create, read, update, and delete.

Integrity and revisions are maintained by PostgreSQL triggers. Author details are projected
in a single targeted query to prevent N+1 cascades.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DbSession
from app.models import (
    DeletionReason,
    PlatformRole,
    Post,
    PostLike,
    PostTopic,
    PostType,
    SavedPost,
    Technology,
    User,
)
from app.schemas.lookups import TechnologyRef
from app.schemas.posts import (
    PostAuthorRef,
    PostCreateRequest,
    PostItemResponse,
    PostResponse,
    PostUpdateRequest,
)

router = APIRouter(prefix="/posts")


# --- Route helpers ---------------------------------------------------------------------------


async def _get_visible_post(post_id: UUID, db: AsyncSession) -> Post:
    query = select(Post).where(
        Post.id == post_id,
        Post.deleted_at.is_(None),
        Post.hub_id.is_(None),
    )
    post = (await db.execute(query)).scalar_one_or_none()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "POST_NOT_FOUND", "message": "Post not found or deleted"},
        )
    return post


def _author_ref(user: User) -> PostAuthorRef:
    return PostAuthorRef(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        is_verified=user.is_verified,
    )


async def _topics_for(post_id: UUID, db: AsyncSession) -> list[TechnologyRef]:
    query = (
        select(Technology.slug, Technology.name)
        .join(PostTopic, PostTopic.technology_id == Technology.id)
        .where(PostTopic.post_id == post_id)
        .order_by(Technology.slug)
    )
    rows = await db.execute(query)
    return [TechnologyRef(slug=slug, name=name) for slug, name in rows]


def _post_response(
    post: Post,
    author_ref: PostAuthorRef,
    topics: list[TechnologyRef],
    liked_by_me: bool,
    saved_by_me: bool,
) -> PostResponse:
    return PostResponse(
        id=post.id,
        type=post.type,
        title=post.title,
        body=post.body,
        link_url=post.link_url,
        author=author_ref,
        topics=topics,
        like_count=post.like_count,
        comment_count=post.comment_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
        edited_at=post.edited_at,
        liked_by_me=liked_by_me,
        saved_by_me=saved_by_me,
    )


# --- Endpoints -------------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PostItemResponse)
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

    topics_ref = sorted(
        [TechnologyRef(slug=slug, name=tech_map[slug].name) for slug in payload.topics],
        key=lambda t: t.slug,
    )
    author_ref = _author_ref(current_user)
    return PostItemResponse(
        data=_post_response(post, author_ref, topics_ref, liked_by_me=False, saved_by_me=False)
    )


@router.get("/{post_id}", response_model=PostItemResponse)
async def get_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> PostItemResponse:
    post = await _get_visible_post(post_id, db)

    author_query = select(
        User.id,
        User.username,
        User.display_name,
        User.avatar_url,
        User.is_verified,
    ).where(User.id == post.author_id)
    author_row = (await db.execute(author_query)).one()
    author_ref = PostAuthorRef(
        id=author_row.id,
        username=author_row.username,
        display_name=author_row.display_name,
        avatar_url=author_row.avatar_url,
        is_verified=author_row.is_verified,
    )

    topics = await _topics_for(post.id, db)

    liked_query = select(
        select(PostLike.post_id)
        .where(PostLike.post_id == post.id, PostLike.user_id == current_user.id)
        .exists()
    )
    liked_by_me = bool((await db.execute(liked_query)).scalar())

    saved_query = select(
        select(SavedPost.post_id)
        .where(SavedPost.post_id == post.id, SavedPost.user_id == current_user.id)
        .exists()
    )
    saved_by_me = bool((await db.execute(saved_query)).scalar())

    return PostItemResponse(
        data=_post_response(
            post, author_ref, topics, liked_by_me=liked_by_me, saved_by_me=saved_by_me
        )
    )


@router.patch("/{post_id}", response_model=PostItemResponse)
async def update_post(
    post_id: UUID,
    payload: PostUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> PostItemResponse:
    post = await _get_visible_post(post_id, db)
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

    topics = await _topics_for(post.id, db)
    author_ref = _author_ref(current_user)

    liked_query = select(
        select(PostLike.post_id)
        .where(PostLike.post_id == post.id, PostLike.user_id == current_user.id)
        .exists()
    )
    liked_by_me = bool((await db.execute(liked_query)).scalar())

    saved_query = select(
        select(SavedPost.post_id)
        .where(SavedPost.post_id == post.id, SavedPost.user_id == current_user.id)
        .exists()
    )
    saved_by_me = bool((await db.execute(saved_query)).scalar())

    return PostItemResponse(
        data=_post_response(
            post, author_ref, topics, liked_by_me=liked_by_me, saved_by_me=saved_by_me
        )
    )


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    post = await _get_visible_post(post_id, db)

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
