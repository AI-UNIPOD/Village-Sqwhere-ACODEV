import asyncio
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DeletionReason,
    Post,
    PostLike,
    PostRevision,
    PostTopic,
    PostType,
    SavedPost,
    User,
)
from tests.conftest import test_async_session as db_session

POST_MODELS = [Post, PostTopic, PostRevision, PostLike, SavedPost]

REFERENTIAL_ACTION = {
    "a": "NO ACTION",
    "r": "RESTRICT",
    "c": "CASCADE",
    "n": "SET NULL",
    "d": "SET DEFAULT",
}


def run[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    async def go() -> T:
        async with db_session() as session:
            return await work(session)

    return asyncio.run(go())


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
            + ", c.confdeltype"
            + " FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = to_regclass(:table)"
        ),
        {"table": table},
    )
    return {
        (
            tuple(columns),
            referred,
            tuple(referred_columns),
            REFERENTIAL_ACTION.get(
                deltype.decode() if isinstance(deltype, bytes) else str(deltype), deltype
            ),
        )
        for columns, referred, referred_columns, deltype in rows
    }


async def database_default_columns(session: AsyncSession, table: str) -> set[str]:
    rows = await session.execute(
        text(
            "SELECT a.attname FROM pg_attribute a "
            "JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum "
            "WHERE a.attrelid = to_regclass(:table) AND a.attnum > 0 AND NOT a.attisdropped"
        ),
        {"table": table},
    )
    return {name for (name,) in rows}


@pytest.mark.parametrize("model", POST_MODELS, ids=lambda m: m.__tablename__)
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


@pytest.mark.parametrize("model", POST_MODELS, ids=lambda m: m.__tablename__)
def test_model_foreign_keys_match_the_table(model: Any) -> None:
    expected = run(lambda session: database_foreign_keys(session, model.__tablename__))
    mapped = {
        (
            tuple(column.name for column in constraint.columns),
            constraint.referred_table.name,
            tuple(element.column.name for element in constraint.elements),
            (constraint.ondelete or "NO ACTION").upper(),
        )
        for constraint in model.__table__.foreign_key_constraints
    }
    assert mapped == expected


@pytest.mark.parametrize("model", POST_MODELS, ids=lambda m: m.__tablename__)
def test_model_server_default_columns_match_the_table(model: Any) -> None:
    expected = run(lambda session: database_default_columns(session, model.__tablename__))
    mapped = {
        column.name
        for column in model.__table__.columns
        if column.server_default is not None and column.identity is None
    }
    assert mapped == expected


def test_post_type_enum_has_all_values() -> None:
    assert {member.value for member in PostType} == {
        "general",
        "question",
        "architecture_challenge",
        "code_review_request",
        "oss_release",
        "rfc",
        "research_note",
        "hub_milestone",
    }


def test_deletion_reason_enum_has_all_values() -> None:
    assert {member.value for member in DeletionReason} == {
        "author",
        "moderator",
        "account_deleted",
    }


def test_post_author_lazy_raise() -> None:
    async def check(session: AsyncSession) -> None:
        author = User(
            username=f"author-{uuid4().hex[:16]}",
            display_name="Test Author",
        )
        session.add(author)
        await session.flush()

        post = Post(
            author_id=author.id,
            type=PostType.GENERAL,
            body="Testing lazy raise",
        )
        session.add(post)
        await session.flush()
        session.expunge_all()

        orm_post = (await session.execute(select(Post).where(Post.id == post.id))).scalar_one()
        with pytest.raises(InvalidRequestError, match="lazy='raise'"):
            _ = orm_post.author

    run(check)


def test_post_insert_populates_eager_defaults() -> None:
    async def create_post(session: AsyncSession) -> Post:
        author = User(
            username=f"author-{uuid4().hex[:16]}",
            display_name="Test Author",
        )
        session.add(author)
        await session.flush()

        post = Post(
            author_id=author.id,
            type=PostType.GENERAL,
            body="Hello from African developers!",
        )
        session.add(post)
        await session.flush()
        return post

    post = run(create_post)
    assert post.id is not None
    assert post.like_count == 0
    assert post.comment_count == 0
    assert post.created_at is not None
    assert post.updated_at is not None
    assert post.edited_at is None
    assert post.deleted_at is None
