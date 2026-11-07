from fastapi.testclient import TestClient

from app.core.security import generate_code_challenge_s256
from app.main import app

client = TestClient(app)


def test_start_oauth_github_and_bitbucket() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    challenge = generate_code_challenge_s256(verifier)

    # 1. GitHub
    gh_resp = client.post(
        "/v1/auth/oauth/github/start",
        json={
            "intent": "login",
            "redirect_uri": "http://localhost:3000/auth/callback",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    assert gh_resp.status_code == 200
    assert "github.com/login/oauth/authorize" in gh_resp.json()["data"]["authorize_url"]

    # 2. Bitbucket
    bb_resp = client.post(
        "/v1/auth/oauth/bitbucket/start",
        json={
            "intent": "login",
            "redirect_uri": "http://localhost:3000/auth/callback",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    assert bb_resp.status_code == 200
    assert "bitbucket.org/site/oauth2/authorize" in bb_resp.json()["data"]["authorize_url"]


def test_oauth_callback_redirect() -> None:
    # Test callback redirection with mock code
    callback_resp = client.get(
        "/v1/auth/oauth/github/callback?code=mock_oauth_code_12345&state=teststate",
        follow_redirects=False,
    )
    assert callback_resp.status_code == 302
    location = callback_resp.headers["location"]
    assert "login_code=lc_gh_mock_oauth_code" in location


def test_auth_token_github_and_bitbucket() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    # Test Bitbucket login
    bb_token_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": "lc_bb_test_code_987654321012",
            "code_verifier": verifier,
        },
    )
    assert bb_token_resp.status_code == 200
    bb_data = bb_token_resp.json()["data"]
    assert bb_data["user"]["identities"][0]["provider"] == "bitbucket"

    # Test GitHub login
    gh_token_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": "lc_gh_test_code_123456789012",
            "code_verifier": verifier,
        },
    )
    assert gh_token_resp.status_code == 200
    gh_data = gh_token_resp.json()["data"]
    assert gh_data["user"]["identities"][0]["provider"] == "github"


def test_token_refresh_flow() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    # 1. Login to get initial tokens
    login_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": "lc_refresh_test_123456789012",
            "code_verifier": verifier,
        },
    )
    assert login_resp.status_code == 200
    data = login_resp.json()["data"]
    original_access = data["access_token"]
    refresh_token = data["refresh_token"]

    # 2. Exchange refresh token for new tokens
    refresh_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    assert refresh_resp.status_code == 200
    refreshed_data = refresh_resp.json()["data"]
    assert refreshed_data["access_token"] != original_access
    assert refreshed_data["refresh_token"].startswith("rt_")
    assert refreshed_data["user"]["id"] == data["user"]["id"]

    # 3. Invalid refresh token rejected
    bad_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "refresh_token",
            "refresh_token": "rt_invalid_token_signature_xyz_1234567890",
        },
    )
    assert bad_resp.status_code == 401


def test_auth_logout() -> None:
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    # 1. Login to obtain tokens
    login_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": "lc_logout_test_123456789012",
            "code_verifier": verifier,
        },
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["data"]["refresh_token"]

    # 2. Call logout
    logout_resp = client.post(
        "/v1/auth/logout",
        json={"refresh_token": refresh_token},
    )
    assert logout_resp.status_code == 204
    assert logout_resp.text == ""

    # 3. Verify the revoked refresh token can no longer be exchanged
    reuse_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    assert reuse_resp.status_code == 401

