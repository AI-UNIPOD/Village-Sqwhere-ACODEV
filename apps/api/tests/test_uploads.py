from collections.abc import Callable
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config
from app.services import uploads as image_storage


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _image_bytes(image_format: str = "PNG", size: tuple[int, int] = (3, 2)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(22, 120, 80)).save(buffer, format=image_format)
    return buffer.getvalue()


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> dict[str, bytes]:
    monkeypatch.setattr(config, "UPLOADS_S3_BUCKET", "test-images")
    monkeypatch.setattr(config, "UPLOADS_PUBLIC_BASE_URL", "https://images.example.test")
    stored: dict[str, bytes] = {}

    async def fake_store(post_id: str, data: bytes, content_type: str, extension: str) -> str:
        key = f"posts/{post_id}/test-{len(stored)}.{extension}"
        stored[key] = data
        return key

    async def fake_remove(key: str) -> None:
        stored.pop(key, None)

    monkeypatch.setattr(image_storage, "store_image", fake_store)
    monkeypatch.setattr(image_storage, "remove_image", fake_remove)
    return stored


def _create_post(client: TestClient, auth: dict[str, str]) -> str:
    response = client.post("/v1/posts", headers=auth, json={"body": "A post with images"})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _upload(
    client: TestClient,
    post_id: str,
    auth: dict[str, str],
    content: bytes | None = None,
    filename: str = "photo.png",
    content_type: str = "image/png",
):
    return client.post(
        "/v1/uploads",
        headers=auth,
        data={"post_id": post_id},
        files={
            "file": (filename, content if content is not None else _image_bytes(), content_type)
        },
    )


def test_upload_image_returns_metadata_and_post_reads_include_it(
    client: TestClient, sign_in: Callable, storage: dict[str, bytes]
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth)

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["url"].startswith("https://images.example.test/posts/")
    assert data["mime_type"] == "image/png"
    assert data["byte_size"] == len(_image_bytes())
    assert (data["width"], data["height"], data["position"]) == (3, 2, 0)
    assert len(storage) == 1

    post = client.get(f"/v1/posts/{post_id}", headers=auth).json()["data"]
    assert post["attachments"] == [data]


@pytest.mark.parametrize(
    ("image_format", "content_type", "extension"),
    [("JPEG", "image/jpeg", ".jpg"), ("PNG", "image/png", ".png"), ("WEBP", "image/webp", ".webp")],
)
def test_upload_accepts_supported_image_formats(
    client: TestClient,
    sign_in: Callable,
    storage: dict[str, bytes],
    image_format: str,
    content_type: str,
    extension: str,
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(
        client,
        post_id,
        auth,
        _image_bytes(image_format),
        filename="untrusted-name.bin",
        content_type="application/octet-stream",
    )

    assert response.status_code == 201, response.text
    assert response.json()["data"]["mime_type"] == content_type
    assert next(iter(storage)).endswith(extension)


def test_upload_requires_authentication(client: TestClient, sign_in: Callable, storage) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = client.post(
        "/v1/uploads",
        data={"post_id": post_id},
        files={"file": ("photo.png", _image_bytes(), "image/png")},
    )

    assert response.status_code == 401


def test_upload_only_allows_the_post_author(client: TestClient, sign_in: Callable, storage) -> None:
    ada = _bearer(sign_in("github-code-ada")["access_token"])
    moussa = _bearer(sign_in("github-code-moussa")["access_token"])
    post_id = _create_post(client, ada)

    response = _upload(client, post_id, moussa)

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_POST_AUTHOR"
    assert storage == {}


def test_upload_requires_existing_post(client: TestClient, sign_in: Callable, storage) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])

    response = _upload(client, "00000000-0000-0000-0000-000000000001", auth)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "POST_NOT_FOUND"


@pytest.mark.parametrize("content", [b"", b"not an image", b"GIF89a fake"])
def test_upload_rejects_empty_or_invalid_image(
    client: TestClient, sign_in: Callable, storage, content: bytes
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth, content)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"EMPTY_IMAGE", "INVALID_IMAGE"}
    assert storage == {}


def test_upload_rejects_image_over_five_megabytes(
    client: TestClient, sign_in: Callable, storage
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth, b"x" * (5 * 1024 * 1024 + 1))

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "IMAGE_TOO_LARGE"
    assert storage == {}


def test_upload_rejects_more_than_ten_images(
    client: TestClient, sign_in: Callable, storage
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    for position in range(10):
        response = _upload(client, post_id, auth)
        assert response.status_code == 201, response.text
        assert response.json()["data"]["position"] == position

    rejected = _upload(client, post_id, auth)

    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "POST_IMAGE_LIMIT"
    assert len(storage) == 10


def test_upload_returns_503_until_storage_is_configured(
    client: TestClient, sign_in: Callable, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "UPLOADS_S3_BUCKET", None)
    monkeypatch.setattr(config, "UPLOADS_PUBLIC_BASE_URL", None)
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth)

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "UPLOAD_STORAGE_UNAVAILABLE"


def test_upload_returns_502_when_object_storage_fails(
    client: TestClient,
    sign_in: Callable,
    storage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_store(post_id: str, data: bytes, content_type: str, extension: str) -> str:
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(image_storage, "store_image", fail_store)
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "IMAGE_STORAGE_FAILED"
    assert storage == {}
