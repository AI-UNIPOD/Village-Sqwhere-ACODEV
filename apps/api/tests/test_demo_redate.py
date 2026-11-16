"""The demo is dated back from now again once its newest post has grown old."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select, text

from app import config, demo_seed
from app.demo_seed import redate_if_stale, seed
from app.models import Post, User
from app.workers import runner
from tests.conftest import test_async_session as db_session


@pytest.fixture(autouse=True)
def demo_on_and_world_written_elsewhere(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    written: list[int] = []

    async def community(db: Any) -> tuple[int, int]:
        written.append(1)  # test_demo_world.py writes the wider community and checks it
        return 0, 0

    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    monkeypatch.setattr(demo_seed, "write_world", community)
    monkeypatch.setattr(runner, "async_session", db_session)
    monkeypatch.setattr(runner, "last_redate_try", None)
    return written


def _run(work):
    async def go():
        async with db_session() as session:
            return await work(session)

    return asyncio.run(go())


async def _newest(session) -> datetime:
    return await session.scalar(
        select(func.max(Post.created_at)).where(
            Post.author_id.in_(select(User.id).where(User.is_demo))
        )
    )


def _age_the_demo(days: int) -> None:
    async def work(session):
        # a post cannot change its own time, so the test lets the trigger step aside
        await session.execute(text("SET LOCAL session_replication_role = replica"))
        await session.execute(
            text(
                """UPDATE posts SET created_at = created_at - make_interval(days => :days)
                   WHERE author_id IN (SELECT id FROM users WHERE is_demo)"""
            ),
            {"days": days},
        )
        await session.commit()

    _run(work)


def test_a_demo_that_has_grown_old_is_dated_back_from_now_again(
    demo_on_and_world_written_elsewhere: list[int],
) -> None:
    _run(lambda session: seed(session))
    _age_the_demo(5)
    assert datetime.now(UTC) - _run(_newest) > timedelta(days=4)

    assert _run(redate_if_stale) is True

    assert datetime.now(UTC) - _run(_newest) < timedelta(hours=3)
    assert demo_on_and_world_written_elsewhere == [1]


def test_a_demo_written_today_is_left_alone(
    demo_on_and_world_written_elsewhere: list[int],
) -> None:
    _run(lambda session: seed(session))

    assert _run(redate_if_stale) is False
    assert demo_on_and_world_written_elsewhere == []


def test_nothing_is_written_where_the_demo_is_off(
    monkeypatch: pytest.MonkeyPatch, demo_on_and_world_written_elsewhere: list[int]
) -> None:
    _run(lambda session: seed(session))
    _age_the_demo(5)
    monkeypatch.setattr(config, "DEMO_ENABLED", False)

    assert _run(redate_if_stale) is False
    assert datetime.now(UTC) - _run(_newest) > timedelta(days=4)
    assert demo_on_and_world_written_elsewhere == []


def test_a_worker_pass_redates_a_stale_demo(
    demo_on_and_world_written_elsewhere: list[int], caplog: pytest.LogCaptureFixture
) -> None:
    _run(lambda session: seed(session))
    _age_the_demo(5)

    with caplog.at_level(logging.INFO):
        asyncio.run(runner.redate_demo())

    assert demo_on_and_world_written_elsewhere == [1]
    assert datetime.now(UTC) - _run(_newest) < timedelta(hours=3)
    assert "dated back from now again" in caplog.text


def test_a_failed_redate_is_logged_and_tried_again_an_hour_later_not_on_every_pass(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    calls: list[int] = []

    async def explode(db: Any) -> bool:
        calls.append(1)
        raise RuntimeError("the database went away")

    monkeypatch.setattr(runner, "redate_if_stale", explode)

    with caplog.at_level(logging.ERROR):
        asyncio.run(runner.redate_demo())
        asyncio.run(runner.redate_demo())
    assert calls == [1]
    assert "Re-dating the demo failed" in caplog.text

    monkeypatch.setattr(
        runner, "last_redate_try", datetime.now(UTC) - runner.REDATE_RETRY_AFTER * 2
    )
    asyncio.run(runner.redate_demo())
    assert calls == [1, 1]


def test_a_failed_redate_never_stops_the_rest_of_a_worker_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def explode(db: Any) -> bool:
        raise RuntimeError("the database went away")

    async def nothing() -> list:
        return []

    async def embed(embedder: Any) -> int:
        return 0

    monkeypatch.setattr(runner, "redate_if_stale", explode)
    monkeypatch.setattr(runner, "pending_session_ids", nothing)
    monkeypatch.setattr(runner, "report_session_ids", nothing)
    monkeypatch.setattr(runner, "embed_missing", embed)

    assert asyncio.run(runner.run_once()) == 0
