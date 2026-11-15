"""Hub terms and the test agreement, checked in the database with plain SQL.

The API has no hub models yet, so these tests talk to the schema directly. Every test runs
in one transaction that is rolled back at the end, and uses its own unique data, so nothing
is left in the shared test database. The hub, its owner's signature and its owner's
membership are created together because the database checks that at commit.
"""

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.conftest import test_engine

TEST_AGREEMENT_SCRIPT = (
    Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "004-test-agreement.sql"
)


def in_rolled_back_transaction[T](work: Callable[[AsyncConnection], Awaitable[T]]) -> T:
    async def run() -> T:
        async with test_engine.connect() as conn:
            transaction = await conn.begin()
            try:
                return await work(conn)
            finally:
                await transaction.rollback()

    return asyncio.run(run())


async def create_hub(
    conn: AsyncConnection,
    terms: str | None = None,
    signed_terms: str = "{}",
) -> dict[str, Any]:
    """A user, their idea, their hub, the owner's signature and the owner's membership.

    `terms` is the hub's terms as JSON text (left out to use the column default).
    `signed_terms` is what the client tries to put in the signature's terms_snapshot.
    """
    suffix = uuid4().hex
    ids = {name: uuid4() for name in ("user", "idea", "hub", "signature")}
    await conn.execute(
        text("INSERT INTO users (id, username, display_name) VALUES (:id, :name, 'Terms Owner')"),
        {"id": ids["user"], "name": f"terms-{suffix[:20]}"},
    )
    await conn.execute(
        text(
            "INSERT INTO ideas (id, author_id, title, summary, status, published_at) "
            "VALUES (:id, :user, 'Offline farm ledger', "
            "'A ledger app for smallholder farmers that works fully offline.', 'open', now())"
        ),
        ids | {"id": ids["idea"]},
    )
    template = (
        await conn.execute(
            text("SELECT id, body_sha256 FROM agreement_templates WHERE version = 1")
        )
    ).one()
    columns = "id, idea_id, owner_id, name, agreement_template_id"
    values = ":hub, :idea, :user, 'Farm Ledger Hub', :template"
    params: dict[str, Any] = ids | {"template": template.id}
    if terms is not None:
        columns += ", terms"
        values += ", CAST(:terms AS jsonb)"
        params["terms"] = terms
    await conn.execute(text(f"INSERT INTO hubs ({columns}) VALUES ({values})"), params)
    await conn.execute(
        text(
            "INSERT INTO agreement_signatures "
            "(id, hub_id, user_id, template_id, template_sha256, signed_legal_name, "
            "terms_snapshot) "
            "VALUES (:signature, :hub, :user, :template, :sha, 'Terms Owner', "
            "CAST(:signed_terms AS jsonb))"
        ),
        ids | {"template": template.id, "sha": template.body_sha256, "signed_terms": signed_terms},
    )
    await conn.execute(
        text(
            "INSERT INTO hub_members (hub_id, user_id, member_role, status, signature_id, "
            "joined_at) VALUES (:hub, :user, 'owner', 'active', :signature, now())"
        ),
        ids,
    )
    return ids


def test_terms_default_to_an_empty_object() -> None:
    async def work(conn: AsyncConnection) -> object:
        ids = await create_hub(conn)
        return (
            await conn.execute(text("SELECT terms FROM hubs WHERE id = :hub"), ids)
        ).scalar_one()

    assert in_rolled_back_transaction(work) == {}


def test_terms_are_stored_with_the_hub() -> None:
    async def work(conn: AsyncConnection) -> object:
        ids = await create_hub(conn, terms=json.dumps({"ownership_model": "equal_split"}))
        return (
            await conn.execute(text("SELECT terms FROM hubs WHERE id = :hub"), ids)
        ).scalar_one()

    assert in_rolled_back_transaction(work) == {"ownership_model": "equal_split"}


@pytest.mark.parametrize("not_an_object", ["[1, 2]", '"equal_split"', "42", "null", "true"])
def test_terms_must_be_a_json_object(not_an_object: str) -> None:
    async def work(conn: AsyncConnection) -> None:
        await create_hub(conn, terms=not_an_object)

    with pytest.raises(DBAPIError, match="hubs_terms_object"):
        in_rolled_back_transaction(work)


