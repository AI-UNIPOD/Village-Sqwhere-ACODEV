"""GET /v1/agreements/current: the agreement a hub owner reads and signs before creating a hub."""

import hashlib
from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgreementTemplate
from tests.hub_support import (
    auth,
    bad_auth_headers,
    make_user,
    request_with_no_published_agreement,
    run,
)

URL = "/v1/agreements/current"

AGREEMENT_FIELDS = {
    "template_id",
    "version",
    "title",
    "body",
    "body_sha256",
    "published_at",
    "hub_terms",
}


def highest_version() -> int:
    async def work(session: AsyncSession) -> int:
        result = await session.execute(select(func.max(AgreementTemplate.version)))
        return result.scalar_one() or 0

    return run(work)


def count_templates() -> int:
    async def work(session: AsyncSession) -> int:
        result = await session.execute(select(func.count()).select_from(AgreementTemplate))
        return result.scalar_one()

    return run(work)


@pytest.fixture
def new_templates() -> Generator[list[UUID]]:
    """Templates a test adds above every existing version, deleted again afterwards.

    Deleting is safe: no hub uses them, and the database only freezes a published
    template against UPDATE, not DELETE.
    """
    made: list[UUID] = []
    yield made

    async def work(session: AsyncSession) -> None:
        await session.execute(delete(AgreementTemplate).where(AgreementTemplate.id.in_(made)))
        await session.commit()

    run(work)


def add_template(made: list[UUID], version: int, *, published: bool) -> AgreementTemplate:
    async def work(session: AsyncSession) -> AgreementTemplate:
        template = AgreementTemplate(
            version=version,
            title=f"Test agreement version {version}",
            body=f"Placeholder agreement text for tests only. Signed in Dakar. {uuid4()}",
            published_at=datetime.now(UTC) if published else None,
        )
        session.add(template)
        await session.commit()
        return template

    template = run(work)
    made.append(template.id)
    return template


def test_returns_the_current_agreement_with_exactly_the_documented_fields(
    client: TestClient,
) -> None:
    resp = client.get(URL, headers=auth(make_user()))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"data"}
    agreement = body["data"]
    assert set(agreement) == AGREEMENT_FIELDS
    assert UUID(agreement["template_id"])
    assert isinstance(agreement["version"], int) and agreement["version"] > 0
    assert isinstance(agreement["title"], str) and agreement["title"]
    assert isinstance(agreement["body"], str) and agreement["body"].strip()
    # the hash lets the client prove which exact text was signed
    assert agreement["body_sha256"] == hashlib.sha256(agreement["body"].encode()).hexdigest()
    assert agreement["hub_terms"] == {}
    published_at = datetime.fromisoformat(agreement["published_at"])
    assert published_at.tzinfo is not None


def test_returns_the_highest_published_version_not_an_unpublished_one(
    client: TestClient, new_templates: list[UUID]
) -> None:
    top = highest_version()
    published = add_template(new_templates, top + 1, published=True)
    add_template(new_templates, top + 2, published=False)

    resp = client.get(URL, headers=auth(make_user()))

    assert resp.status_code == 200, resp.text
    agreement = resp.json()["data"]
    assert agreement["template_id"] == str(published.id)
    assert agreement["version"] == top + 1
    assert agreement["title"] == published.title
    assert agreement["body"] == published.body
    assert agreement["body_sha256"] == published.body_sha256


def test_a_newly_published_version_replaces_the_previous_one(
    client: TestClient, new_templates: list[UUID]
) -> None:
    top = highest_version()
    older = add_template(new_templates, top + 1, published=True)
    first = client.get(URL, headers=auth(make_user())).json()["data"]
    newer = add_template(new_templates, top + 2, published=True)
    second = client.get(URL, headers=auth(make_user())).json()["data"]

    assert first["template_id"] == str(older.id)
    assert second["template_id"] == str(newer.id)


def test_reading_the_agreement_saves_nothing(client: TestClient) -> None:
    user = make_user()
    before = count_templates()

    assert client.get(URL, headers=auth(user)).status_code == 200
    assert count_templates() == before


@pytest.mark.parametrize("case", list(bad_auth_headers()))
def test_refuses_a_request_that_is_not_signed_in(client: TestClient, case: str) -> None:
    resp = client.get(URL, headers=bad_auth_headers()[case])

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] in {"UNAUTHENTICATED", "TOKEN_EXPIRED"}
    assert resp.headers["www-authenticate"] == "Bearer"


def test_refuses_a_deleted_user(client: TestClient) -> None:
    resp = client.get(URL, headers=auth(make_user(deleted=True)))

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"


def test_says_so_when_no_agreement_is_published() -> None:
    resp = request_with_no_published_agreement("GET", URL, auth(make_user()))

    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "AGREEMENT_NOT_PUBLISHED"
