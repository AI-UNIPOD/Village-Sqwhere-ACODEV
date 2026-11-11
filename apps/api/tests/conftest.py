import asyncio
import os
from collections.abc import AsyncGenerator, Callable, Generator
from urllib.parse import parse_qs, urlparse

import pytest

# The API refuses to start without a signing key. This one is for tests only.
os.environ.setdefault("JWT_SECRET_KEY", "test-only-signing-key-never-use-for-real-0123456789")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.api.v1 import auth  # noqa: E402
from app.config import DATABASE_URL  # noqa: E402
from app.core.security import generate_code_challenge_s256  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.users import User  # noqa: E402

TEST_DB_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DB_URL:
    if os.getenv("CI"):
        TEST_DB_URL = DATABASE_URL
    else:
        raise RuntimeError(
            "TEST_DATABASE_URL is required for local tests. "
            "Point it at village_sqwhere_test, not the development database."
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

    async def fake_fetch_github_user(code: str, redirect_uri: str) -> dict[str, object] | None:
        exchanged_codes.append(code)
        return FAKE_GITHUB_USERS.get(code)

    monkeypatch.setattr(auth, "GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(auth, "GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setattr(auth, "fetch_github_user", fake_fetch_github_user)
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


def count_users(username: str) -> int:
    async def _count() -> int:
        async with test_async_session() as session:
            result = await session.execute(
                select(func.count()).select_from(User).where(User.username == username)
            )
            return result.scalar_one()

    return asyncio.run(_count())
