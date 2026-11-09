import asyncio
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, update

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.main import app
from app.models.users import User
from tests.conftest import test_async_session as db_session

client = TestClient(app)


def bearer(data: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {data['access_token']}"}


def mark_email_verified(user_id: str) -> None:
    async def _mark() -> None:
        async with db_session() as session:
            await session.execute(
                update(User).where(User.id == UUID(user_id)).values(email_verified_at=func.now())
            )
            await session.commit()

    asyncio.run(_mark())


def test_get_me_unauthorized() -> None:
    # 1. No auth header
    resp = client.get("/v1/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"

    # 2. Malformed token
    resp_bad = client.get("/v1/me", headers={"Authorization": "Bearer not_a_real_jwt"})
    assert resp_bad.status_code == 401
    assert resp_bad.json()["detail"]["code"] == "TOKEN_EXPIRED"


def test_access_token_without_the_access_type_is_rejected() -> None:
    claims = {"sub": "00000000-0000-0000-0000-000000000001", "exp": 4102444800}
    token = jwt.encode(claims, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "TOKEN_EXPIRED"


def test_get_and_patch_me_authorized(sign_in) -> None:
    data = sign_in()
    access_token = data["access_token"]
    user_id = data["user"]["id"]

    auth_header = {"Authorization": f"Bearer {access_token}"}

    # 2. GET /v1/me
    me_resp = client.get("/v1/me", headers=auth_header)
    assert me_resp.status_code == 200
    me_data = me_resp.json()["data"]
    assert me_data["id"] == user_id
    assert "username" in me_data
    assert "roles" in me_data
    assert "technologies" in me_data
    assert "identities" in me_data

    # 3. PATCH /v1/me
    patch_resp = client.patch(
        "/v1/me",
        headers=auth_header,
        json={
            "display_name": "Samuel SuperDev",
            "bio": "Full-stack builder and backend specialist",
            "first_name": "Samuel",
            "last_name": "Engineer",
        },
    )
    assert patch_resp.status_code == 200
    updated_data = patch_resp.json()["data"]
    assert updated_data["display_name"] == "Samuel SuperDev"
    assert updated_data["bio"] == "Full-stack builder and backend specialist"
    assert updated_data["first_name"] == "Samuel"
    assert updated_data["last_name"] == "Engineer"

    # 4. Verify persistence with another GET /v1/me
    verify_resp = client.get("/v1/me", headers=auth_header)
    assert verify_resp.status_code == 200
    persisted_data = verify_resp.json()["data"]
    assert persisted_data["display_name"] == "Samuel SuperDev"
    assert persisted_data["bio"] == "Full-stack builder and backend specialist"


def test_patch_me_unauthorized() -> None:
    resp = client.patch(
        "/v1/me",
        json={"display_name": "Hacker Name"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "change",
    [
        {"display_name": "A" * 81},
        {"display_name": "   "},
        {"first_name": "B" * 101},
        {"last_name": ""},
        {"bio": "C" * 1001},
        {"email": "not-an-email"},
    ],
)
def test_patch_me_rejects_values_the_database_would_refuse(sign_in, change: dict) -> None:
    resp = client.patch("/v1/me", headers=bearer(sign_in()), json=change)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", next(iter(change))]


def test_patch_me_refuses_an_email_another_account_uses(sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    taken = client.patch("/v1/me", headers=bearer(ada), json={"email": "ada@example.test"})
    assert taken.status_code == 200

    resp = client.patch("/v1/me", headers=bearer(moussa), json={"email": "ADA@example.test"})

    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "EMAIL_TAKEN"
    assert client.get("/v1/me", headers=bearer(moussa)).json()["data"]["email"] != (
        "ADA@example.test"
    )


def test_changing_email_clears_its_verification(sign_in) -> None:
    moussa = sign_in("github-code-moussa")
    first = client.patch("/v1/me", headers=bearer(moussa), json={"email": "moussa@example.test"})
    assert first.status_code == 200
    mark_email_verified(moussa["user"]["id"])
    assert client.get("/v1/me", headers=bearer(moussa)).json()["data"]["email_verified"] is True

    resp = client.patch(
        "/v1/me", headers=bearer(moussa), json={"email": "moussa.diop@example.test"}
    )

    assert resp.status_code == 200
    assert resp.json()["data"]["email"] == "moussa.diop@example.test"
    assert resp.json()["data"]["email_verified"] is False
