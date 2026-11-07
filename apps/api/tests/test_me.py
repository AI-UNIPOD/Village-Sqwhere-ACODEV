from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_me_unauthorized() -> None:
    # 1. No auth header
    resp = client.get("/v1/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"

    # 2. Malformed token
    resp_bad = client.get("/v1/me", headers={"Authorization": "Bearer not_a_real_jwt"})
    assert resp_bad.status_code == 401
    assert resp_bad.json()["detail"]["code"] == "TOKEN_EXPIRED"


def test_get_and_patch_me_authorized() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    # 1. Sign in to obtain access token
    login_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": "lc_gh_me_test_developer_123",
            "code_verifier": verifier,
        },
    )
    assert login_resp.status_code == 200
    data = login_resp.json()["data"]
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
