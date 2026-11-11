from collections.abc import Callable
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1 import auth
from tests.conftest import VERIFIER, callback_result, start_sign_in


def new_address() -> str:
    return f"{uuid4().hex[:10]}@example.com"


def github_email(address: str, *, primary: bool = True, verified: bool = True) -> dict[str, object]:
    return {"email": address, "primary": primary, "verified": verified, "visibility": None}


def sign_up(client: TestClient, code: str) -> dict:
    """Sign in as a new person through start, callback and token. Returns their profile."""
    result = callback_result(client, code, start_sign_in(client))
    assert "login_code" in result, f"sign-in was refused: {result}"
    resp = client.post(
        "/v1/auth/token",
        json={
            "grant_type": "login_code",
            "login_code": result["login_code"],
            "code_verifier": VERIFIER,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["user"]


def test_a_verified_primary_email_is_saved_and_marked_verified(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    address = new_address()
    code = github_account(profile_email=address, emails=[github_email(address)])

    user = sign_up(client, code)

    assert user["email"] == address
    assert user["email_verified"] is True


def test_an_unverified_email_is_not_saved(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    # The address is on the public profile, but GitHub says the person never confirmed it.
    address = new_address()
    code = github_account(profile_email=address, emails=[github_email(address, verified=False)])

    user = sign_up(client, code)

    assert user["email"] is None
    assert user["email_verified"] is False


def test_a_github_noreply_address_is_skipped(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    noreply = "9100001+qa-person@users.noreply.github.com"
    code = github_account(profile_email=noreply, emails=[github_email(noreply)])

    user = sign_up(client, code)

    assert user["email"] is None


def test_a_private_profile_email_is_still_found_through_the_emails_endpoint(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    address = new_address()
    code = github_account(profile_email=None, emails=[github_email(address)])

    user = sign_up(client, code)

    assert user["email"] == address
    assert user["email_verified"] is True


def test_an_email_another_account_has_does_not_block_sign_in(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    address = new_address()
    first = github_account(profile_email=address, emails=[github_email(address)])
    assert sign_up(client, first)["email"] == address
    second = github_account(profile_email=address, emails=[github_email(address)])

    user = sign_up(client, second)

    assert user["email"] is None
    assert user["email_verified"] is False


def test_the_same_email_in_other_capital_letters_does_not_block_sign_in(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    address = new_address()
    first = github_account(profile_email=address, emails=[github_email(address)])
    assert sign_up(client, first)["email"] == address
    shouting = address.upper()
    second = github_account(profile_email=shouting, emails=[github_email(shouting)])

    user = sign_up(client, second)

    assert user["email"] is None


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("network down"), ValueError("not json")],
    ids=["network", "bad-response"],
)
def test_a_failing_emails_request_does_not_block_sign_in(
    client: TestClient, github_account: Callable[..., str], failure: Exception
) -> None:
    code = github_account(profile_email=new_address(), emails=failure)

    user = sign_up(client, code)

    assert user["email"] is None
    assert user["email_verified"] is False


def test_losing_a_race_for_the_email_still_signs_in(
    client: TestClient, github_account: Callable[..., str], monkeypatch: pytest.MonkeyPatch
) -> None:
    address = new_address()
    first = github_account(profile_email=address, emails=[github_email(address)])
    assert sign_up(client, first)["email"] == address

    # Two sign-ups at once: the second looked before the first committed and saw no owner,
    # so only the database's unique index stops it.
    async def nobody_has_it_yet(db: object, email: str) -> bool:
        return False

    monkeypatch.setattr(auth, "email_is_taken", nobody_has_it_yet)
    second = github_account(profile_email=address, emails=[github_email(address)])

    user = sign_up(client, second)

    assert user["email"] is None
    assert user["email_verified"] is False
