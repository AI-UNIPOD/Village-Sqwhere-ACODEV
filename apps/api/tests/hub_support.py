"""Shared helpers for the hub endpoint tests.

The test database is shared and never cleaned, so every helper makes rows with unique
names. Users are made directly in the database and signed in with a real access token,
which is faster than the fake GitHub sign-in and tests the same Bearer check.
"""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.core.security import create_access_token, create_refresh_token
from app.models import User
from tests.conftest import test_async_session as db_session


def run[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    async def go() -> T:
        async with db_session() as session:
            return await work(session)

    return asyncio.run(go())


def make_user(*, deleted: bool = False) -> User:
    async def work(session: AsyncSession) -> User:
        user = User(
            username=f"hub-{uuid4().hex[:20]}",
            display_name="Amina Bello",
            deleted_at=datetime.now(UTC) if deleted else None,
        )
        session.add(user)
        await session.commit()
        return user

    return run(work)


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def bad_auth_headers() -> dict[str, dict[str, str]]:
    """Every way a request can fail sign-in, by name, for parametrised 401 tests."""
    someone = uuid4()
    expired = jwt.encode(
        {
            "sub": str(someone),
            "type": "access",
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )
    refresh, _ = create_refresh_token(someone)
    return {
        "no token": {},
        "malformed token": {"Authorization": "Bearer not-a-jwt"},
        "expired token": {"Authorization": f"Bearer {expired}"},
        "refresh token": {"Authorization": f"Bearer {refresh}"},
        "basic scheme": {"Authorization": f"Basic {create_access_token(someone)}"},
        "user does not exist": {"Authorization": f"Bearer {create_access_token(someone)}"},
    }
