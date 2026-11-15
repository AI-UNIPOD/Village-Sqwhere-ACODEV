import os
from collections.abc import AsyncGenerator, Mapping
from typing import Any

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import DATABASE_URL


def async_database_url(url: str) -> str:
    """Turn a libpq-style URL into one asyncpg accepts.

    Hosted Postgres (Neon through Vercel) hands out `sslmode` and `channel_binding`,
    which asyncpg's connect() rejects; asyncpg reads `ssl` instead.
    """
    parsed = make_url(url).set(drivername="postgresql+asyncpg")
    query = dict(parsed.query)
    query.pop("channel_binding", None)
    sslmode = query.pop("sslmode", None)
    if sslmode and "ssl" not in query:
        query["ssl"] = sslmode
    return parsed.set(query=query).render_as_string(hide_password=False)


def engine_options(environ: Mapping[str, str]) -> dict[str, Any]:
    """On Vercel, each request can run on a fresh event loop, and a pooled asyncpg
    connection from an earlier request fails when it is reset there. Open one per session."""
    return {"poolclass": NullPool} if environ.get("VERCEL") else {}


ASYNC_DATABASE_URL = async_database_url(DATABASE_URL)

engine = create_async_engine(ASYNC_DATABASE_URL, echo=True, **engine_options(os.environ))
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        yield session
