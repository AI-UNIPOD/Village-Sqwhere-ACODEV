import asyncio
import logging

import pytest

from app.models.users import AuthProvider
from app.services import provider_emails
from app.services.provider_emails import (
    GitHubEmails,
    ProviderEmail,
    find_signup_email,
    pick_verified_email,
)


def mail(address: str, *, verified: bool = True, primary: bool = False) -> ProviderEmail:
    return ProviderEmail(address=address, verified=verified, primary=primary)


def test_the_verified_primary_email_wins() -> None:
    emails = [mail("work@example.com"), mail("ada@example.com", primary=True)]

    assert pick_verified_email(emails) == "ada@example.com"


def test_an_unverified_email_is_never_picked() -> None:
    emails = [
        mail("ada@example.com", verified=False, primary=True),
        mail("x@example.com", verified=False),
    ]

    assert pick_verified_email(emails) is None


def test_another_verified_email_is_used_when_the_primary_cannot_be() -> None:
    emails = [
        mail("ada@example.com", verified=False, primary=True),
        mail("unchecked@example.com", verified=False),
        mail("work@example.com"),
    ]

    assert pick_verified_email(emails) == "work@example.com"


@pytest.mark.parametrize(
    "noreply",
    [
        "ada-lagos@users.noreply.github.com",
        "9100001+ada-lagos@users.noreply.github.com",
        "Ada-Lagos@Users.NoReply.GitHub.com",
    ],
)
def test_github_noreply_addresses_are_skipped(noreply: str) -> None:
    assert pick_verified_email([mail(noreply, primary=True)]) is None
    assert pick_verified_email([mail(noreply, primary=True), mail("work@example.com")]) == (
        "work@example.com"
    )


@pytest.mark.parametrize(
    "bad", ["not-an-email", "a@b", "two words@example.com", "a@" + "b" * 250 + ".com"]
)
def test_an_address_the_database_would_refuse_is_skipped(bad: str) -> None:
    assert pick_verified_email([mail(bad, primary=True)]) is None


def test_no_emails_means_no_email() -> None:
    assert pick_verified_email([]) is None


def test_github_rows_are_read_as_provider_emails(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_rows(access_token: str) -> list[dict]:
        return [
            {"email": "ada@example.com", "primary": True, "verified": True, "visibility": None},
            {"email": "old@example.com", "primary": False, "verified": False},
        ]

    monkeypatch.setattr(provider_emails, "fetch_github_emails", fake_rows)

    emails = asyncio.run(GitHubEmails().list_emails("token"))

    assert emails == [
        ProviderEmail("ada@example.com", verified=True, primary=True),
        ProviderEmail("old@example.com", verified=False, primary=False),
    ]


def test_a_provider_without_an_email_source_gives_no_email() -> None:
    assert asyncio.run(find_signup_email(AuthProvider.BITBUCKET, "token")) is None


def test_a_failing_lookup_gives_no_email_and_logs_no_address(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    class Failing:
        async def list_emails(self, access_token: str) -> list[ProviderEmail]:
            raise RuntimeError("could not read ada@example.com")

    monkeypatch.setitem(provider_emails.EMAIL_SOURCES, AuthProvider.GITHUB, Failing())

    with caplog.at_level(logging.DEBUG):
        found = asyncio.run(find_signup_email(AuthProvider.GITHUB, "token"))

    assert found is None
    assert "ada@example.com" not in caplog.text
