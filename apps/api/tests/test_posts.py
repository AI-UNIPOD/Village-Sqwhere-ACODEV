import asyncio
import os
from collections.abc import Generator

import pytest
from sqlalchemy import text

from app.config import DATABASE_URL
from app.models.users import User
from tests.conftest import test_async_session as db_session


def _guard_test_database() -> None:
    if os.getenv("CI"):
        return
    test_db = os.getenv("TEST_DATABASE_URL")
    if not test_db:
        pytest.fail(
            "TEST_DATABASE_URL must be set to run posts tests locally "
            "without touching the dev database."
        )
    if test_db.rstrip("/") == DATABASE_URL.rstrip("/"):
        pytest.fail("TEST_DATABASE_URL points at the development database")
    if not test_db.rstrip("/").endswith("_test"):
        pytest.fail("TEST_DATABASE_URL database name must end in _test")


async def _truncate() -> None:
    async with db_session() as session:
        await session.execute(
            text("TRUNCATE posts, post_topics, post_likes, saved_posts, post_revisions CASCADE")
        )
        await session.execute(text("DELETE FROM users WHERE username = 'isolation_author'"))
        await session.commit()


def _truncate_posts() -> None:
    asyncio.run(_truncate())


@pytest.fixture(autouse=True)
def cleanup_posts() -> Generator[None]:
    _guard_test_database()
    _truncate_posts()
    try:
        yield
    finally:
        _truncate_posts()


def test_posts_isolation_creation_and_cleanup() -> None:
    # 1. Insert a test author and a test post
    async def _run() -> None:
        async with db_session() as session:
            user = User(
                username="isolation_author",
                display_name="Isolation Author",
            )
            session.add(user)
            await session.commit()

            await session.execute(
                text(
                    "INSERT INTO posts (author_id, title, body, type) "
                    "VALUES (:author_id, :title, :body, 'general')"
                ),
                {"author_id": user.id, "title": "Isolation Test", "body": "Testing row cleanup"},
            )
            await session.commit()

            count = (
                await session.execute(
                    text("SELECT count(*) FROM posts WHERE title = 'Isolation Test'")
                )
            ).scalar_one()
            assert count == 1

    asyncio.run(_run())


def test_posts_isolation_verifies_row_is_gone() -> None:
    # In a fresh connection, assert the cleanup fixture leaves the table empty before each test.
    async def _run() -> None:
        async with db_session() as session:
            count = (
                await session.execute(
                    text("SELECT count(*) FROM posts WHERE title = 'Isolation Test'")
                )
            ).scalar_one()
            assert count == 0

    asyncio.run(_run())
