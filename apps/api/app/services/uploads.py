"""Post images, kept in Postgres and served by the API."""

from uuid import UUID

# Vercel refuses any request over 4.5 MB, so 4 MB leaves room for the form around the file.
MAX_IMAGE_BYTES = 4 * 1024 * 1024
IMAGE_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def image_url(attachment_id: UUID) -> str:
    return f"/v1/post-images/{attachment_id}"
