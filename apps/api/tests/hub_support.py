"""Shared helpers for the hub endpoint tests.

The test database is shared and never cleaned, so every helper makes rows with unique
names. Users are made directly in the database and signed in with a real access token,
which is faster than the fake GitHub sign-in and tests the same Bearer check.
"""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
import jwt
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.core.security import create_access_token, create_refresh_token
from app.database import get_db
from app.main import app
from app.models import (
    AgreementSignature,
    AgreementTemplate,
    Hub,
    HubMember,
    Idea,
    IdeaStatus,
    User,
)
from app.services.hubs import current_agreement_template
from tests.conftest import test_async_session as db_session
from tests.conftest import test_engine


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


def make_idea(author: User, *, status: IdeaStatus = IdeaStatus.OPEN, deleted: bool = False) -> Idea:
    async def work(session: AsyncSession) -> Idea:
        idea = Idea(
            author_id=author.id,
            title="Offline farm ledger",
            summary="A ledger app for smallholder farmers in Kano that works fully offline.",
            details="Confidential plan, for hub members only.",
            status=status,
            published_at=None if status == IdeaStatus.DRAFT else datetime.now(UTC),
            deleted_at=datetime.now(UTC) if deleted else None,
        )
        session.add(idea)
        await session.commit()
        return idea

    return run(work)


def current_template() -> AgreementTemplate:
    async def work(session: AsyncSession) -> AgreementTemplate:
        template = await current_agreement_template(session)
        assert template is not None, "the test database has no published agreement"
        return template

    return run(work)


def hub_rows(idea_id: UUID) -> dict[str, list[Any]]:
    """Every hub, signature and membership saved for one idea."""

    async def work(session: AsyncSession) -> dict[str, list[Any]]:
        hub_ids = select(Hub.id).where(Hub.idea_id == idea_id).scalar_subquery()
        hubs = (await session.execute(select(Hub).where(Hub.idea_id == idea_id))).scalars()
        signatures = await session.execute(
            select(AgreementSignature).where(AgreementSignature.hub_id.in_(hub_ids))
        )
        members = await session.execute(select(HubMember).where(HubMember.hub_id.in_(hub_ids)))
        return {
            "hubs": list(hubs),
            "signatures": list(signatures.scalars()),
            "members": list(members.scalars()),
        }

    return run(work)


def count_rows_of_user(user: User) -> int:
    """Hubs, signatures and memberships that belong to one user, added up."""

    async def work(session: AsyncSession) -> int:
        total = 0
        for model, column in (
            (Hub, Hub.owner_id),
            (AgreementSignature, AgreementSignature.user_id),
            (HubMember, HubMember.user_id),
        ):
            result = await session.execute(
                select(func.count()).select_from(model).where(column == user.id)
            )
            total += result.scalar_one()
        return total

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


def request_with_no_published_agreement(
    method: str, url: str, headers: dict[str, str], json: Any = None
) -> httpx.Response:
    """Send one request while no agreement is published.

    The shared test database always has published templates, so the request runs on its own
    connection where an empty temporary table hides the real one. Postgres looks in the
    session's temporary schema first, and the transaction is rolled back at the end.
    """

    async def go() -> httpx.Response:
        async with test_engine.connect() as connection:
            await connection.begin()
            await connection.execute(
                text("CREATE TEMP TABLE agreement_templates (LIKE public.agreement_templates)")
            )

            async def override() -> AsyncGenerator[AsyncSession]:
                yield AsyncSession(bind=connection, expire_on_commit=False)

            app.dependency_overrides[get_db] = override
            # in this loop, because the connection belongs to it
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
                resp = await http.request(method, url, headers=headers, json=json)
            await connection.rollback()
            return resp

    return asyncio.run(go())
