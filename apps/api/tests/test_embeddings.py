"""Embeddings of ideas and developers: what is sent, who is embedded, when a vector goes stale,
and the Gemini client. No test calls Gemini: the worker gets a fake embedder, and the client
gets a fake network call.

The shared test database is never cleaned, so every test makes rows with a unique tag in their
text and looks only at those.
"""

import asyncio
import io
import json
import logging
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models import (
    Idea,
    IdeaEmbedding,
    IdeaStatus,
    Role,
    Sector,
    Technology,
    User,
    UserEmbedding,
    UserRole,
    UserSector,
    UserTechnology,
)
from app.services import embeddings as client_module
from app.services.embeddings import GeminiEmbedder, idea_text, profile_text, source_sha256
from app.services.gemini import GeminiApiError, GeminiConfigurationError
from app.workers import embeddings as worker
from tests.conftest import test_async_session as db_session
from tests.hub_support import auth, make_user, run

SCRIPT = Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "025-embeddings.sql"
KEY = "test-key-that-must-never-be-logged"


class FakeEmbedder:
    """Answers with a vector per text and remembers every text it was given."""

    def __init__(self) -> None:
        self.sent: list[str] = []
        self.error: Exception | None = None
        self.while_embedding: Any = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if self.error:
            raise self.error
        self.sent.extend(texts)
        if self.while_embedding:
            await self.while_embedding()
        return [[1.0] + [0.0] * 767 for _ in texts]


@pytest.fixture(autouse=True)
def use_the_test_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "async_session", db_session)
    monkeypatch.setattr(worker, "warned_without_key", False)


def embed_everything(embedder: Any) -> int:
    return asyncio.run(worker.embed_missing(embedder, limit=10_000))


def make_idea(tag: str, *, status: IdeaStatus = IdeaStatus.OPEN, deleted: bool = False) -> Idea:
    author = make_user()

    async def work(session: Any) -> Idea:
        idea = Idea(
            author_id=author.id,
            title=f"Offline farm ledger {tag}",
            summary=f"A ledger app for smallholder farmers in Kano that works offline {tag}.",
            details=f"Private brief that never leaves the server {tag}",
            status=status,
            published_at=None if status == IdeaStatus.DRAFT else datetime.now(UTC),
            deleted_at=datetime.now(UTC) if deleted else None,
        )
        session.add(idea)
        await session.commit()
        return idea

    return run(work)


def make_developer(
    tag: str, *, verified: bool = True, is_demo: bool = False, deleted: bool = False
) -> User:
    """A developer with a verified backend role, an unverified frontend role, one technology and
    one sector, and a name, an email and a bio that must not all be sent."""

    async def work(session: Any) -> User:
        user = User(
            username=f"dev-{uuid4().hex[:20]}",
            display_name=f"Amina Bello {tag}",
            first_name="Amina",
            last_name=f"Bello{tag}",
            email=f"{uuid4().hex[:12]}@example.com",
            bio=f"I build payment tools for market traders in Lagos {tag}.",
            is_demo=is_demo,
            deleted_at=datetime.now(UTC) if deleted else None,
        )
        session.add(user)
        await session.flush()
        backend = await session.scalar(select(Role).where(Role.slug == "backend-engineer"))
        frontend = await session.scalar(select(Role).where(Role.slug == "frontend-engineer"))
        python = await session.scalar(select(Technology).where(Technology.slug == "python"))
        fintech = await session.scalar(select(Sector).where(Sector.slug == "fintech"))
        session.add_all(
            [
                UserRole(
                    user_id=user.id,
                    role_id=backend.id,
                    verified_at=datetime.now(UTC) if verified else None,
                ),
                UserRole(user_id=user.id, role_id=frontend.id),
                UserTechnology(user_id=user.id, technology_id=python.id),
                UserSector(user_id=user.id, sector_id=fintech.id),
            ]
        )
        await session.commit()
        return user

    return run(work)


def saved(model: Any, column: Any, row_id: UUID) -> Any:
    return run(lambda session: session.scalar(select(model).where(column == row_id)))


