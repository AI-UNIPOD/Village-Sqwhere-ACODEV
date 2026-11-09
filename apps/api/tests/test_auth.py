from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import auth
from app.config import require_jwt_secret
from tests.conftest import (
    REDIRECT_URI,
    VERIFIER,
    callback_result,
    count_users,
    start_sign_in,
)


def token_request(login_code: str, code_verifier: str = VERIFIER) -> dict:
    return {"grant_type": "login_code", "login_code": login_code, "code_verifier": code_verifier}


def test_made_up_login_code_is_rejected_and_creates_no_user(client: TestClient) -> None:
    # This used to create the account "dev_gh_made_up_code_by_a" and sign the caller in.
    resp = client.post("/v1/auth/token", json=token_request("lc_gh_made_up_code_by_attacker_01"))

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "LOGIN_CODE_INVALID"
    assert count_users("dev_gh_made_up_code_by_a") == 0


def test_start_refuses_providers_that_are_not_set_up(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth, "GITHUB_CLIENT_ID", None)
    monkeypatch.setattr(auth, "GITHUB_CLIENT_SECRET", None)
    body = {"redirect_uri": REDIRECT_URI, "code_challenge": "a" * 43}

    for provider in ("github", "bitbucket"):
        resp = client.post(f"/v1/auth/oauth/{provider}/start", json=body)
        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "PROVIDER_NOT_CONFIGURED"


def test_start_builds_an_encoded_github_url(client: TestClient, github: list[str]) -> None:
    resp = client.post(
        "/v1/auth/oauth/github/start",
        json={"redirect_uri": REDIRECT_URI + "?a=1&scope=repo", "code_challenge": "a" * 43},
    )

    url = urlparse(resp.json()["data"]["authorize_url"])
    query = parse_qs(url.query)
    assert url.netloc == "github.com"
    assert query["redirect_uri"] == [REDIRECT_URI + "?a=1&scope=repo"]
    assert query["scope"] == ["read:user,user:email"]


def test_callback_refuses_a_state_this_server_did_not_issue(
    client: TestClient, github: list[str]
) -> None:
    result = callback_result(client, "github-code-ada", "state-from-an-attacker")

    assert result == {"error": "INVALID_STATE"}
    assert github == []


def test_callback_refuses_a_state_issued_for_another_provider(
    client: TestClient, github: list[str]
) -> None:
    state = start_sign_in(client, "github")

    result = callback_result(client, "github-code-ada", state, provider="bitbucket")

    assert result == {"error": "INVALID_STATE"}


def test_state_works_only_once(client: TestClient, github: list[str]) -> None:
    state = start_sign_in(client)
    assert "login_code" in callback_result(client, "github-code-ada", state)

    assert callback_result(client, "github-code-ada", state) == {"error": "INVALID_STATE"}


def test_callback_reports_when_github_refuses_the_code(
    client: TestClient, github: list[str]
) -> None:
    state = start_sign_in(client)

    assert callback_result(client, "mock_oauth_code_12345", state) == {"error": "ACCESS_DENIED"}


def test_cancel_on_github_sends_the_person_back_with_access_denied(
    client: TestClient, github: list[str]
) -> None:
    state = start_sign_in(client)

    # What GitHub sends when the person clicks Cancel: an error and the state, no code.
    resp = client.get(
        "/v1/auth/oauth/github/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert parse_qs(urlparse(resp.headers["location"]).query) == {"error": ["ACCESS_DENIED"]}
    assert github == []
    assert callback_result(client, "github-code-ada", state) == {"error": "INVALID_STATE"}


def test_callback_without_a_state_redirects_instead_of_failing(client: TestClient) -> None:
    resp = client.get("/v1/auth/oauth/github/callback", follow_redirects=False)

    assert resp.status_code == 302
    assert parse_qs(urlparse(resp.headers["location"]).query) == {"error": ["INVALID_STATE"]}


def test_sign_in_through_github(client: TestClient, github: list[str]) -> None:
    state = start_sign_in(client)
    login_code = callback_result(client, "github-code-ada", state)["login_code"]

    resp = client.post("/v1/auth/token", json=token_request(login_code))

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["user"]["username"].startswith("ada-lagos")
    assert data["user"]["identities"][0]["provider"] == "github"
    assert data["refresh_token"].startswith("rt_")


def test_login_code_works_only_once(client: TestClient, github: list[str]) -> None:
    state = start_sign_in(client)
    login_code = callback_result(client, "github-code-ada", state)["login_code"]
    assert client.post("/v1/auth/token", json=token_request(login_code)).status_code == 200

    reuse = client.post("/v1/auth/token", json=token_request(login_code))

    assert reuse.status_code == 401


def test_login_code_needs_the_matching_pkce_verifier(client: TestClient, github: list[str]) -> None:
    state = start_sign_in(client)
    login_code = callback_result(client, "github-code-ada", state)["login_code"]

    resp = client.post("/v1/auth/token", json=token_request(login_code, "x" * 43))

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "LOGIN_CODE_INVALID"


def test_token_refresh_flow(client: TestClient, sign_in) -> None:
    data = sign_in()

    refresh_resp = client.post(
        "/v1/auth/token",
        json={"grant_type": "refresh_token", "refresh_token": data["refresh_token"]},
    )
    assert refresh_resp.status_code == 200
    refreshed = refresh_resp.json()["data"]
    assert refreshed["refresh_token"].startswith("rt_")
    assert refreshed["user"]["id"] == data["user"]["id"]

    bad_resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "refresh_token",
            "refresh_token": "rt_invalid_token_signature_xyz_1234567890",
        },
    )
    assert bad_resp.status_code == 401


def test_auth_logout(client: TestClient, sign_in) -> None:
    refresh_token = sign_in("github-code-moussa")["refresh_token"]

    logout_resp = client.post("/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout_resp.status_code == 204
    assert logout_resp.text == ""

    reuse_resp = client.post(
        "/v1/auth/token",
        json={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )
    assert reuse_resp.status_code == 401


@pytest.mark.parametrize("value", [None, "", "too-short-to-be-safe"])
def test_jwt_secret_must_be_set_and_long(value: str | None) -> None:
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        require_jwt_secret(value)


def test_jwt_secret_of_32_characters_is_accepted() -> None:
    assert require_jwt_secret("k" * 32) == "k" * 32
