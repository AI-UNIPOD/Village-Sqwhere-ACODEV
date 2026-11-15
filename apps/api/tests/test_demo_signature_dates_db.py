"""The script that dates the demo's signatures at the moment each member joined, checked in the
database with plain SQL. Every test runs in one transaction that is rolled back at the end.
"""

from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.test_hub_terms_db import create_hub, in_rolled_back_transaction

SCRIPT = (
    Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "026-demo-signature-dates.sql"
).read_text(encoding="utf-8")

# how long after joining the signature is dated, in seconds (negative: before)
GAP = (
    "SELECT round(extract(epoch FROM s.signed_at - m.joined_at)) "
    "FROM agreement_signatures s JOIN hub_members m ON m.signature_id = s.id "
    "WHERE s.hub_id = :hub"
)


async def hub_joined(conn: AsyncConnection, days_ago: int, demo: bool) -> dict[str, Any]:
    """A hub whose owner signed just now and joined `days_ago` days ago (negative: later)."""
    ids = await create_hub(conn)
    await conn.execute(
        text(
            "UPDATE hub_members SET joined_at = now() - make_interval(days => :days)"
            " WHERE hub_id = :hub"
        ),
        ids | {"days": days_ago},
    )
    if demo:
        await conn.execute(text("UPDATE users SET is_demo = true WHERE id = :user"), ids)
    return ids


async def run_script(conn: AsyncConnection) -> None:
    # the script changes a table's trigger, which the database refuses while this transaction
    # still has checks waiting for its end (a new hub's owner membership)
    await conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    await conn.exec_driver_sql(SCRIPT)


async def gap(conn: AsyncConnection, ids: dict[str, Any]) -> int:
    return int((await conn.execute(text(GAP), ids)).scalar_one())


def test_a_demo_signature_dated_after_the_joining_moves_to_the_joining() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await hub_joined(conn, days_ago=10, demo=True)
        before = await gap(conn, ids)
        await run_script(conn)
        return before, await gap(conn, ids)

    before, after = in_rolled_back_transaction(work)
    assert before == 10 * 24 * 3600
    assert after == 0


def test_a_real_persons_signature_keeps_its_date() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await hub_joined(conn, days_ago=10, demo=False)
        await run_script(conn)
        return await gap(conn, ids)

    assert in_rolled_back_transaction(work) == 10 * 24 * 3600


def test_a_demo_signature_dated_before_the_joining_is_left_alone() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await hub_joined(conn, days_ago=-2, demo=True)
        await run_script(conn)
        return await gap(conn, ids)

    assert in_rolled_back_transaction(work) == -2 * 24 * 3600


def test_running_the_script_twice_changes_nothing_more() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await hub_joined(conn, days_ago=10, demo=True)
        await run_script(conn)
        first = await gap(conn, ids)
        await run_script(conn)
        return first, await gap(conn, ids)

    assert in_rolled_back_transaction(work) == (0, 0)


@pytest.mark.parametrize(
    "change",
    [
        "UPDATE agreement_signatures SET signed_at = now() WHERE hub_id = :hub",
        "DELETE FROM agreement_signatures WHERE hub_id = :hub",
    ],
)
def test_the_database_still_refuses_these_changes_after_the_script(change: str) -> None:
    async def work(conn: AsyncConnection) -> None:
        ids = await hub_joined(conn, days_ago=10, demo=True)
        await run_script(conn)
        assert await gap(conn, ids) == 0
        switched_on = await conn.execute(
            text(
                "SELECT count(*) FROM pg_trigger "
                "WHERE tgenabled = 'O' AND tgname = 'agreement_signatures_append_only'"
            )
        )
        assert switched_on.scalar_one() == 1
        with pytest.raises(DBAPIError, match="append-only"):
            await conn.execute(text(change), ids)

    in_rolled_back_transaction(work)
