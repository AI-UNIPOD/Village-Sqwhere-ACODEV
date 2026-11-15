"""Post image uploads."""

import logging
import warnings
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.api.v1.posts import get_visible_post
from app.models.posts import PostAttachment
from app.schemas.posts import PostAttachmentItemResponse, PostAttachmentResponse
from app.services import uploads as image_storage
from app.services.uploads import IMAGE_TYPES, MAX_IMAGE_BYTES, UploadStorageUnavailable

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_IMAGE_PIXELS = 40_000_000


def inspect_image(data: bytes) -> tuple[str, str, int, int]:
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
    mime_type, extension = IMAGE_TYPES[image_format]
    return mime_type, extension, width, height


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
    try:
        image_storage.ensure_upload_storage_configured()
    except UploadStorageUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "UPLOAD_STORAGE_UNAVAILABLE",
                "message": "Image uploads are not configured",
            },
        ) from None

    data = await file.read(MAX_IMAGE_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "EMPTY_IMAGE", "message": "Choose an image file to upload"},
        )
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={"code": "IMAGE_TOO_LARGE", "message": "Images must be 5 MB or smaller"},
        )

    mime_type, extension, width, height = inspect_image(data)
    post = await get_visible_post(post_id, db, current_user, lock=True)
    if post.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_POST_AUTHOR", "message": "Only the post author may upload images"},
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

    try:
        storage_key = await image_storage.store_image(str(post_id), data, mime_type, extension)
    except Exception:
        logger.exception("Post image storage failed for post %s", post_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "IMAGE_STORAGE_FAILED",
                "message": "The image could not be stored; try again",
            },
        ) from None

    attachment = PostAttachment(
        post_id=post_id,
        storage_key=storage_key,
        mime_type=mime_type,
        byte_size=len(data),
        width=width,
        height=height,
        position=position,
    )
    db.add(attachment)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await image_storage.remove_image(storage_key)
        except Exception:
            logger.exception("Could not remove unrecorded post image %s", storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "IMAGE_RECORD_FAILED",
                "message": "The image could not be attached; try again",
            },
        ) from None

    return PostAttachmentItemResponse(
        data=PostAttachmentResponse(
            id=attachment.id,
            url=image_storage.public_image_url(storage_key),
            mime_type=attachment.mime_type,
            byte_size=attachment.byte_size,
            width=attachment.width,
            height=attachment.height,
            position=attachment.position,
            created_at=attachment.created_at,
        )
    )
