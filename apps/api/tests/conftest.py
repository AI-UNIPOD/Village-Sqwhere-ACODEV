import asyncio
import os
from collections.abc import AsyncGenerator, Callable, Generator
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest

# The API refuses to start without a signing key. This one is for tests only.
os.environ.setdefault("JWT_SECRET_KEY", "test-only-signing-key-never-use-for-real-0123456789")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.v1 import auth  # noqa: E402
from app.config import DATABASE_URL  # noqa: E402
from app.core.security import generate_code_challenge_s256  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.users import User, UserIdentity  # noqa: E402
from app.services import provider_emails  # noqa: E402


def resolve_test_database_url(test_url: str | None, dev_url: str, in_ci: bool) -> str:
    """The database the tests run against, or an error that says what to set instead.

    The tests write to it, so it must never be the development database. CI has no
    TEST_DATABASE_URL and uses its own database through DATABASE_URL.
    """
    if not test_url:
        if in_ci:
            return dev_url
        raise RuntimeError(
            "TEST_DATABASE_URL is required for local tests. "
            "Point it at village_sqwhere_test, not the development database."
        )
    example = "postgresql://village:village@localhost:5432/village_sqwhere_test"
    if test_url.rstrip("/") == dev_url.rstrip("/"):
        raise RuntimeError(
            "TEST_DATABASE_URL is the same as DATABASE_URL, the development database, and the "
            f"tests write to it. Set TEST_DATABASE_URL to a separate database, such as {example}."
        )
    name = urlparse(test_url).path.strip("/")
    if not name.endswith("_test"):
        raise RuntimeError(
            f"The test database name must end in _test, but TEST_DATABASE_URL points at '{name}'. "
            f"Set TEST_DATABASE_URL to a separate database, such as {example}."
        )
    return test_url


TEST_DB_URL = resolve_test_database_url(
    os.getenv("TEST_DATABASE_URL"), DATABASE_URL, bool(os.getenv("CI"))
)

ASYNC_DATABASE_URL = TEST_DB_URL.replace("postgresql://", "postgresql+asyncpg://")

test_engine = create_async_engine(ASYNC_DATABASE_URL, poolclass=NullPool)
test_async_session = async_sessionmaker(test_engine, expire_on_commit=False)


VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
REDIRECT_URI = "http://localhost:8000/v1/auth/oauth/github/callback"

# Codes the fake GitHub accepts, and the GitHub user each one signs in as.
FAKE_GITHUB_USERS: dict[str, dict[str, object]] = {
    "github-code-ada": {"id": 9100001, "login": "ada-lagos", "name": "Ada Okafor"},
    "github-code-moussa": {"id": 9100002, "login": "moussa-dakar", "name": "Moussa Diop"},
}

# What GitHub's emails endpoint answers for each access token: its rows, or an error to raise.
# A token that is not listed has no emails.
FAKE_GITHUB_EMAILS: dict[str, list[dict[str, object]] | Exception] = {}


async def override_get_db() -> AsyncGenerator[AsyncSession]:
    async with test_async_session() as session:
        yield session


@pytest.fixture(autouse=True)
def override_db_dependency() -> Generator[None]:
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def github(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Pretend GitHub sign-in is set up, and fake GitHub's side of the code exchange."""
    exchanged_codes: list[str] = []

    async def fake_fetch_github_user(
        code: str, redirect_uri: str
    ) -> tuple[dict[str, object], str] | None:
        exchanged_codes.append(code)
        profile = FAKE_GITHUB_USERS.get(code)
        return (profile, f"token-for-{code}") if profile else None

    async def fake_fetch_github_emails(access_token: str) -> list[dict[str, object]]:
        answer = FAKE_GITHUB_EMAILS.get(access_token, [])
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(auth, "GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(auth, "GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setattr(auth, "fetch_github_user", fake_fetch_github_user)
    monkeypatch.setattr(provider_emails, "fetch_github_emails", fake_fetch_github_emails)
    return exchanged_codes


def start_sign_in(client: TestClient, provider: str = "github") -> str:
    """Call /start and return the OAuth state from the authorize URL."""
    resp = client.post(
        f"/v1/auth/oauth/{provider}/start",
        json={
            "intent": "login",
            "redirect_uri": REDIRECT_URI,
            "code_challenge": generate_code_challenge_s256(VERIFIER),
            "code_challenge_method": "S256",
        },
    )
    assert resp.status_code == 200, resp.text
    query = parse_qs(urlparse(resp.json()["data"]["authorize_url"]).query)
    return query["state"][0]


def callback_result(client: TestClient, code: str, state: str, provider: str = "github") -> dict:
    """Call the OAuth callback and return the query of the frontend URL it redirects to."""
    resp = client.get(
        f"/v1/auth/oauth/{provider}/callback",
        params={"code": code, "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    return {
        key: values[0] for key, values in parse_qs(urlparse(resp.headers["location"]).query).items()
    }


@pytest.fixture
def sign_in(client: TestClient, github: list[str]) -> Callable[[str], dict]:
    """Sign in through start, callback and token, as the fake GitHub user for `code`."""

    def _sign_in(code: str = "github-code-ada") -> dict:
        state = start_sign_in(client)
        login_code = callback_result(client, code, state)["login_code"]
        resp = client.post(
            "/v1/auth/token",
            json={"grant_type": "login_code", "login_code": login_code, "code_verifier": VERIFIER},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    return _sign_in


@pytest.fixture
def github_account(github: list[str]) -> Generator[Callable[..., str]]:
    """Make a brand new GitHub account per call and return the code that signs in as it.

    The fixed fake users already exist in the database after the first run, so they never
    take the sign-up path. These are new every time, and deleted afterwards.
    """
    made: list[tuple[str, str]] = []

    def _make(
        *,
        profile_email: str | None = None,
        emails: list[dict[str, object]] | Exception | None = None,
    ) -> str:
        suffix = uuid4().hex[:8]
        code = f"github-code-{suffix}"
        FAKE_GITHUB_USERS[code] = {
            "id": int(suffix, 16),
            "login": f"qa-{suffix}",
            "name": "Test Person",
            "email": profile_email,
        }
        FAKE_GITHUB_EMAILS[f"token-for-{code}"] = emails if emails is not None else []
        made.append((code, str(int(suffix, 16))))
        return code

    yield _make

    async def _delete() -> None:
        async with test_async_session() as session:
            ids = select(UserIdentity.user_id).where(
                UserIdentity.provider_user_id.in_([github_id for _, github_id in made])
            )
            await session.execute(delete(User).where(User.id.in_(ids)))
            await session.commit()

    asyncio.run(_delete())
    for code, _ in made:
        FAKE_GITHUB_USERS.pop(code, None)
        FAKE_GITHUB_EMAILS.pop(f"token-for-{code}", None)


def count_users(username: str) -> int:
    async def _count() -> int:
        async with test_async_session() as session:
            result = await session.execute(
                select(func.count()).select_from(User).where(User.username == username)
            )
            return result.scalar_one()

    return asyncio.run(_count())
