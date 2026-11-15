"""S3-compatible storage for post images."""

import asyncio
from urllib.parse import quote
from uuid import uuid4

import boto3

from app import config

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}


class UploadStorageUnavailable(Exception):
    pass


def ensure_upload_storage_configured() -> None:
    if not config.UPLOADS_S3_BUCKET or not config.UPLOADS_PUBLIC_BASE_URL:
        raise UploadStorageUnavailable


def public_image_url(storage_key: str) -> str:
    ensure_upload_storage_configured()
    return f"{config.UPLOADS_PUBLIC_BASE_URL.rstrip('/')}/{quote(storage_key, safe='/')}"


def _s3_client():
    options: dict[str, str] = {"region_name": config.UPLOADS_S3_REGION}
    if config.UPLOADS_S3_ENDPOINT_URL:
        options["endpoint_url"] = config.UPLOADS_S3_ENDPOINT_URL
    if config.UPLOADS_S3_ACCESS_KEY_ID:
        options["aws_access_key_id"] = config.UPLOADS_S3_ACCESS_KEY_ID
    if config.UPLOADS_S3_SECRET_ACCESS_KEY:
        options["aws_secret_access_key"] = config.UPLOADS_S3_SECRET_ACCESS_KEY
    return boto3.client("s3", **options)


def _put_object(storage_key: str, data: bytes, content_type: str) -> None:
    _s3_client().put_object(
        Bucket=config.UPLOADS_S3_BUCKET,
        Key=storage_key,
        Body=data,
        ContentType=content_type,
    )


def _delete_object(storage_key: str) -> None:
    _s3_client().delete_object(Bucket=config.UPLOADS_S3_BUCKET, Key=storage_key)


async def store_image(post_id: str, data: bytes, content_type: str, extension: str) -> str:
    ensure_upload_storage_configured()
    storage_key = f"posts/{post_id}/{uuid4().hex}.{extension}"
    await asyncio.to_thread(_put_object, storage_key, data, content_type)
    return storage_key


async def remove_image(storage_key: str) -> None:
    await asyncio.to_thread(_delete_object, storage_key)
