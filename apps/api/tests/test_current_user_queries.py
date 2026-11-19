"""Every signed-in request loads the person first, so the number of queries that takes is paid on
every screen. The lookup rows behind a person (a role, a technology, a sector) come in the same
query as the row that points at them, not in a query of their own."""

from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.models import (
    Role,
    Sector,
    Technology,
    User,
    UserFeedTopic,
    UserRole,
    UserSector,
    UserTechnology,
)
from tests.conftest import test_engine
from tests.hub_support import auth, make_user, run


def give_a_full_profile(user: User) -> None:
    """Two roles, two technologies, two feed topics and two sectors, so a query per lookup row
    (rather than one for all of them) would show up in the count."""

    async def work(session) -> None:
        roles = (await session.execute(select(Role).limit(2))).scalars().all()
        technologies = (await session.execute(select(Technology).limit(2))).scalars().all()
        sectors = (await session.execute(select(Sector).limit(2))).scalars().all()
        for role in roles:
            session.add(UserRole(user_id=user.id, role_id=role.id, verified_at=datetime.now(UTC)))
        for technology in technologies:
            session.add(UserTechnology(user_id=user.id, technology_id=technology.id))
            session.add(UserFeedTopic(user_id=user.id, technology_id=technology.id))
        for sector in sectors:
            session.add(UserSector(user_id=user.id, sector_id=sector.id))
        await session.commit()

    run(work)


@pytest.fixture
def statements() -> Generator[list[str]]:
    seen: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany) -> None:  # noqa: ANN001
        seen.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", record)
    yield seen
    event.remove(test_engine.sync_engine, "before_cursor_execute", record)


def test_loading_a_full_profile_takes_one_query_per_list_not_one_per_lookup_row(
    client: TestClient, statements: list[str]
) -> None:
    user = make_user()
    give_a_full_profile(user)
    headers = auth(user)

    statements.clear()
    response = client.get("/v1/me", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    # the page of data is still whole: this is about how it is fetched, not what
    assert len(body["roles"]) == 2
    assert len(body["technologies"]) == 2
    assert len(body["feed_topics"]) == 2
    assert len(body["sectors"]) == 2

    # the person, then each of their lists once (identities, roles, verification attempts,
    # technologies, feed topics, sectors): 7 queries, where each lookup row used to add its own
    assert len(statements) <= 7, "\n".join(statements)


def test_a_request_that_needs_only_the_person_is_not_charged_per_lookup_row(
    client: TestClient, statements: list[str]
) -> None:
    user = make_user()
    give_a_full_profile(user)
    statements.clear()
    assert client.get("/v1/feed?limit=1", headers=auth(user)).status_code == 200
    # the 7 above plus the feed's own page of posts and their parts
    assert len(statements) <= 12, "\n".join(statements)
