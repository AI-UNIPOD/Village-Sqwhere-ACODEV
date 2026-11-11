"""Which email addresses does a sign-in provider vouch for?

Each provider gets one `EmailSource`. Adding Bitbucket later means writing one new source
and adding it to `EMAIL_SOURCES`; nothing else here changes.

Email addresses are personal data: never put one in a log line or an error message.
"""

import logging
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.models.users import AuthProvider

logger = logging.getLogger(__name__)

NOREPLY_SUFFIX = "@users.noreply.github.com"
MAX_EMAIL_LENGTH = 254
# The same shape the users table accepts (CHECK users_email_format), so an address the
# database would refuse is skipped here instead of failing the sign-up.
EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class ProviderEmail:
    address: str
    verified: bool
    primary: bool


class EmailSource(Protocol):
    async def list_emails(self, access_token: str) -> list[ProviderEmail]:
        """Every email the provider knows for the person who owns `access_token`."""
        ...


async def fetch_github_emails(access_token: str) -> list[dict]:
    """Call GitHub's emails endpoint. Raises when GitHub refuses or cannot be reached."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "Village-Sqwhere-API",
            },
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()


class GitHubEmails:
    async def list_emails(self, access_token: str) -> list[ProviderEmail]:
        rows = await fetch_github_emails(access_token)
        return [
            ProviderEmail(
                address=row["email"],
                verified=bool(row.get("verified")),
                primary=bool(row.get("primary")),
            )
            for row in rows
        ]


EMAIL_SOURCES: dict[AuthProvider, EmailSource] = {AuthProvider.GITHUB: GitHubEmails()}


def is_usable(address: str) -> bool:
    return (
        len(address) <= MAX_EMAIL_LENGTH
        and EMAIL_SHAPE.match(address) is not None
        and not address.lower().endswith(NOREPLY_SUFFIX)
    )


def pick_verified_email(emails: list[ProviderEmail]) -> str | None:
    """The verified primary email, else the first other verified one, else nothing.

    GitHub noreply addresses are skipped: they cannot receive mail from us.
    """
    usable = [email for email in emails if email.verified and is_usable(email.address)]
    chosen = next((email for email in usable if email.primary), None) or next(iter(usable), None)
    return chosen.address if chosen else None


async def find_signup_email(provider: AuthProvider, access_token: str) -> str | None:
    """A verified email for a new account, or None. Never raises, so sign-in is never blocked."""
    source = EMAIL_SOURCES.get(provider)
    if source is None:
        return None
    try:
        emails = await source.list_emails(access_token)
    except Exception as exc:
        # Only the kind of error: its message could carry an address.
        logger.warning("could not read %s emails: %s", provider.value, type(exc).__name__)
        return None
    return pick_verified_email(emails)
