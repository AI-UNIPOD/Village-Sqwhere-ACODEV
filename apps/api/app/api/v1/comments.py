"""Comments and replies on Developer Exchange posts.

A reply is a comment with a parent. PostgreSQL triggers keep the counters, the revisions and
the tree position right; these routes lock the post, then the parent, in the same order as
those triggers, so a write racing a delete answers 404 or 422 instead of failing.
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DbSession
from app.api.v1.posts import PageLimit, PageOffset, get_visible_post, visible_posts
from app.models import Comment, CommentLike, DeletionReason, PlatformRole, Post, User
from app.schemas.comments import (
    CommentCreateRequest,
    CommentItemResponse,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
    TopLevelCommentListResponse,
    TopLevelCommentResponse,
)
from app.schemas.posts import PostAuthorRef

router = APIRouter()

MAX_DEPTH = 1000  # comments_depth_range in the schema
REPLY_PREVIEWS = 2
OLDEST_FIRST = (Comment.created_at, Comment.id)
# A deleted comment stays in lists only while it has replies, so they stay reachable.
LISTED = or_(Comment.deleted_at.is_(None), Comment.reply_count > 0)


def _comment_error(code: int, error: str, message: str) -> HTTPException:
    return HTTPException(status_code=code, detail={"code": error, "message": message})


async def _get_live_comment(comment_id: UUID, db: AsyncSession, *, lock: bool = False) -> Comment:
    query = select(Comment).where(
        Comment.id == comment_id,
        Comment.deleted_at.is_(None),
        Comment.post_id.in_(visible_posts().with_only_columns(Post.id)),
    )
    if lock:
        query = query.with_for_update(of=Comment)
    comment = await db.scalar(query)
    if comment is None:
        raise _comment_error(404, "COMMENT_NOT_FOUND", "Comment not found or deleted")
    return comment


async def _comment_responses(
    comments: list[Comment], viewer_id: UUID, db: AsyncSession
) -> list[CommentResponse]:
    if not comments:
        return []
    author_rows = await db.execute(
        select(User.id, User.username, User.display_name, User.avatar_url, User.is_verified).where(
            User.id.in_({comment.author_id for comment in comments})
        )
    )
    authors = {row.id: PostAuthorRef.model_validate(row) for row in author_rows}
    liked = set(
        await db.scalars(
            select(CommentLike.comment_id).where(
                CommentLike.user_id == viewer_id,
                CommentLike.comment_id.in_([comment.id for comment in comments]),
            )
        )
    )
    return [
        CommentResponse(
            id=comment.id,
            post_id=comment.post_id,
            parent_id=comment.parent_id,
            depth=comment.depth,
            deleted=comment.deleted_at is not None,
            author=None if comment.deleted_at else authors[comment.author_id],
            body=None if comment.deleted_at else comment.body,
            like_count=comment.like_count,
            reply_count=comment.reply_count,
            created_at=comment.created_at,
            edited_at=None if comment.deleted_at else comment.edited_at,
            liked_by_me=not comment.deleted_at and comment.id in liked,
        )
        for comment in comments
    ]


async def _page(ordered: Select[tuple[Comment]], offset: int, limit: int, db: AsyncSession):
    rows = list(await db.scalars(ordered.offset(offset).limit(limit + 1)))
    return rows[:limit], (offset + limit if len(rows) > limit else None)


async def _comment_item(comment: Comment, viewer_id: UUID, db: AsyncSession) -> CommentItemResponse:
    return CommentItemResponse(data=(await _comment_responses([comment], viewer_id, db))[0])


@router.post(
    "/posts/{post_id}/comments",
    status_code=status.HTTP_201_CREATED,
    response_model=CommentItemResponse,
)
async def create_comment(
    post_id: UUID,
    payload: CommentCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> CommentItemResponse:
    await get_visible_post(post_id, db, lock=True)
    comment = Comment(id=uuid4(), post_id=post_id, author_id=current_user.id, body=payload.body)
    if payload.parent_id is None:
        comment.root_id = comment.id
    else:
        parent = await db.scalar(
            select(Comment)
            .where(
                Comment.id == payload.parent_id,
                Comment.post_id == post_id,
                Comment.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if parent is None:
            raise _comment_error(
                422, "PARENT_NOT_FOUND", "The comment you are replying to is not on this post"
            )
        if parent.depth >= MAX_DEPTH:
            raise _comment_error(
                422, "MAX_DEPTH_EXCEEDED", "This thread is too deep: reply further up instead"
            )
        comment.parent_id, comment.root_id, comment.depth = (
            parent.id,
            parent.root_id,
            parent.depth + 1,
        )
    db.add(comment)
    await db.commit()
    return await _comment_item(comment, current_user.id, db)


@router.get("/posts/{post_id}/comments", response_model=TopLevelCommentListResponse)
async def list_comments(
    post_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 20,
) -> TopLevelCommentListResponse:
    await get_visible_post(post_id, db)
    top, next_offset = await _page(
        select(Comment)
        .where(Comment.post_id == post_id, Comment.parent_id.is_(None), LISTED)
        .order_by(*OLDEST_FIRST),
        offset,
        limit,
        db,
    )
    # The first few replies of every comment on the page, in one query.
    numbered = (
        select(
            Comment.id,
            func.row_number()
            .over(partition_by=Comment.parent_id, order_by=OLDEST_FIRST)
            .label("n"),
        )
        .where(Comment.parent_id.in_([comment.id for comment in top]), LISTED)
        .subquery()
    )
    previews = list(
        await db.scalars(
            select(Comment)
            .join(numbered, numbered.c.id == Comment.id)
            .where(numbered.c.n <= REPLY_PREVIEWS)
            .order_by(*OLDEST_FIRST)
        )
    )
    responses = await _comment_responses(top + previews, current_user.id, db)
    replies: dict[UUID, list[CommentResponse]] = {comment.id: [] for comment in top}
    for preview in responses[len(top) :]:
        replies[preview.parent_id].append(preview)
    return TopLevelCommentListResponse(
        data=[
            TopLevelCommentResponse(**comment.model_dump(), replies=replies[comment.id])
            for comment in responses[: len(top)]
        ],
        next_offset=next_offset,
    )


@router.get("/comments/{comment_id}/replies", response_model=CommentListResponse)
async def list_replies(
    comment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: PageOffset = 0,
    limit: PageLimit = 20,
) -> CommentListResponse:
    listed = await db.scalar(
        select(Comment.id).where(
            Comment.id == comment_id,
            LISTED,
            Comment.post_id.in_(visible_posts().with_only_columns(Post.id)),
        )
    )
    if listed is None:
        raise _comment_error(404, "COMMENT_NOT_FOUND", "Comment not found or deleted")
    replies, next_offset = await _page(
        select(Comment).where(Comment.parent_id == comment_id, LISTED).order_by(*OLDEST_FIRST),
        offset,
        limit,
        db,
    )
    return CommentListResponse(
        data=await _comment_responses(replies, current_user.id, db), next_offset=next_offset
    )


@router.get("/comments/{comment_id}", response_model=CommentItemResponse)
async def get_comment(
    comment_id: UUID, current_user: CurrentUser, db: DbSession
) -> CommentItemResponse:
    return await _comment_item(await _get_live_comment(comment_id, db), current_user.id, db)


@router.patch("/comments/{comment_id}", response_model=CommentItemResponse)
async def update_comment(
    comment_id: UUID,
    payload: CommentUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> CommentItemResponse:
    comment = await _get_live_comment(comment_id, db, lock=True)
    if comment.author_id != current_user.id:
        raise _comment_error(403, "NOT_COMMENT_AUTHOR", "Only the author may edit this comment")
    comment.body = payload.body
    await db.commit()
    await db.refresh(comment)
    return await _comment_item(comment, current_user.id, db)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: UUID, current_user: CurrentUser, db: DbSession) -> Response:
    # The delete's count trigger updates the post, so lock the post before the comment, the
    # same order as a reply, or the two can deadlock.
    post_id = (await _get_live_comment(comment_id, db)).post_id
    await db.execute(select(Post.id).where(Post.id == post_id).with_for_update())
    comment = await _get_live_comment(comment_id, db, lock=True)
    if comment.author_id == current_user.id:
        reason = DeletionReason.AUTHOR
    elif current_user.platform_role in (PlatformRole.MODERATOR, PlatformRole.ADMIN):
        reason = DeletionReason.MODERATOR
    else:
        raise _comment_error(
            403, "NOT_COMMENT_AUTHOR", "Only the author or a moderator may delete this comment"
        )
    comment.deleted_at = func.now()
    comment.deleted_by = current_user.id
    comment.deletion_reason = reason
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
