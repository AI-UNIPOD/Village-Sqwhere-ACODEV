"""The script that dates the demo's signatures the moment their member joined, checked in the
database with plain SQL. Every test runs in one transaction that is rolled back at the end.
"""

from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.test_demo_hubs_agreement_db import add_signer, demo_hub
from tests.test_hub_terms_db import create_hub, in_rolled_back_transaction

SCRIPT = (
    Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "026-demo-signature-dates.sql"
).read_text(encoding="utf-8")


async def joined_ten_days_ago(conn: AsyncConnection, hub: UUID) -> None:
    """Every member of the hub joined ten days ago, so each signature, made when the row was
    inserted, is later than the joining: the state the seed left."""
    await conn.execute(
        text("UPDATE hub_members SET joined_at = now() - interval '10 days' WHERE hub_id = :hub"),
        {"hub": hub},
    )


async def run_script(conn: AsyncConnection) -> None:
    # the script switches a trigger off and on, which the database refuses while this
    # transaction still has checks waiting for its end (a new hub's owner membership)
    await conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    await conn.exec_driver_sql(SCRIPT)


async def dated_at_joining(conn: AsyncConnection, hub: UUID) -> list[bool]:
    """For each member of the hub, whether their signature is dated the moment they joined."""
    rows = await conn.execute(
        text(
            "SELECT s.signed_at = m.joined_at FROM hub_members m "
            "JOIN agreement_signatures s ON s.id = m.signature_id "
            "WHERE m.hub_id = :hub ORDER BY m.member_role"
        ),
        {"hub": hub},
    )
    return [row[0] for row in rows]


async def trigger_row(conn: AsyncConnection) -> tuple[str, str]:
    """The trigger's catalogue row version and whether it is on: a changed row version means the
    script touched the trigger."""
    row = await conn.execute(
        text(
            "SELECT xmin::text, tgenabled::text FROM pg_trigger "
            "WHERE tgname = 'agreement_signatures_append_only'"
        )
    )
    return tuple(row.one())


def test_a_demo_members_signature_is_dated_the_moment_they_joined() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await add_signer(conn, ids["hub"], demo=True)
        await joined_ten_days_ago(conn, ids["hub"])
        before = await dated_at_joining(conn, ids["hub"])
        await run_script(conn)
        return before, await dated_at_joining(conn, ids["hub"])

    before, after = in_rolled_back_transaction(work)
    assert before == [False, False]
    assert after == [True, True]


def test_a_real_persons_signature_in_a_demo_hub_is_left_alone() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await add_signer(conn, ids["hub"], demo=False)
        await joined_ten_days_ago(conn, ids["hub"])
        await run_script(conn)
        # ordered by role: the demo owner first, then the real member
        return await dated_at_joining(conn, ids["hub"])

    assert in_rolled_back_transaction(work) == [True, False]


def test_a_signature_in_a_hub_a_real_person_owns_is_left_alone() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await create_hub(conn)
        await add_signer(conn, ids["hub"], demo=True)
        await joined_ten_days_ago(conn, ids["hub"])
        await run_script(conn)
        return await dated_at_joining(conn, ids["hub"])

    assert in_rolled_back_transaction(work) == [False, False]


def test_a_signature_made_before_the_member_joined_is_not_moved() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await conn.execute(
            text("UPDATE hub_members SET joined_at = now() + interval '1 day' WHERE hub_id = :hub"),
            ids,
        )
        await run_script(conn)
        return await dated_at_joining(conn, ids["hub"])

    assert in_rolled_back_transaction(work) == [False]


def test_running_the_script_twice_changes_nothing_more_and_leaves_the_trigger_alone() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await joined_ten_days_ago(conn, ids["hub"])
        await run_script(conn)
        first = await dated_at_joining(conn, ids["hub"]), await trigger_row(conn)
        await run_script(conn)
        return first, (await dated_at_joining(conn, ids["hub"]), await trigger_row(conn))

    first, second = in_rolled_back_transaction(work)
    assert first == second
    assert first[0] == [True] and first[1][1] == "O"


def test_the_database_still_refuses_a_change_to_a_signature_after_the_script() -> None:
    async def work(conn: AsyncConnection) -> None:
        ids = await demo_hub(conn)
        await joined_ten_days_ago(conn, ids["hub"])
        await run_script(conn)
        assert await dated_at_joining(conn, ids["hub"]) == [True]
        with pytest.raises(DBAPIError, match="append-only"):
            await conn.execute(
                text(
                    "UPDATE agreement_signatures SET signed_legal_name = 'Someone Else' "
                    "WHERE hub_id = :hub"
                ),
                ids,
            )

    in_rolled_back_transaction(work)
