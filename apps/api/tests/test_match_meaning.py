"""The meaning part of the match score, and similar ideas, read from vectors the tests write.

A vector is a point in a plane of two axes, so the cosine between it and the plane's first
axis is the similarity the test asks for. The axes are picked at random, away from axis 0 where
the worker tests leave their vectors, and the rows are removed when the test ends.
"""

import math
import random
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Float, delete, event, literal, select

from app import config
from app.api.v1.matches import meaning_points_sql
from app.models import (
    IdeaEmbedding,
    IdeaRoleNeed,
    Role,
    User,
    UserEmbedding,
    UserRole,
)
from app.models.embeddings import EMBEDDING_DIMENSIONS
from app.services.embeddings import source_sha256
from app.services.match_score import meaning_points
from tests.conftest import test_engine
from tests.hub_support import auth, make_user, run
from tests.test_demo_wall import to_demo
from tests.test_matches import (
    MY_IDEAS,
    MY_MATCHES,
    assert_error,
    new_idea,
    parts,
    use_technologies,
    verify,
)

TITLE = "Offline farm ledger for co-operatives"
PUBLIC_CARD = {
    "id",
    "title",
    "summary",
    "stage",
    "status",
    "roles_needed",
    "author",
    "hub_id",
    "published_at",
    "created_at",
    "updated_at",
}


class Plane:
    def __init__(self) -> None:
        self.axis = random.randrange(2, EMBEDDING_DIMENSIONS - 1)
        self.idea_ids: list[UUID] = []
        self.user_ids: list[UUID] = []

    def vector(self, along: float, across: float) -> list[float]:
        made = [0.0] * EMBEDDING_DIMENSIONS
        made[self.axis], made[self.axis + 1] = along, across
        return made

    @property
    def base(self) -> list[float]:
        return self.vector(1.0, 0.0)

    def at(self, similarity: float) -> list[float]:
        """A unit vector whose similarity to `base` is `similarity`."""
        return self.vector(similarity, math.sqrt(1 - similarity**2))

    def give_idea(self, idea_id: str, vector: list[float]) -> str:
        self.idea_ids.append(UUID(idea_id))
        self._store(
            IdeaEmbedding(
                idea_id=UUID(idea_id), embedding=vector, source_sha256=source_sha256("test")
            )
        )
        return idea_id

    def give_user(self, user: User, vector: list[float]) -> None:
        self.user_ids.append(user.id)
        self._store(
            UserEmbedding(user_id=user.id, embedding=vector, source_sha256=source_sha256("test"))
        )

    @staticmethod
    def _store(row: IdeaEmbedding | UserEmbedding) -> None:
        async def work(session):
            session.add(row)
            await session.commit()

        run(work)


@pytest.fixture
def plane() -> Generator[Plane]:
    made = Plane()
    yield made

    async def clean(session):
        await session.execute(delete(IdeaEmbedding).where(IdeaEmbedding.idea_id.in_(made.idea_ids)))
        await session.execute(delete(UserEmbedding).where(UserEmbedding.user_id.in_(made.user_ids)))
        await session.commit()

    run(clean)


@pytest.fixture
def role() -> Generator[Role]:
    """An active role only this test uses, removed afterwards with everything that uses it."""

    async def make(session):
        name = f"test-meaning-{uuid4().hex[:12]}"
        made = Role(slug=name, name=name.replace("-", " ").title())
        session.add(made)
        await session.commit()
        return made

    made = run(make)
    yield made

    async def clean(session):
        for model in (IdeaRoleNeed, UserRole):
            await session.execute(delete(model).where(model.role_id == made.id))
        await session.execute(delete(Role).where(Role.id == made.id))
        await session.commit()

    run(clean)


@pytest.fixture
def demo_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)


@contextmanager
def counted_statements() -> Iterator[list[str]]:
    seen: list[str] = []

    def count(connection, cursor, statement, *rest):
        seen.append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", count)
    try:
        yield seen
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", count)


def developer(
    role: Role, plane: Plane, vector: list[float] | None = None, technologies: tuple[str, ...] = ()
) -> User:
    """A developer verified in the role, with a vector when one is given. The vector goes in
    last, because changing a profile removes its vector."""
    made = make_user()
    verify(made, role)
    use_technologies(made, *technologies)
    if vector is not None:
        plane.give_user(made, vector)
    return made