def idea_vector(idea: Idea) -> IdeaEmbedding | None:
    return saved(IdeaEmbedding, IdeaEmbedding.idea_id, idea.id)


def user_vector(user: User) -> UserEmbedding | None:
    return saved(UserEmbedding, UserEmbedding.user_id, user.id)


def sent_with(embedder: FakeEmbedder, tag: str) -> str:
    (sent,) = [sent for sent in embedder.sent if tag in sent]
    return sent


def change(statement: str, **values: UUID) -> None:
    async def work(session: Any) -> None:
        await session.execute(text(statement), values)
        await session.commit()

    run(work)


# --- what is sent --------------------------------------------------------------------------


def test_an_idea_is_sent_as_its_title_and_summary_and_never_its_private_brief() -> None:
    tag = uuid4().hex
    idea = make_idea(tag)
    embedder = FakeEmbedder()

    embed_everything(embedder)

    sent = sent_with(embedder, tag)
    assert sent == f"{idea.title}\n{idea.summary}"
    assert "Private brief" not in "".join(embedder.sent)


def test_a_developer_is_sent_as_verified_roles_technologies_sectors_and_bio_only() -> None:
    tag = uuid4().hex
    user = make_developer(tag)
    embedder = FakeEmbedder()

    embed_everything(embedder)

    sent = sent_with(embedder, tag)
    assert sent == (
        "Roles: Backend & Systems Engineer\n"
        "Technologies: Python\n"
        "Sectors: Fintech\n"
        f"Bio: I build payment tools for market traders in Lagos {tag}."
    )
    for private in (user.email, user.username, user.display_name, user.last_name):
        assert private not in sent
    assert "Frontend" not in sent


def test_the_same_profile_gives_the_same_text_in_any_order() -> None:
    def user(order: list[str]) -> User:
        roles = [UserRole(verified_at=datetime.now(UTC), role=Role(name=name)) for name in order]
        return User(roles=roles, bio=" A bio. ")

    assert profile_text(user(["B", "A"])) == profile_text(user(["A", "B"]))
    assert profile_text(user(["A"])) == "Roles: A\nBio: A bio."


# --- who is embedded -----------------------------------------------------------------------


def test_only_open_ideas_are_embedded() -> None:
    tag = uuid4().hex
    open_idea = make_idea(tag)
    skipped = [
        make_idea(tag, status=IdeaStatus.DRAFT),
        make_idea(tag, status=IdeaStatus.CLOSED),
        make_idea(tag, deleted=True),
    ]

    embed_everything(FakeEmbedder())

    assert idea_vector(open_idea) is not None
    assert [idea_vector(idea) for idea in skipped] == [None, None, None]


def test_only_developers_with_a_verified_role_on_a_live_account_are_embedded() -> None:
    tag = uuid4().hex
    developer = make_developer(tag)
    demo = make_developer(tag, is_demo=True)
    unverified = make_developer(tag, verified=False)
    deleted = make_developer(tag, deleted=True)

    embed_everything(FakeEmbedder())

    assert user_vector(developer) is not None
    assert user_vector(demo) is not None
    assert user_vector(unverified) is None
    assert user_vector(deleted) is None


def test_the_stored_row_names_the_model_and_the_hash_of_what_was_sent() -> None:
    tag = uuid4().hex
    idea = make_idea(tag)
    embedder = FakeEmbedder()

    embed_everything(embedder)

    row = idea_vector(idea)
    assert row is not None
    assert row.model == "gemini-embedding-2"
    assert len(row.embedding) == 768
    assert row.source_sha256 == source_sha256(sent_with(embedder, tag))


# --- freshness -----------------------------------------------------------------------------


IDEA_CHANGES = {
    "title": "UPDATE ideas SET title = 'A new title here' WHERE id = :id",
    "summary": "UPDATE ideas SET summary = 'A new summary for this idea' WHERE id = :id",
}


