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
    HubMemberRole,
    HubMemberStatus,
    HubStatus,
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


def make_hub(owner: User, *, archived: bool = False, terms: dict[str, Any] | None = None) -> Hub:
    """A hub with its owner's signature and active membership, saved straight to the
    database the way POST /v1/hubs saves it."""
    idea = make_idea(owner)
    template = current_template()

    async def work(session: AsyncSession) -> Hub:
        now = datetime.now(UTC)
        hub = Hub(
            idea_id=idea.id,
            owner_id=owner.id,
            name="Farm Ledger Hub",
            description="Building the offline ledger MVP in Kano.",
            agreement_template_id=template.id,
            terms=terms or {"ownership_model": "equal_split"},
        )
        signature = AgreementSignature(
            hub=hub,
            user_id=owner.id,
            template_id=template.id,
            template_sha256=template.body_sha256,
            signed_legal_name="Amina Bello",
        )
        session.add_all(
            [
                hub,
                signature,
                HubMember(
                    hub=hub,
                    user_id=owner.id,
                    member_role=HubMemberRole.OWNER,
                    status=HubMemberStatus.ACTIVE,
                    signature=signature,
                    joined_at=now,
                ),
            ]
        )
        await session.commit()
        if archived:
            hub.status = HubStatus.ARCHIVED
            hub.archived_at = now
            await session.commit()
        return hub

    return run(work)


def add_member(hub: Hub, user: User, status: HubMemberStatus) -> HubMember:
    """A member of the hub in any status. An active member signs the hub's agreement, an
    invited one is invited by the owner, and one who left or was removed has left_at."""

    async def work(session: AsyncSession) -> HubMember:
        now = datetime.now(UTC)
        template = await session.get(AgreementTemplate, hub.agreement_template_id)
        assert template is not None
        signature = None
        if status == HubMemberStatus.ACTIVE:
            # the hub is already saved, so its id is set directly
            signature = AgreementSignature(
                hub_id=hub.id,
                user_id=user.id,
                template_id=template.id,
                template_sha256=template.body_sha256,
                signed_legal_name="Kwame Mensah",
            )
            session.add(signature)
        member = HubMember(
            hub_id=hub.id,
            user_id=user.id,
            status=status,
            invited_by=hub.owner_id if status == HubMemberStatus.INVITED else None,
            joined_at=now if status == HubMemberStatus.ACTIVE else None,
            left_at=now if status in {HubMemberStatus.LEFT, HubMemberStatus.REMOVED} else None,
        )
        # Only set when there is one: setting it to None makes SQLAlchemy blank every column
        # of the composite foreign key, hub_id (part of the primary key) included.
        if signature is not None:
            member.signature = signature
        session.add(member)
        await session.commit()
        return member

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