def open_idea(
    client: TestClient, author: User, plane: Plane, similarity: float | list[float]
) -> str:
    """An open idea with a vector that reads `similarity` close to the plane's `base`."""
    vector = plane.at(similarity) if isinstance(similarity, float) else similarity
    return plane.give_idea(new_idea(client, author), vector)


def idea_with_status(client: TestClient, author: User, plane: Plane, status: str) -> str:
    """A draft, closed or deleted idea that has a vector anyway, so the tests prove that the
    queries filter by status and do not lean on the worker's rule of who is embedded."""
    idea_id = new_idea(client, author, publish=status != "draft")
    plane.give_idea(idea_id, plane.at(0.95))
    if status == "closed":
        assert client.post(f"{MY_IDEAS}/{idea_id}/close", headers=auth(author)).status_code == 200
    if status == "deleted":
        assert client.delete(f"{MY_IDEAS}/{idea_id}", headers=auth(author)).status_code == 204
    return idea_id


def people(client: TestClient, owner: User, idea_id: str, **params: Any) -> dict[str, Any]:
    response = client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(owner), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def for_you(client: TestClient, viewer: User, **params: Any) -> dict[str, Any]:
    response = client.get(MY_MATCHES, headers=auth(viewer), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def similar(client: TestClient, viewer: User, idea_id: str) -> list[str]:
    response = client.get(f"/v1/ideas/{idea_id}/similar", headers=auth(viewer))
    assert response.status_code == 200, response.text
    return [card["id"] for card in response.json()["data"]]


@pytest.mark.parametrize(
    ("read_alike", "points"),
    [
        (-0.3, 0),
        (0.0, 0),
        (0.15, 0),
        (0.1549, 0),
        (0.1551, 1),
        (0.30, 15),
        (0.4449, 29),
        (0.4451, 30),
        (0.45, 30),
        (1.0, 30),
        (1.0000002, 30),
    ],
)
def test_meaning_points_stretch_the_measured_band_over_0_to_30(
    read_alike: float, points: int
) -> None:
    assert meaning_points(read_alike) == points


def test_meaning_points_round_a_half_up() -> None:
    # 0.435 and 0.445 give exactly 28.5 and 29.5 points before rounding
    assert meaning_points(0.435) == 29
    assert meaning_points(0.445) == 30


def test_the_sql_meaning_points_are_the_python_ones_for_every_similarity() -> None:
    edges = [round(0.15 + (half + 0.5) / 100, 3) for half in range(30)]
    values = [step / 1000 for step in range(-100, 1101)] + edges
    values += [edge + shift for edge in edges for shift in (-1e-9, 1e-9)]

    async def work(session):
        return [
            await session.scalar(select(meaning_points_sql(literal(value, Float))))
            for value in values
        ]

    assert run(work) == [meaning_points(value) for value in values]


def test_a_pair_with_both_vectors_is_scored_in_version_2(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner = make_user()
    idea_id = new_idea(client, owner, role)
    plane.give_idea(idea_id, plane.base)
    by_similarity = {
        similarity: developer(role, plane, plane.at(similarity))
        for similarity in (0.05, 0.15, 0.30, 0.45, 0.95)
    }
    without_vector = developer(role, plane)

    cards = {card["username"]: card for card in people(client, owner, idea_id)["data"]}

    # one role and nothing shared is 30 points, plus the meaning points
    assert {
        similarity: (cards[user.username]["score"], parts(cards[user.username])["meaning"])
        for similarity, user in by_similarity.items()
    } == {0.05: (30, 0), 0.15: (30, 0), 0.30: (45, 15), 0.45: (60, 30), 0.95: (60, 30)}
    assert all(
        cards[user.username]["score_version"] == 2 and cards[user.username]["partial"] is False
        for user in by_similarity.values()
    )
    # a developer with no vector keeps the version 1 score
    missing = cards[without_vector.username]
    assert (missing["score"], missing["score_version"], missing["partial"]) == (43, 1, True)
    assert parts(missing)["meaning"] is None


def test_the_meaning_points_round_at_the_edges_of_the_band(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner = make_user()
    idea_id = new_idea(client, owner, role)
    plane.give_idea(idea_id, plane.base)
    # a hair either side of the points that round up: a stored vector keeps only 24 bits, so
    # it cannot sit on the exact edge
    users = {
        similarity: developer(role, plane, plane.at(similarity))
        for similarity in (0.1549, 0.1551, 0.4449, 0.4451)
    }

    cards = {card["username"]: card for card in people(client, owner, idea_id)["data"]}

    assert {s: parts(cards[user.username])["meaning"] for s, user in users.items()} == {
        0.1549: 0,
        0.1551: 1,
        0.4449: 29,
        0.4451: 30,
    }


def test_a_missing_vector_on_either_side_keeps_version_1(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner, other_owner = make_user(), make_user()
    without_idea_vector = new_idea(client, owner, role)
    with_idea_vector = new_idea(client, other_owner, role)
    plane.give_idea(with_idea_vector, plane.base)
    with_vector = developer(role, plane, plane.at(0.45))
    without_vector = developer(role, plane)

    no_idea_vector = {
        card["username"]: card for card in people(client, owner, without_idea_vector)["data"]
    }
    no_user_vector = {
        card["username"]: card for card in people(client, other_owner, with_idea_vector)["data"]
    }

    assert no_idea_vector[with_vector.username]["score_version"] == 1
    assert no_idea_vector[with_vector.username]["partial"] is True
    assert no_user_vector[without_vector.username]["score_version"] == 1
    assert parts(no_user_vector[without_vector.username])["meaning"] is None
    assert no_user_vector[with_vector.username]["score_version"] == 2


def test_a_developer_list_can_hold_both_kinds_and_follows_the_score_shown(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner = make_user()
    use_technologies(owner, "python", "react", "rust")
    idea_id = new_idea(client, owner, role)
    plane.give_idea(idea_id, plane.base)
    # a vector at the top of the band: 30 + 30
    top = developer(role, plane, plane.at(0.45))
    # no vector, two shared technologies: 38 of 70, scaled to 54
    scaled = developer(role, plane, technologies=("python", "react"))
    # a vector in the middle and one shared technology: 34 + 15
    middle = developer(role, plane, plane.at(0.30), ("python",))
    # the role alone, no vector: 30 of 70, scaled to 43
    bare = developer(role, plane)
    # the same 30 raw points with a vector that reads far apart: 30, below the scaled 43
    far = developer(role, plane, plane.at(0.05))

    cards: list[dict[str, Any]] = []
    offset: int | None = 0
    while offset is not None:
        page = people(client, owner, idea_id, limit=2, offset=offset)
        cards += page["data"]
        offset = page["next_offset"]

    assert [(card["username"], card["score"], card["score_version"]) for card in cards] == [
        (top.username, 60, 2),
        (scaled.username, 54, 1),
        (middle.username, 49, 2),
        (bare.username, 43, 1),
        (far.username, 30, 2),
    ]


def test_for_you_scores_a_vector_pair_in_version_2_and_the_rest_in_version_1(
    client: TestClient, role: Role, plane: Plane
) -> None:
    me = developer(role, plane, plane.at(0.30))
    near, far, unread = make_user(), make_user(), make_user()
    near_idea = plane.give_idea(new_idea(client, near, role), plane.base)
    # a vector on the other side of the plane's first axis reads far from mine, under the band
    far_idea = plane.give_idea(new_idea(client, far, role), plane.vector(1.0, -1.0))
    unread_idea = new_idea(client, unread, role)

    cards = {card["idea"]["id"]: card for card in for_you(client, me)["data"]}

    assert (cards[near_idea]["score"], cards[near_idea]["score_version"]) == (45, 2)
    assert parts(cards[near_idea])["meaning"] == 15
    assert cards[near_idea]["partial"] is False
    assert (cards[far_idea]["score"], parts(cards[far_idea])["meaning"]) == (30, 0)
    assert cards[far_idea]["score_version"] == 2
    assert (cards[unread_idea]["score"], cards[unread_idea]["score_version"]) == (43, 1)
    assert parts(cards[unread_idea])["meaning"] is None
    scores = [card["score"] for card in for_you(client, me)["data"]]
    assert scores == [45, 43, 30]


def test_a_developer_card_names_their_own_open_idea_that_reads_closest_to_mine(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner = make_user()
    idea_id = new_idea(client, owner, role)
    plane.give_idea(idea_id, plane.base)
    on_the_line, just_under, nearest, hidden, nothing = (developer(role, plane) for _ in range(5))
    # 3 over 5 is exactly 0.60, where two ideas read close
    line_idea = open_idea(client, on_the_line, plane, plane.vector(3.0, 4.0))
    open_idea(client, just_under, plane, 0.5999)
    for similarity in (0.85, 0.9):
        open_idea(client, nearest, plane, similarity)
    closest = open_idea(client, nearest, plane, 0.95)
    # drafts, closed and deleted ideas never show, even when they read closer
    for status in ("draft", "closed", "deleted"):
        idea_with_status(client, hidden, plane, status)
    allowed = open_idea(client, hidden, plane, 0.61)
    # an idea by someone who is not on the list does not show on anyone's card
    open_idea(client, make_user(), plane, 0.99)

    cards = {card["username"]: card for card in people(client, owner, idea_id)["data"]}

    assert cards[on_the_line.username]["similar_idea"] == {"id": line_idea, "title": TITLE}
    assert cards[just_under.username]["similar_idea"] is None
    assert cards[nearest.username]["similar_idea"] == {"id": closest, "title": TITLE}
    assert cards[hidden.username]["similar_idea"] == {"id": allowed, "title": TITLE}
    assert cards[nothing.username]["similar_idea"] is None


def test_a_for_you_card_names_my_own_open_idea_that_reads_closest_to_it(
    client: TestClient, role: Role, plane: Plane
) -> None:
    me = developer(role, plane)
    author = make_user()
    listed = plane.give_idea(new_idea(client, author, role), plane.base)
    elsewhere = plane.give_idea(new_idea(client, author, role), plane.vector(0.0, 1.0))
    unread = new_idea(client, author, role)
    open_idea(client, me, plane, 0.85)
    closest = open_idea(client, me, plane, 0.95)
    for status in ("draft", "closed", "deleted"):
        idea_with_status(client, me, plane, status)
    # an idea by someone else never counts as mine
    open_idea(client, author, plane, 0.99)

    cards = {card["idea"]["id"]: card for card in for_you(client, me)["data"]}

    assert cards[listed]["similar_idea"] == {"id": closest, "title": TITLE}
    assert cards[elsewhere]["similar_idea"] is None
    assert cards[unread]["similar_idea"] is None


def test_the_number_of_queries_does_not_grow_with_the_rows(
    client: TestClient, role: Role, plane: Plane
) -> None:
    owner = make_user()
    idea_id = new_idea(client, owner, role)
    plane.give_idea(idea_id, plane.base)
    me = developer(role, plane, plane.at(0.8))
    open_idea(client, me, plane, 0.9)

    def add_authors(count: int) -> None:
        for _ in range(count):
            author = developer(role, plane, plane.at(0.8))
            open_idea(client, author, plane, 0.9)
            plane.give_idea(new_idea(client, author, role), plane.base)

    def asked() -> tuple[int, int, int]:
        """The statements for the two lists, and how many rows the longer one has."""
        with counted_statements() as for_developers:
            developers = people(client, owner, idea_id)["data"]
        with counted_statements() as for_ideas:
            ideas = for_you(client, me)["data"]
        assert all(card["similar_idea"] for card in developers + ideas)
        return len(for_developers), len(for_ideas), len(developers)

    add_authors(2)
    few = asked()
    add_authors(5)
    many = asked()

    assert many[2] > few[2]
    assert many[:2] == few[:2]


def test_similar_ideas_come_closest_first_and_stop_at_five(
    client: TestClient, plane: Plane
) -> None:
    viewer, author = make_user(), make_user()
    idea_id = open_idea(client, author, plane, 1.0)
    # made out of order, and the idea itself is as close to itself as anything can be
    made = {s: open_idea(client, make_user(), plane, s) for s in (0.91, 0.99, 0.85, 0.95, 0.97)}
    made |= {s: open_idea(client, make_user(), plane, s) for s in (0.93, 0.89)}

    response = client.get(f"/v1/ideas/{idea_id}/similar", headers=auth(viewer))

    assert response.status_code == 200, response.text
    assert [card["id"] for card in response.json()["data"]] == [
        made[s] for s in (0.99, 0.97, 0.95, 0.93, 0.91)
    ]
    assert response.json()["next_offset"] is None
    for card in response.json()["data"]:
        assert set(card) == PUBLIC_CARD
    assert "similarity" not in response.text and "details" not in response.text


def test_an_idea_is_similar_from_0_60_and_not_just_under(client: TestClient, plane: Plane) -> None:
    viewer = make_user()
    idea_id = open_idea(client, make_user(), plane, 1.0)
    on_the_line = open_idea(client, make_user(), plane, plane.vector(3.0, 4.0))
    open_idea(client, make_user(), plane, 0.5999)

    assert similar(client, viewer, idea_id) == [on_the_line]


def test_an_idea_with_no_vector_or_nothing_close_has_no_similar_ideas(
    client: TestClient, plane: Plane
) -> None:
    viewer = make_user()
    unread = new_idea(client, make_user())
    alone = open_idea(client, make_user(), plane, 1.0)
    open_idea(client, make_user(), plane, 0.5)

    assert similar(client, viewer, unread) == []
    assert similar(client, viewer, alone) == []


def test_similar_ideas_are_never_drafts_closed_or_deleted(client: TestClient, plane: Plane) -> None:
    viewer, author = make_user(), make_user()
    idea_id = open_idea(client, author, plane, 1.0)
    for status in ("draft", "closed", "deleted"):
        idea_with_status(client, make_user(), plane, status)
    open_one = open_idea(client, make_user(), plane, 0.61)

    assert similar(client, viewer, idea_id) == [open_one]


def test_only_an_open_idea_the_viewer_may_read_has_similar_ideas(
    client: TestClient, plane: Plane
) -> None:
    viewer, author = make_user(), make_user()
    for status in ("draft", "closed", "deleted"):
        hidden = idea_with_status(client, author, plane, status)
        for reader in (viewer, author):
            response = client.get(f"/v1/ideas/{hidden}/similar", headers=auth(reader))
            assert_error(response, 404, "NOT_FOUND")
    unknown = client.get(f"/v1/ideas/{uuid4()}/similar", headers=auth(viewer))
    assert_error(unknown, 404, "NOT_FOUND")
    assert client.get(f"/v1/ideas/{uuid4()}/similar").status_code == 401


def test_the_demo_wall_holds_for_similar_ideas(
    client: TestClient, plane: Plane, demo_on: None
) -> None:
    real_author, demo_author, real_viewer, demo_viewer = (make_user() for _ in range(4))
    real = open_idea(client, real_author, plane, 1.0)
    real_close = open_idea(client, real_author, plane, 0.95)
    demo = open_idea(client, demo_author, plane, 1.0)
    demo_close = open_idea(client, demo_author, plane, 0.95)
    to_demo(demo_author, demo_viewer)

    assert similar(client, real_viewer, real) == [real_close]
    assert similar(client, demo_viewer, demo) == [demo_close]
    for viewer, hidden in ((real_viewer, demo), (demo_viewer, real)):
        response = client.get(f"/v1/ideas/{hidden}/similar", headers=auth(viewer))
        assert_error(response, 404, "NOT_FOUND")


def test_the_demo_wall_holds_for_the_ideas_on_match_cards(
    client: TestClient, role: Role, plane: Plane, demo_on: None
) -> None:
    real_owner, demo_owner = make_user(), make_user()
    real_idea, demo_idea = new_idea(client, real_owner, role), new_idea(client, demo_owner, role)
    plane.give_idea(real_idea, plane.base)
    plane.give_idea(demo_idea, plane.base)
    real_dev, demo_dev = developer(role, plane), developer(role, plane)
    real_close = open_idea(client, real_dev, plane, 0.95)
    demo_close = open_idea(client, demo_dev, plane, 0.95)
    to_demo(demo_owner, demo_dev)

    real_cards = people(client, real_owner, real_idea)["data"]
    demo_cards = people(client, demo_owner, demo_idea)["data"]

    assert [(c["id"], c["similar_idea"]["id"]) for c in real_cards] == [
        (str(real_dev.id), real_close)
    ]
    assert [(c["id"], c["similar_idea"]["id"]) for c in demo_cards] == [
        (str(demo_dev.id), demo_close)
    ]