@pytest.mark.parametrize("statement", IDEA_CHANGES.values(), ids=IDEA_CHANGES.keys())
def test_changing_what_an_idea_says_removes_its_vector_and_the_next_run_makes_a_new_one(
    statement: str,
) -> None:
    idea = make_idea(uuid4().hex)
    embed_everything(FakeEmbedder())
    before = idea_vector(idea)
    assert before is not None

    change(statement, id=idea.id)

    assert idea_vector(idea) is None
    embed_everything(FakeEmbedder())
    after = idea_vector(idea)
    assert after is not None
    assert after.source_sha256 != before.source_sha256


def test_changing_the_private_brief_keeps_the_vector() -> None:
    idea = make_idea(uuid4().hex)
    embed_everything(FakeEmbedder())

    change("UPDATE ideas SET details = 'A new brief' WHERE id = :id", id=idea.id)

    assert idea_vector(idea) is not None


PROFILE_CHANGES = {
    "bio": "UPDATE users SET bio = 'A different bio' WHERE id = :id",
    "technology added": (
        "INSERT INTO user_technologies (user_id, technology_id) "
        "SELECT :id, id FROM technologies WHERE slug = 'go'"
    ),
    "technology removed": "DELETE FROM user_technologies WHERE user_id = :id",
    "sector added": (
        "INSERT INTO user_sectors (user_id, sector_id) "
        "SELECT :id, id FROM sectors WHERE slug = 'health'"
    ),
    "sector removed": "DELETE FROM user_sectors WHERE user_id = :id",
    "role verified": (
        "UPDATE user_roles SET verified_at = now() "
        "WHERE user_id = :id AND role_id = (SELECT id FROM roles WHERE slug = 'frontend-engineer')"
    ),
    "verified role added": (
        "INSERT INTO user_roles (user_id, role_id, verified_at) "
        "SELECT :id, id, now() FROM roles WHERE slug = 'mobile-engineer'"
    ),
}


@pytest.mark.parametrize("statement", PROFILE_CHANGES.values(), ids=PROFILE_CHANGES.keys())
def test_changing_what_a_profile_says_removes_its_vector_and_the_next_run_makes_a_new_one(
    statement: str,
) -> None:
    user = make_developer(uuid4().hex)
    embed_everything(FakeEmbedder())
    before = user_vector(user)
    assert before is not None

    change(statement, id=user.id)

    assert user_vector(user) is None
    embed_everything(FakeEmbedder())
    after = user_vector(user)
    assert after is not None
    assert after.source_sha256 != before.source_sha256


def test_a_change_that_leaves_the_profile_text_alone_keeps_the_vector() -> None:
    user = make_developer(uuid4().hex)
    embed_everything(FakeEmbedder())

    change(
        "UPDATE user_roles SET is_primary = true WHERE user_id = :id AND verified_at IS NOT NULL",
        id=user.id,
    )
    change("UPDATE users SET display_name = 'Someone Else' WHERE id = :id", id=user.id)

    assert user_vector(user) is not None


def test_a_text_that_changes_while_gemini_answers_gets_no_stale_vector() -> None:
    idea = make_idea(uuid4().hex)
    embedder = FakeEmbedder()

    async def edit_the_title() -> None:
        async with db_session() as session:
            await session.execute(
                text("UPDATE ideas SET title = 'Changed meanwhile' WHERE id = :id"), {"id": idea.id}
            )
            await session.commit()

    embedder.while_embedding = edit_the_title
    embed_everything(embedder)

    assert idea_vector(idea) is None
    embedder.while_embedding = None
    embed_everything(embedder)
    row = idea_vector(idea)
    assert row is not None
    assert row.source_sha256 == source_sha256(f"Changed meanwhile\n{idea.summary}")


# --- failure -------------------------------------------------------------------------------


def test_a_failed_request_writes_nothing_and_the_next_run_succeeds(
    caplog: pytest.LogCaptureFixture,
) -> None:
    tag = uuid4().hex
    idea = make_idea(tag)
    user = make_developer(tag)
    failing = FakeEmbedder()
    failing.error = GeminiApiError("Gemini could not be reached.")

    with caplog.at_level(logging.WARNING):
        assert embed_everything(failing) == 0

    assert (idea_vector(idea), user_vector(user)) == (None, None)
    assert tag not in caplog.text
    assert embed_everything(FakeEmbedder()) >= 2
    assert idea_vector(idea) is not None
    assert user_vector(user) is not None


