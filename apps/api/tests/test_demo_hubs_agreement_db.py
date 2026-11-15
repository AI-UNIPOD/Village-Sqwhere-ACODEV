"""The script that moves the demo's hubs from the test agreement to version 2, checked in the
database with plain SQL. Every test runs in one transaction that is rolled back at the end.
"""

from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.test_hub_terms_db import create_hub, in_rolled_back_transaction

SCRIPT = (
    Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "022-demo-hubs-agreement-v2.sql"
).read_text(encoding="utf-8")


async def demo_hub(conn: AsyncConnection) -> dict[str, Any]:
    """A hub on version 1 whose owner, the only signer, is a demo account."""
    ids = await create_hub(conn)
    await conn.execute(text("UPDATE users SET is_demo = true WHERE id = :user"), ids)
    return ids


async def add_signer(conn: AsyncConnection, hub: UUID, demo: bool) -> None:
    """A second active member of the hub who signed the hub's agreement."""
    user, signature = uuid4(), uuid4()
    await conn.execute(
        text(
            "INSERT INTO users (id, username, display_name, is_demo) "
            "VALUES (:id, :name, 'Second Signer', :demo)"
        ),
        {"id": user, "name": f"signer-{uuid4().hex[:20]}", "demo": demo},
    )
    await conn.execute(
        text(
            "INSERT INTO agreement_signatures "
            "(id, hub_id, user_id, template_id, template_sha256, signed_legal_name) "
            "SELECT :signature, h.id, :user, t.id, t.body_sha256, 'Second Signer' "
            "FROM hubs h JOIN agreement_templates t ON t.id = h.agreement_template_id "
            "WHERE h.id = :hub"
        ),
        {"signature": signature, "user": user, "hub": hub},
    )
    await conn.execute(
        text(
            "INSERT INTO hub_members (hub_id, user_id, member_role, status, signature_id, "
            "joined_at) VALUES (:hub, :user, 'member', 'active', :signature, now())"
        ),
        {"hub": hub, "user": user, "signature": signature},
    )


async def run_script(conn: AsyncConnection) -> None:
    # the script changes two tables' triggers, which the database refuses while this
    # transaction still has checks waiting for its end (a new hub's owner membership)
    await conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    await conn.exec_driver_sql(SCRIPT)


async def versions(conn: AsyncConnection, hub: UUID) -> tuple[int, list[tuple[int, bool]]]:
    """The version of the hub's agreement, and for each signature in it the version it points
    at and whether its fingerprint is that version's."""
    of_hub = (
        await conn.execute(
            text(
                "SELECT t.version FROM hubs h "
                "JOIN agreement_templates t ON t.id = h.agreement_template_id WHERE h.id = :hub"
            ),
            {"hub": hub},
        )
    ).scalar_one()
    of_signatures = (
        await conn.execute(
            text(
                "SELECT t.version, s.template_sha256 = t.body_sha256 "
                "FROM agreement_signatures s JOIN agreement_templates t ON t.id = s.template_id "
                "WHERE s.hub_id = :hub ORDER BY 1"
            ),
            {"hub": hub},
        )
    ).all()
    return of_hub, [tuple(row) for row in of_signatures]


def test_a_demo_hub_and_its_signatures_move_to_version_2() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await add_signer(conn, ids["hub"], demo=True)
        before = await versions(conn, ids["hub"])
        await run_script(conn)
        return before, await versions(conn, ids["hub"])

    before, after = in_rolled_back_transaction(work)
    assert before == (1, [(1, True), (1, True)])
    assert after == (2, [(2, True), (2, True)])


def test_a_real_persons_hub_stays_on_the_agreement_they_signed() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await create_hub(conn)
        await run_script(conn)
        return await versions(conn, ids["hub"])

    assert in_rolled_back_transaction(work) == (1, [(1, True)])


def test_a_demo_hub_that_a_real_person_signed_is_left_alone() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await add_signer(conn, ids["hub"], demo=False)
        await run_script(conn)
        return await versions(conn, ids["hub"])

    assert in_rolled_back_transaction(work) == (1, [(1, True), (1, True)])


def test_a_demo_hub_on_a_later_version_is_not_moved_back() -> None:
    async def work(conn: AsyncConnection) -> Any:
        later = (
            await conn.execute(
                text(
                    "INSERT INTO agreement_templates (version, title, body, published_at) "
                    "SELECT max(version) + 1, 'A later agreement', 'Later text.', now() "
                    "FROM agreement_templates RETURNING id, version, body_sha256"
                )
            )
        ).one()
        ids = await demo_hub(conn)
        other = await create_hub_on(conn, later.id, later.body_sha256)
        await run_script(conn)
        return later.version, await versions(conn, other), await versions(conn, ids["hub"])

    later, on_later, on_first = in_rolled_back_transaction(work)
    assert on_later == (later, [(later, True)])
    assert on_first == (2, [(2, True)])


async def create_hub_on(conn: AsyncConnection, template: UUID, sha: str) -> UUID:
    """A demo account's hub created on the given agreement."""
    ids = {name: uuid4() for name in ("user", "idea", "hub", "signature")}
    params = ids | {"template": template, "sha": sha, "name": f"later-{uuid4().hex[:20]}"}
    for statement in (
        "INSERT INTO users (id, username, display_name, is_demo) "
        "VALUES (:user, :name, 'Later Owner', true)",
        "INSERT INTO ideas (id, author_id, title, summary, status, published_at) "
        "VALUES (:idea, :user, 'Clinic queue board', "
        "'A queue board for small clinics that works on one old phone.', 'open', now())",
        "INSERT INTO hubs (id, idea_id, owner_id, name, agreement_template_id) "
        "VALUES (:hub, :idea, :user, 'Clinic Queue Hub', :template)",
        "INSERT INTO agreement_signatures "
        "(id, hub_id, user_id, template_id, template_sha256, signed_legal_name) "
        "VALUES (:signature, :hub, :user, :template, :sha, 'Later Owner')",
        "INSERT INTO hub_members (hub_id, user_id, member_role, status, signature_id, joined_at) "
        "VALUES (:hub, :user, 'owner', 'active', :signature, now())",
    ):
        await conn.execute(text(statement), params)
    return ids["hub"]


def test_running_the_script_twice_changes_nothing_more() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await demo_hub(conn)
        await run_script(conn)
        first = await versions(conn, ids["hub"])
        await run_script(conn)
        return first, await versions(conn, ids["hub"])

    first, second = in_rolled_back_transaction(work)
    assert first == second == (2, [(2, True)])


@pytest.mark.parametrize(
    "change",
    [
        "UPDATE agreement_signatures SET signed_legal_name = 'Someone Else' WHERE hub_id = :hub",
        "DELETE FROM agreement_signatures WHERE hub_id = :hub",
        "UPDATE hubs SET agreement_template_id = "
        "(SELECT id FROM agreement_templates WHERE version = 1) WHERE id = :hub",
    ],
)
def test_the_database_still_refuses_these_changes_after_the_script(change: str) -> None:
    async def work(conn: AsyncConnection) -> None:
        ids = await demo_hub(conn)
        await run_script(conn)
        await conn.execute(text(change), ids)

    with pytest.raises(DBAPIError, match="append-only|immutable"):
        in_rolled_back_transaction(work)
