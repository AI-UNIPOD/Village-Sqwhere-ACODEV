from collections.abc import Callable
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _image_bytes(image_format: str = "PNG", size: tuple[int, int] = (3, 2)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(22, 120, 80)).save(buffer, format=image_format)
    return buffer.getvalue()


def _attachments(client: TestClient, post_id: str, auth: dict[str, str]) -> list[dict]:
    return client.get(f"/v1/posts/{post_id}", headers=auth).json()["data"]["attachments"]


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
    client: TestClient, sign_in: Callable
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth)

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["url"] == f"/v1/post-images/{data['id']}"
    assert data["mime_type"] == "image/png"
    assert data["byte_size"] == len(_image_bytes())
    assert (data["width"], data["height"], data["position"]) == (3, 2, 0)
    assert _attachments(client, post_id, auth) == [data]


@pytest.mark.parametrize(
    ("image_format", "content_type"),
    [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
)
def test_upload_accepts_supported_image_formats(
    client: TestClient,
    sign_in: Callable,
    image_format: str,
    content_type: str,
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
    image = client.get(response.json()["data"]["url"])
    assert image.headers["content-type"] == content_type


def test_upload_requires_authentication(client: TestClient, sign_in: Callable) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = client.post(
        "/v1/uploads",
        data={"post_id": post_id},
        files={"file": ("photo.png", _image_bytes(), "image/png")},
    )

    assert response.status_code == 401


def test_upload_only_allows_the_post_author(client: TestClient, sign_in: Callable) -> None:
    ada = _bearer(sign_in("github-code-ada")["access_token"])
    moussa = _bearer(sign_in("github-code-moussa")["access_token"])
    post_id = _create_post(client, ada)

    response = _upload(client, post_id, moussa)

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_POST_AUTHOR"
    assert _attachments(client, post_id, ada) == []


def test_upload_requires_existing_post(client: TestClient, sign_in: Callable) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])

    response = _upload(client, "00000000-0000-0000-0000-000000000001", auth)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "POST_NOT_FOUND"


@pytest.mark.parametrize("content", [b"", b"not an image", b"GIF89a fake"])
def test_upload_rejects_empty_or_invalid_image(
    client: TestClient, sign_in: Callable, content: bytes
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth, content)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"EMPTY_IMAGE", "INVALID_IMAGE"}
    assert _attachments(client, post_id, auth) == []


def test_upload_rejects_image_over_four_megabytes(client: TestClient, sign_in: Callable) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    response = _upload(client, post_id, auth, b"x" * (4 * 1024 * 1024 + 1))

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "IMAGE_TOO_LARGE"
    assert _attachments(client, post_id, auth) == []


def test_upload_rejects_more_than_ten_images(client: TestClient, sign_in: Callable) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)

    for position in range(10):
        response = _upload(client, post_id, auth)
        assert response.status_code == 201, response.text
        assert response.json()["data"]["position"] == position

    rejected = _upload(client, post_id, auth)

    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "POST_IMAGE_LIMIT"
    assert len(_attachments(client, post_id, auth)) == 10


def test_image_is_served_from_the_database_without_sign_in(
    client: TestClient, sign_in: Callable
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)
    content = _image_bytes("WEBP")
    url = _upload(client, post_id, auth, content).json()["data"]["url"]

    # an <img> tag sends no token, so the image answers without one
    image = client.get(url)

    assert image.status_code == 200
    assert image.content == content
    assert image.headers["content-type"] == "image/webp"
    assert image.headers["cache-control"] == "public, max-age=3600, s-maxage=3600"
    assert image.headers["x-content-type-options"] == "nosniff"


def test_image_is_gone_with_its_post_or_when_unknown(client: TestClient, sign_in: Callable) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)
    url = _upload(client, post_id, auth).json()["data"]["url"]

    assert client.get("/v1/post-images/00000000-0000-0000-0000-000000000001").status_code == 404
    assert client.delete(f"/v1/posts/{post_id}", headers=auth).status_code == 204

    gone = client.get(url)
    assert gone.status_code == 404
    assert gone.json()["detail"]["code"] == "IMAGE_NOT_FOUND"


def test_the_author_removes_one_image_and_the_others_stay(
    client: TestClient, sign_in: Callable
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)
    first = _upload(client, post_id, auth).json()["data"]
    second = _upload(client, post_id, auth).json()["data"]

    removed = client.delete(f"/v1/uploads/{first['id']}", headers=auth)

    assert removed.status_code == 204 and removed.content == b""
    assert [item["id"] for item in _attachments(client, post_id, auth)] == [second["id"]]
    assert client.get(first["url"]).status_code == 404
    assert client.get(second["url"]).status_code == 200
    # the freed position is the next one used
    third = _upload(client, post_id, auth).json()["data"]
    assert third["position"] == first["position"]


def test_only_the_author_may_remove_an_image(client: TestClient, sign_in: Callable) -> None:
    ada = _bearer(sign_in("github-code-ada")["access_token"])
    moussa = _bearer(sign_in("github-code-moussa")["access_token"])
    post_id = _create_post(client, ada)
    image = _upload(client, post_id, ada).json()["data"]

    response = client.delete(f"/v1/uploads/{image['id']}", headers=moussa)

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_POST_AUTHOR"
    assert len(_attachments(client, post_id, ada)) == 1


def test_removing_an_image_needs_sign_in_and_an_image_that_exists(
    client: TestClient, sign_in: Callable
) -> None:
    auth = _bearer(sign_in("github-code-ada")["access_token"])
    post_id = _create_post(client, auth)
    image = _upload(client, post_id, auth).json()["data"]

    assert client.delete(f"/v1/uploads/{image['id']}").status_code == 401
    missing = client.delete("/v1/uploads/00000000-0000-0000-0000-000000000001", headers=auth)
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "IMAGE_NOT_FOUND"
    assert len(_attachments(client, post_id, auth)) == 1