def test_without_a_key_nothing_is_sent_and_the_log_says_so_once(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    idea = make_idea(uuid4().hex)

    def refuse(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("a request was made without a key")

    monkeypatch.setattr(client_module, "urlopen", refuse)

    with caplog.at_level(logging.WARNING):
        embed_everything(GeminiEmbedder(api_key=None))
        embed_everything(GeminiEmbedder(api_key=None))

    assert idea_vector(idea) is None
    assert caplog.text.count("GEMINI_API_KEY is not set") == 1


def test_a_failure_logs_neither_the_key_nor_the_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    tag = uuid4().hex
    idea = make_idea(tag)

    def unreachable(request: Any, timeout: float) -> None:
        raise URLError("no route to host")

    monkeypatch.setattr(client_module, "urlopen", unreachable)

    with caplog.at_level(logging.DEBUG):
        embed_everything(GeminiEmbedder(api_key=KEY))

    assert idea_vector(idea) is None
    assert "Embedding failed" in caplog.text
    assert KEY not in caplog.text
    assert tag not in caplog.text


def test_deleting_an_account_removes_the_developers_vector(client: TestClient) -> None:
    user = make_developer(uuid4().hex)
    # a profile with nothing but a verified role, so only the deletion itself can remove it
    change("UPDATE users SET bio = NULL WHERE id = :id", id=user.id)
    change("DELETE FROM user_technologies WHERE user_id = :id", id=user.id)
    change("DELETE FROM user_sectors WHERE user_id = :id", id=user.id)
    embed_everything(FakeEmbedder())
    assert user_vector(user) is not None

    response = client.post("/v1/me/deletion", headers=auth(user), json={"username": user.username})

    assert response.status_code == 204, response.text
    assert user_vector(user) is None
    embed_everything(FakeEmbedder())
    assert user_vector(user) is None


# --- the Gemini client ---------------------------------------------------------------------


class FakeNetwork:
    """Stands in for urlopen: records the request and answers with `answer`."""

    def __init__(self, answer: Any) -> None:
        self.answer = answer
        self.requests: list[Any] = []

    def __call__(self, request: Any, timeout: float) -> io.BytesIO:
        self.requests.append((request, timeout))
        if isinstance(self.answer, Exception):
            raise self.answer
        return io.BytesIO(json.dumps(self.answer).encode("utf-8"))


def answer_with(*vectors: list[float]) -> dict[str, Any]:
    return {"embeddings": [{"values": vector} for vector in vectors]}


def embed_with(monkeypatch: pytest.MonkeyPatch, network: FakeNetwork, texts: list[str]) -> Any:
    monkeypatch.setattr(client_module, "urlopen", network)
    return asyncio.run(GeminiEmbedder(api_key=KEY).embed(texts))


def test_the_client_asks_for_768_numbers_per_text_in_one_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    network = FakeNetwork(answer_with([1.0] * 768, [2.0] * 768))

    embed_with(monkeypatch, network, ["first text", "second text"])

    ((request, timeout),) = network.requests
    assert request.full_url == (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-embedding-2:batchEmbedContents"
    )
    assert request.get_method() == "POST"
    assert request.get_header("X-goog-api-key") == KEY
    assert request.full_url.count(KEY) == 0
    assert timeout > 0
    assert json.loads(request.data) == {
        "requests": [
            {
                "model": "models/gemini-embedding-2",
                "content": {"parts": [{"text": f"task: sentence similarity | query: {text}"}]},
                "embedContentConfig": {"outputDimensionality": 768},
            }
            for text in ("first text", "second text")
        ]
    }


def test_the_client_returns_vectors_of_length_one_in_the_order_asked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    network = FakeNetwork(answer_with([3.0, 4.0] + [0.0] * 766, [0.0, 0.0, 5.0] + [0.0] * 765))

    vectors = embed_with(monkeypatch, network, ["a", "b"])

    assert [len(vector) for vector in vectors] == [768, 768]
    assert [math.isclose(sum(v * v for v in vector), 1.0) for vector in vectors] == [True, True]
    assert vectors[0][:2] == pytest.approx([0.6, 0.8])
    assert vectors[1][2] == pytest.approx(1.0)


def test_the_client_sends_nothing_for_no_texts(monkeypatch: pytest.MonkeyPatch) -> None:
    network = FakeNetwork(answer_with())

    assert embed_with(monkeypatch, network, []) == []
    assert network.requests == []


def test_the_client_without_a_key_raises_the_configuration_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    network = FakeNetwork(answer_with([1.0] * 768))
    monkeypatch.setattr(client_module, "urlopen", network)

    with pytest.raises(GeminiConfigurationError):
        asyncio.run(GeminiEmbedder(api_key=None).embed(["text"]))

    assert network.requests == []


@pytest.mark.parametrize(
    "answer",
    [
        answer_with([1.0] * 767),
        answer_with([1.0] * 768, [1.0] * 768),
        answer_with([0.0] * 768),
        {"embeddings": [{"vector": [1.0] * 768}]},
        {"embeddings": ["not an object"]},
        {"error": {"message": "quota"}},
        [],
        HTTPError("https://example.test", 429, "Too Many Requests", {}, None),
        URLError("no route to host"),
        TimeoutError(),
    ],
    ids=[
        "too narrow",
        "too many vectors",
        "all zeros",
        "no values",
        "not an object",
        "an error body",
        "not an object at the top",
        "http error",
        "unreachable",
        "timeout",
    ],
)
def test_the_client_raises_one_error_for_an_unreachable_or_bad_answer(
    monkeypatch: pytest.MonkeyPatch, answer: Any
) -> None:
    with pytest.raises(GeminiApiError) as raised:
        embed_with(monkeypatch, FakeNetwork(answer), ["text"])

    assert KEY not in str(raised.value)


def test_idea_text_is_title_then_summary() -> None:
    assert idea_text(Idea(title="A title", summary="A summary", details="Private")) == (
        "A title\nA summary"
    )


# --- the script and the tables -------------------------------------------------------------


def test_the_script_runs_twice_and_leaves_the_tables_as_they_were() -> None:
    sql = SCRIPT.read_text(encoding="utf-8")

    async def work(session: Any) -> None:
        connection = await (await session.connection()).get_raw_connection()
        await connection.driver_connection.execute(sql)
        await connection.driver_connection.execute(sql)

    run(work)

    tag = uuid4().hex
    idea = make_idea(tag)
    embed_everything(FakeEmbedder())
    assert idea_vector(idea) is not None
    change("UPDATE ideas SET title = 'Changed by the test' WHERE id = :id", id=idea.id)
    assert idea_vector(idea) is None


@pytest.mark.parametrize(
    ("table", "column"), [("idea_embeddings", "idea_id"), ("user_embeddings", "user_id")]
)
@pytest.mark.parametrize(
    ("model", "vector", "sha"),
    [
        ("all-MiniLM-L6-v2", "[" + ",".join(["1"] * 768) + "]", "a" * 64),
        ("gemini-embedding-2", "[" + ",".join(["1"] * 384) + "]", "a" * 64),
        ("gemini-embedding-2", "[" + ",".join(["1"] * 768) + "]", "not a hash"),
    ],
    ids=["wrong model", "wrong width", "wrong hash"],
)
def test_the_tables_refuse_a_wrong_model_a_wrong_width_and_a_wrong_hash(
    table: str, column: str, model: str, vector: str, sha: str
) -> None:
    owner = make_idea(uuid4().hex) if column == "idea_id" else make_developer(uuid4().hex)

    async def insert(session: Any) -> None:
        await session.execute(
            text(
                f"INSERT INTO {table} ({column}, model, embedding, source_sha256) "
                "VALUES (:id, :model, CAST(:vector AS vector), :sha)"
            ),
            {"id": owner.id, "model": model, "vector": vector, "sha": sha},
        )

    with pytest.raises(DBAPIError):
        run(insert)
