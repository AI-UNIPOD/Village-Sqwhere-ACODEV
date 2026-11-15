"""The idea and hub models against the real database.

The shared test database is never cleaned, and hubs, signatures and members cannot be
deleted, so every test makes its own users, ideas and agreement templates with unique
names and versions.
"""

import asyncio
import hashlib
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AgreementSignature,
    AgreementTemplate,
    Hub,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubStatus,
    Idea,
    IdeaEmbedding,
    IdeaStage,
    IdeaStatus,
    User,
    UserEmbedding,
)
from tests.conftest import test_async_session as db_session

NEW_MODELS = [
    Idea,
    AgreementTemplate,
    Hub,
    AgreementSignature,
    HubMember,
    IdeaEmbedding,
    UserEmbedding,
]


def run[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    async def go() -> T:
        async with db_session() as session:
            return await work(session)

    return asyncio.run(go())


async def make_user(session: AsyncSession) -> User:
    user = User(username=f"hub-{uuid4().hex[:20]}", display_name="Amina Bello")
    session.add(user)
    await session.flush()
    return user


async def make_idea(session: AsyncSession, author: User) -> Idea:
    idea = Idea(
        author_id=author.id,
        title="Offline farm ledger",
        summary="A ledger app for smallholder farmers in Kano that works fully offline.",
        details="Confidential plan, for hub members only.",
        status=IdeaStatus.OPEN,
        published_at=datetime.now(UTC),
    )
    session.add(idea)
    await session.flush()
    return idea


async def make_template(session: AsyncSession, published: bool = True) -> AgreementTemplate:
    template = AgreementTemplate(
        version=random.randint(10_000, 2_000_000_000),
        title="Agreement for the hub model tests",
        body=f"Placeholder agreement text for tests only, {uuid4()}.",
        published_at=datetime.now(UTC) if published else None,
    )
    session.add(template)
    await session.flush()
    return template


def hub_with_owner(
    owner: User,
    idea: Idea,
    template: AgreementTemplate,
    terms: dict[str, Any] | None = None,
) -> tuple[Hub, AgreementSignature, HubMember]:
    """A hub, its owner's signature and its owner's membership, not yet added."""
    hub_id, signature_id = uuid4(), uuid4()
    hub = Hub(
        id=hub_id,
        idea_id=idea.id,
        owner_id=owner.id,
        name="Farm Ledger Hub",
        agreement_template_id=template.id,
    )
    if terms is not None:
        hub.terms = terms
    signature = AgreementSignature(
        id=signature_id,
        hub_id=hub_id,
        user_id=owner.id,
        template_id=template.id,
        template_sha256=template.body_sha256,
        signed_legal_name="Amina Bello",
        ip_address="102.89.12.7",
    )
    member = HubMember(
        hub_id=hub_id,
        user_id=owner.id,
        member_role=HubMemberRole.OWNER,
        status=HubMemberStatus.ACTIVE,
        signature_id=signature_id,
        joined_at=datetime.now(UTC),
    )
    return hub, signature, member


async def create_committed_hub(terms: dict[str, Any] | None = None) -> UUID:
    async with db_session() as session:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        hub, signature, member = hub_with_owner(owner, idea, template, terms=terms)
        session.add_all([hub, signature, member])
        await session.commit()
        return hub.id


# --- the models match the tables ---------------------------------------------------------


async def database_columns(session: AsyncSession, table: str) -> dict[str, tuple[str, bool]]:
    rows = await session.execute(
        text(
            "SELECT attname, format_type(atttypid, atttypmod), attnotnull FROM pg_attribute "
            "WHERE attrelid = to_regclass(:table) AND attnum > 0 AND NOT attisdropped"
        ),
        {"table": table},
    )
    return {name: (kind, not_null) for name, kind, not_null in rows}


async def database_foreign_keys(session: AsyncSession, table: str) -> set[tuple]:
    column_names = (
        "ARRAY(SELECT a.attname::text FROM unnest({keys}) WITH ORDINALITY k(n, i) "
        "JOIN pg_attribute a ON a.attrelid = {table} AND a.attnum = k.n ORDER BY k.i)"
    )
    rows = await session.execute(
        text(
            "SELECT "
            + column_names.format(keys="c.conkey", table="c.conrelid")
            + ", c.confrelid::regclass::text, "
            + column_names.format(keys="c.confkey", table="c.confrelid")
            + " FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = to_regclass(:table)"
        ),
        {"table": table},
    )
    return {
        (tuple(columns), referred, tuple(referred_columns))
        for columns, referred, referred_columns in rows
    }


@pytest.mark.parametrize("model", NEW_MODELS, ids=lambda m: m.__tablename__)
def test_model_columns_match_the_table(model: Any) -> None:
    expected = run(lambda session: database_columns(session, model.__tablename__))
    mapped = {
        column.name: (
            column.type.compile(dialect=postgresql.dialect()).lower(),
            not column.nullable,
        )
        for column in model.__table__.columns
    }
    assert mapped == expected


@pytest.mark.parametrize("model", NEW_MODELS, ids=lambda m: m.__tablename__)
def test_model_foreign_keys_match_the_table(model: Any) -> None:
    expected = run(lambda session: database_foreign_keys(session, model.__tablename__))
    mapped = {
        (
            tuple(column.name for column in constraint.columns),
            constraint.referred_table.name,
            tuple(element.column.name for element in constraint.elements),
        )
        for constraint in model.__table__.foreign_key_constraints
    }
    assert mapped == expected


# --- a hub created and read back ---------------------------------------------------------


def test_a_hub_with_its_owner_signature_and_membership_is_created_in_one_transaction() -> None:
    terms = {"ownership_model": "equal_split"}

    async def create(session: AsyncSession) -> dict[str, Any]:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        # the database computed the hash, and it is already loaded after the flush
        assert template.body_sha256 == hashlib.sha256(template.body.encode()).hexdigest()
        hub, signature, member = hub_with_owner(owner, idea, template, terms=terms)
        session.add_all([hub, signature, member])
        await session.flush()
        # columns the database fills are read back by the flush, not by a lazy load
        assert signature.terms_snapshot == terms
        assert hub.updated_at is not None
        await session.commit()
        return {"hub": hub.id, "signature": signature.id, "owner": owner.id, "idea": idea.id}

    ids = run(create)

    async def read(session: AsyncSession) -> None:
        hub = await session.get(Hub, ids["hub"])
        assert hub is not None
        assert hub.status is HubStatus.ACTIVE
        assert hub.terms == terms
        assert hub.archived_at is None
        assert hub.created_at.tzinfo is not None
        assert hub.updated_at == hub.created_at
        assert hub.idea.id == ids["idea"]
        assert hub.idea.stage is IdeaStage.CONCEPT
        assert hub.owner.id == ids["owner"]
        assert hub.agreement_template.published_at is not None

        signature = await session.get(AgreementSignature, ids["signature"])
        assert signature is not None
        assert signature.terms_snapshot == terms
        assert signature.template_sha256 == hub.agreement_template.body_sha256
        assert signature.signed_at.tzinfo is not None
        assert str(signature.ip_address) == "102.89.12.7"

        member = await session.get(HubMember, (ids["hub"], ids["owner"]))
        assert member is not None
        assert member.member_role is HubMemberRole.OWNER
        assert member.status is HubMemberStatus.ACTIVE
        assert member.hub.id == ids["hub"]

    run(read)


def test_terms_default_to_an_empty_object() -> None:
    hub_id = asyncio.run(create_committed_hub())

    async def read(session: AsyncSession) -> object:
        return (await session.execute(select(Hub.terms).where(Hub.id == hub_id))).scalar_one()

    assert run(read) == {}


def test_other_hub_fields_can_change_and_updated_at_moves() -> None:
    hub_id = asyncio.run(create_committed_hub({"ownership_model": "equal_split"}))

    async def rename(session: AsyncSession) -> Hub:
        hub = await session.get(Hub, hub_id)
        assert hub is not None
        hub.name = "Renamed Farm Ledger Hub"
        hub.description = "Now with a description."
        await session.commit()
        return hub

    hub = run(rename)
    assert hub.name == "Renamed Farm Ledger Hub"
    assert hub.updated_at > hub.created_at
    assert hub.terms == {"ownership_model": "equal_split"}


@pytest.mark.parametrize(
    ("model", "column", "value"),
    [
        (AgreementTemplate, "body_sha256", "0" * 64),
        (AgreementSignature, "terms_snapshot", {"ownership_model": "owner_takes_all"}),
    ],
)
def test_python_cannot_set_columns_the_database_computes(
    model: Any, column: str, value: object
) -> None:
    # the database would overwrite the value, but the object would keep the wrong one
    with pytest.raises(ValueError, match="computed by the database"):
        model(**{column: value})


# --- what the database refuses -----------------------------------------------------------


def expect_refusal(match: str, work: Callable[[AsyncSession], Awaitable[None]]) -> None:
    with pytest.raises(DBAPIError, match=match):
        run(work)


def test_terms_cannot_change_after_creation() -> None:
    hub_id = asyncio.run(create_committed_hub({"ownership_model": "equal_split"}))

    async def change(session: AsyncSession) -> None:
        hub = await session.get(Hub, hub_id)
        assert hub is not None
        hub.terms = {"ownership_model": "owner_takes_all"}
        await session.commit()

    expect_refusal("immutable", change)


def test_the_hub_owner_must_be_the_ideas_author() -> None:
    async def work(session: AsyncSession) -> None:
        author = await make_user(session)
        someone_else = await make_user(session)
        idea = await make_idea(session, author)
        template = await make_template(session)
        session.add_all(hub_with_owner(someone_else, idea, template))
        await session.commit()

    expect_refusal("hubs_idea_owner_fk", work)


def test_an_idea_has_at_most_one_hub() -> None:
    async def work(session: AsyncSession) -> None:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        session.add_all(hub_with_owner(owner, idea, template))
        await session.flush()
        session.add_all(hub_with_owner(owner, idea, template))
        await session.commit()

    expect_refusal("hubs_one_per_idea_uq", work)


def test_a_hub_needs_a_published_agreement_template() -> None:
    async def work(session: AsyncSession) -> None:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session, published=False)
        session.add_all(hub_with_owner(owner, idea, template))
        await session.commit()

    expect_refusal("published agreement template", work)


