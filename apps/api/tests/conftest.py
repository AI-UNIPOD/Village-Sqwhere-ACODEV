from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import DATABASE_URL
from app.database import get_db
from app.main import app

ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

test_engine = create_async_engine(ASYNC_DATABASE_URL, poolclass=NullPool)
test_async_session = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession]:
    async with test_async_session() as session:
        yield session


@pytest.fixture(autouse=True)
def override_db_dependency() -> AsyncGenerator[None]:
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()

