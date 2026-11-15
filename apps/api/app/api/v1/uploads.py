"""Post image uploads, kept in Postgres and served back from it."""

import warnings
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.v1.posts import get_visible_post
from app.models.posts import Post, PostAttachment, PostType
from app.schemas.posts import PostAttachmentItemResponse, PostAttachmentResponse
from app.services import uploads as image_storage
from app.services.uploads import IMAGE_TYPES, MAX_IMAGE_BYTES

router = APIRouter()
MAX_IMAGE_PIXELS = 40_000_000


def inspect_image(data: bytes) -> tuple[str, int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                image_format = image.format
                width, height = image.size
                image.verify()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        UnidentifiedImageError,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "INVALID_IMAGE", "message": "Upload a valid JPEG, PNG, or WebP image"},
        ) from None

    if image_format not in IMAGE_TYPES or width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "INVALID_IMAGE", "message": "Upload a valid JPEG, PNG, or WebP image"},
        )
    return IMAGE_TYPES[image_format], width, height


@router.post(
    "/uploads",
    response_model=PostAttachmentItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_post_image(
    post_id: Annotated[UUID, Form()],
    file: Annotated[UploadFile, File()],
    current_user: CurrentUser,
    db: DbSession,
) -> PostAttachmentItemResponse:
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "EMPTY_IMAGE", "message": "Choose an image file to upload"},
        )
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={"code": "IMAGE_TOO_LARGE", "message": "Images must be 4 MB or smaller"},
        )

    mime_type, width, height = inspect_image(data)
    post = await get_visible_post(post_id, db, current_user, lock=True)
    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_POST_AUTHOR", "message": "Only the post author may upload images"},
        )
    if post.type == PostType.HUB_MILESTONE:
        # same rule as editing: the hub wrote it, so no one adds pictures under its name
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "MILESTONE_NOT_EDITABLE",
                "message": "A hub's milestone post cannot be edited. Delete it instead.",
            },
        )

    positions = set(
        await db.scalars(select(PostAttachment.position).where(PostAttachment.post_id == post_id))
    )
    position = next((candidate for candidate in range(10) if candidate not in positions), None)
    if position is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "POST_IMAGE_LIMIT", "message": "A post may have at most 10 images"},
        )

    attachment = PostAttachment(
        post_id=post_id,
        data=data,
        mime_type=mime_type,
        byte_size=len(data),
        width=width,
        height=height,
        position=position,
    )
    db.add(attachment)
    await db.commit()

    return PostAttachmentItemResponse(
        data=PostAttachmentResponse(
            id=attachment.id,
            url=image_storage.image_url(attachment.id),
            mime_type=attachment.mime_type,
            byte_size=attachment.byte_size,
            width=attachment.width,
            height=attachment.height,
            position=attachment.position,
            created_at=attachment.created_at,
        )
    )


@router.get(
    "/post-images/{attachment_id}",
    response_class=Response,
    responses={200: {"content": {mime: {} for mime in IMAGE_TYPES.values()}}},
)
async def get_post_image(attachment_id: UUID, db: DbSession) -> Response:
    # no sign-in: an <img> tag cannot send the Bearer token, so the random ID is the key
    row = (
        await db.execute(
            select(PostAttachment.data, PostAttachment.mime_type)
            .join(Post, Post.id == PostAttachment.post_id)
            .where(PostAttachment.id == attachment_id, Post.deleted_at.is_(None))
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "IMAGE_NOT_FOUND", "message": "That image does not exist"},
        )
    return Response(
        content=row.data,
        media_type=row.mime_type,
        # an hour, so the CDN answers repeat views but a deleted post's image goes soon after
        headers={
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