@pytest.mark.parametrize(
    ("status", "archived_at"),
    [(HubStatus.ARCHIVED, None), (HubStatus.ACTIVE, datetime.now(UTC))],
    ids=["archived without archived_at", "active with archived_at"],
)
def test_archived_status_and_archived_at_go_together(
    status: HubStatus, archived_at: datetime | None
) -> None:
    async def work(session: AsyncSession) -> None:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        hub, signature, member = hub_with_owner(owner, idea, template)
        hub.status = status
        hub.archived_at = archived_at
        session.add_all([hub, signature, member])
        await session.commit()

    expect_refusal("hubs_archived_at", work)


def test_an_active_member_needs_a_signature() -> None:
    async def work(session: AsyncSession) -> None:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        hub, _, member = hub_with_owner(owner, idea, template)
        member.signature_id = None
        session.add_all([hub, member])
        await session.commit()

    expect_refusal("hub_members_active_requires_signature", work)


def test_a_hub_without_its_owner_membership_is_refused_at_commit() -> None:
    async def work(session: AsyncSession) -> None:
        owner = await make_user(session)
        idea = await make_idea(session, owner)
        template = await make_template(session)
        hub, signature, _ = hub_with_owner(owner, idea, template)
        session.add_all([hub, signature])
        await session.flush()  # accepted for now: the check waits for the commit
        await session.commit()

    expect_refusal("no owner membership", work)