def test_terms_cannot_be_changed_after_creation() -> None:
    async def work(conn: AsyncConnection) -> dict[str, Any]:
        ids = await create_hub(conn, terms=json.dumps({"ownership_model": "equal_split"}))
        with pytest.raises(DBAPIError, match="immutable"):
            async with conn.begin_nested():
                await conn.execute(
                    text("UPDATE hubs SET terms = CAST(:terms AS jsonb) WHERE id = :hub"),
                    {
                        "terms": json.dumps({"ownership_model": "owner_takes_all"}),
                        "hub": ids["hub"],
                    },
                )
        return (
            await conn.execute(text("SELECT terms FROM hubs WHERE id = :hub"), ids)
        ).scalar_one()

    assert in_rolled_back_transaction(work) == {"ownership_model": "equal_split"}


def test_other_hub_fields_can_still_change() -> None:
    async def work(conn: AsyncConnection) -> Any:
        ids = await create_hub(conn, terms=json.dumps({"ownership_model": "equal_split"}))
        await conn.execute(
            text("UPDATE hubs SET name = 'Renamed hub', description = 'New text' WHERE id = :hub"),
            ids,
        )
        return (
            await conn.execute(
                text("SELECT name, description, terms FROM hubs WHERE id = :hub"), ids
            )
        ).one()

    row = in_rolled_back_transaction(work)
    assert (row.name, row.description) == ("Renamed hub", "New text")
    assert row.terms == {"ownership_model": "equal_split"}


def test_a_signature_records_the_hubs_own_terms_whatever_the_client_sent() -> None:
    async def work(conn: AsyncConnection) -> object:
        ids = await create_hub(
            conn,
            terms=json.dumps({"ownership_model": "equal_split"}),
            signed_terms=json.dumps({"ownership_model": "owner_takes_all"}),
        )
        return (
            await conn.execute(
                text("SELECT terms_snapshot FROM agreement_signatures WHERE id = :signature"), ids
            )
        ).scalar_one()

    assert in_rolled_back_transaction(work) == {"ownership_model": "equal_split"}


def test_a_signature_on_a_hub_without_terms_records_an_empty_object() -> None:
    async def work(conn: AsyncConnection) -> object:
        ids = await create_hub(
            conn, signed_terms=json.dumps({"ownership_model": "owner_takes_all"})
        )
        return (
            await conn.execute(
                text("SELECT terms_snapshot FROM agreement_signatures WHERE id = :signature"), ids
            )
        ).scalar_one()

    assert in_rolled_back_transaction(work) == {}


def test_the_real_agreement_is_published_in_english_and_french() -> None:
    async def work(conn: AsyncConnection) -> Any:
        return (
            await conn.execute(
                text(
                    "SELECT title, body, body_sha256, published_at "
                    "FROM agreement_templates WHERE version = 2"
                )
            )
        ).one()

    template = in_rolled_back_transaction(work)
    assert template.published_at is not None
    assert template.title == "Village Sqwhere hub agreement"
    assert template.body.startswith("# Village Sqwhere hub agreement\n")
    assert "# Accord d'espace Village Sqwhere\n" in template.body
    # the French colon keeps its narrow no-break space, and no escape was stored as text
    assert "\u202f:" in template.body
    assert "u202f" not in template.body
    for word in ("TEST", "NOT LEGAL", "placeholder"):
        assert word not in template.body
    assert len(template.body_sha256) == 64


def test_the_test_agreement_exists_and_is_published() -> None:
    async def work(conn: AsyncConnection) -> Any:
        return (
            await conn.execute(
                text(
                    "SELECT title, body, body_sha256, published_at "
                    "FROM agreement_templates WHERE version = 1"
                )
            )
        ).one()

    template = in_rolled_back_transaction(work)
    assert template.title == "TEST AGREEMENT (NOT LEGAL TEXT)"
    assert "NOT LEGAL TEXT" in template.body
    assert template.published_at is not None
    assert len(template.body_sha256) == 64


def test_running_the_test_agreement_script_twice_adds_no_second_template() -> None:
    script = TEST_AGREEMENT_SCRIPT.read_text(encoding="utf-8")

    async def count_templates(conn: AsyncConnection) -> int:
        return (await conn.execute(text("SELECT count(*) FROM agreement_templates"))).scalar_one()

    async def work(conn: AsyncConnection) -> list[int]:
        counts = [await count_templates(conn)]
        for _ in range(2):
            await conn.exec_driver_sql(script)
            counts.append(await count_templates(conn))
        return counts

    before, after_first, after_second = in_rolled_back_transaction(work)
    assert before == after_first == after_second
