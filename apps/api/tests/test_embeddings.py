"""Embeddings of ideas and developers: what is sent, who is embedded, when a vector goes stale,
and the OpenAI client. No test calls OpenAI: the worker gets a fake embedder, and the client
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
from http.client import IncompleteRead
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
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
from app.services.embeddings import (
    EmbeddingApiError,
    EmbeddingConfigurationError,
    OpenAIEmbedder,
    idea_text,
    profile_text,
    source_sha256,
)
from app.workers import embeddings as worker
from app.workers import runner
from tests.conftest import TEST_DB_URL
from tests.conftest import test_async_session as db_session
from tests.hub_support import auth, make_user, run

INIT = Path(__file__).resolve().parents[3] / "infra" / "db" / "init"
# in the order every database gets them: 028 moves the tables 025 made to the model in use
SCRIPTS = [INIT / "025-embeddings.sql", INIT / "028-embeddings-on-openai.sql"]
KEY = "test-key-that-must-never-be-logged"


class FakeEmbedder:
    """Answers with a vector per text and remembers every text it was given."""

    def __init__(self) -> None:
        self.sent: list[str] = []
        self.error: Exception | None = None
        self.refuse: str | None = None
        self.crash: str | None = None
        self.while_embedding: Any = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if self.error:
            raise self.error
        if self.refuse and any(self.refuse in text for text in texts):
            raise EmbeddingApiError("OpenAI answered with an error.")
        if self.crash and any(self.crash in text for text in texts):
            raise RuntimeError("something that is not a provider error")
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


def make_idea(
    tag: str,
    *,
    status: IdeaStatus = IdeaStatus.OPEN,
    deleted: bool = False,
    is_demo: bool = False,
) -> Idea:
    author = make_user()

    async def work(session: Any) -> Idea:
        if is_demo:
            await session.execute(update(User).where(User.id == author.id).values(is_demo=True))
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


def test_an_open_idea_by_a_demo_account_with_no_vector_is_embedded_like_any_other() -> None:
    tag = uuid4().hex
    real, demo = make_idea(tag), make_idea(tag, is_demo=True)

    embed_everything(FakeEmbedder())

    assert idea_vector(real) is not None
    assert idea_vector(demo) is not None


def test_only_developers_with_a_verified_role_on_a_live_account_are_embedded() -> None:
    tag = uuid4().hex
    developer = make_developer(tag)
    demo = make_developer(tag, is_demo=True)
    unverified = make_developer(tag, verified=False)
    deleted = make_developer(tag, deleted=True)

    embed_everything(FakeEmbedder())

    assert user_vector(developer) is not None
    # a demo developer the seed gave no frozen vector is embedded too
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
    assert row.model == "text-embedding-3-small"
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


def test_a_text_that_changes_while_the_provider_answers_gets_no_stale_vector() -> None:
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
    failing.error = EmbeddingApiError("OpenAI could not be reached.")

    with caplog.at_level(logging.WARNING):
        assert embed_everything(failing) == 0

    assert (idea_vector(idea), user_vector(user)) == (None, None)
    assert tag not in caplog.text
    assert embed_everything(FakeEmbedder()) >= 2
    assert idea_vector(idea) is not None
    assert user_vector(user) is not None


def test_one_text_the_provider_refuses_does_not_hold_back_the_others(
    caplog: pytest.LogCaptureFixture,
) -> None:
    tag = uuid4().hex
    refused = make_idea(f"{tag}-refused")
    accepted = make_idea(tag)
    developer = make_developer(tag)
    embedder = FakeEmbedder()
    embedder.refuse = f"{tag}-refused"

    with caplog.at_level(logging.WARNING):
        embed_everything(embedder)

    assert idea_vector(accepted) is not None
    assert user_vector(developer) is not None
    assert idea_vector(refused) is None
    assert tag not in caplog.text
    embedder.refuse = None
    embed_everything(embedder)
    assert idea_vector(refused) is not None


def test_an_error_in_the_idea_step_does_not_stop_the_developers_being_embedded(
    caplog: pytest.LogCaptureFixture,
) -> None:
    tag = uuid4().hex
    idea = make_idea(tag)
    developer = make_developer(tag)
    embedder = FakeEmbedder()
    embedder.crash = "Offline farm ledger"

    with caplog.at_level(logging.WARNING):
        embed_everything(embedder)

    assert idea_vector(idea) is None
    assert user_vector(developer) is not None
    assert "Embedding Idea failed" in caplog.text
    assert tag not in caplog.text
    embedder.crash = None
    embed_everything(embedder)
    assert idea_vector(idea) is not None


def test_without_a_key_nothing_is_sent_and_the_log_says_so_once(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    idea = make_idea(uuid4().hex)

    def refuse(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("a request was made without a key")

    monkeypatch.setattr(client_module, "urlopen", refuse)

    with caplog.at_level(logging.WARNING):
        embed_everything(OpenAIEmbedder(api_key=None))
        embed_everything(OpenAIEmbedder(api_key=None))

    assert idea_vector(idea) is None
    assert caplog.text.count("OPENAI_API_KEY is not set") == 1


def test_a_failure_logs_neither_the_key_nor_the_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    tag = uuid4().hex
    idea = make_idea(tag)

    def unreachable(request: Any, timeout: float) -> None:
        raise URLError("no route to host")

    monkeypatch.setattr(client_module, "urlopen", unreachable)

    with caplog.at_level(logging.DEBUG):
        embed_everything(OpenAIEmbedder(api_key=KEY))

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


# --- the worker loop ----------------------------------------------------------------------


@pytest.fixture
def worker_loop(monkeypatch: pytest.MonkeyPatch) -> list[UUID]:
    """The loop with one verification session to process and no other verification work. Returns
    the sessions it processed."""
    processed: list[UUID] = []
    session_id = uuid4()

    async def one_session() -> list[UUID]:
        return [session_id]

    async def none() -> list[UUID]:
        return []

    async def analyse(db: Any, found: UUID, *args: Any) -> bool:
        processed.append(found)
        return True

    monkeypatch.setattr(runner, "async_session", db_session)
    monkeypatch.setattr(runner, "pending_session_ids", one_session)
    monkeypatch.setattr(runner, "report_session_ids", none)
    monkeypatch.setattr(runner, "process_codebase_analysis", analyse)
    return processed


def test_a_worker_run_does_the_verification_step_and_then_embeds(
    monkeypatch: pytest.MonkeyPatch, worker_loop: list[UUID]
) -> None:
    tag = uuid4().hex
    idea = make_idea(tag)
    developer = make_developer(tag)

    async def embed_all(embedder: Any) -> int:
        return await worker.embed_missing(embedder, limit=10_000)

    monkeypatch.setattr(runner, "OpenAIEmbedder", FakeEmbedder)
    monkeypatch.setattr(runner, "embed_missing", embed_all)

    processed = asyncio.run(runner.run_once())

    assert len(worker_loop) == 1
    assert processed >= 3
    assert idea_vector(idea) is not None
    assert user_vector(developer) is not None


def test_a_failing_embedding_step_leaves_the_verification_steps_done(
    monkeypatch: pytest.MonkeyPatch, worker_loop: list[UUID], caplog: pytest.LogCaptureFixture
) -> None:
    async def explode(embedder: Any) -> int:
        raise RuntimeError("the embedding step broke")

    monkeypatch.setattr(runner, "embed_missing", explode)

    with caplog.at_level(logging.ERROR):
        processed = asyncio.run(runner.run_once())

    assert processed == 1
    assert len(worker_loop) == 1
    assert "Embedding run failed" in caplog.text


# --- the OpenAI client ---------------------------------------------------------------------


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
    return {
        "object": "list",
        "data": [
            {"object": "embedding", "index": index, "embedding": vector}
            for index, vector in enumerate(vectors)
        ],
    }


def embed_with(monkeypatch: pytest.MonkeyPatch, network: FakeNetwork, texts: list[str]) -> Any:
    monkeypatch.setattr(client_module, "urlopen", network)
    return asyncio.run(OpenAIEmbedder(api_key=KEY).embed(texts))


def test_the_client_asks_for_768_numbers_per_text_in_one_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    network = FakeNetwork(answer_with([1.0] * 768, [2.0] * 768))

    embed_with(monkeypatch, network, ["first text", "second text"])

    ((request, timeout),) = network.requests
    assert request.full_url == "https://api.openai.com/v1/embeddings"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == f"Bearer {KEY}"
    assert request.full_url.count(KEY) == 0
    assert timeout > 0
    assert json.loads(request.data) == {
        "model": "text-embedding-3-small",
        "input": ["first text", "second text"],
        "dimensions": 768,
        "encoding_format": "float",
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


def test_the_client_puts_the_vectors_back_in_the_order_asked_by_their_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    answer = answer_with([1.0] + [0.0] * 767, [0.0, 1.0] + [0.0] * 766)
    answer["data"].reverse()

    vectors = embed_with(monkeypatch, FakeNetwork(answer), ["a", "b"])

    assert (vectors[0][0], vectors[1][1]) == (1.0, 1.0)


def test_the_client_sends_nothing_for_no_texts(monkeypatch: pytest.MonkeyPatch) -> None:
    network = FakeNetwork(answer_with())

    assert embed_with(monkeypatch, network, []) == []
    assert network.requests == []


def test_the_client_without_a_key_raises_the_configuration_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    network = FakeNetwork(answer_with([1.0] * 768))
    monkeypatch.setattr(client_module, "urlopen", network)

    with pytest.raises(EmbeddingConfigurationError):
        asyncio.run(OpenAIEmbedder(api_key=None).embed(["text"]))

    assert network.requests == []


@pytest.mark.parametrize(
    "answer",
    [
        answer_with([1.0] * 767),
        answer_with([1.0] * 768, [1.0] * 768),
        answer_with([0.0] * 768),
        {"data": [{"index": 0, "vector": [1.0] * 768}]},
        {"data": [{"index": 1, "embedding": [1.0] * 768}]},
        {"data": ["not an object"]},
        {"error": {"message": "quota"}},
        [],
        HTTPError("https://example.test", 429, "Too Many Requests", {}, None),
        URLError("no route to host"),
        TimeoutError(),
        IncompleteRead(b"{"),
        ConnectionResetError(),
    ],
    ids=[
        "too narrow",
        "too many vectors",
        "all zeros",
        "no values",
        "an index of another text",
        "not an object",
        "an error body",
        "not an object at the top",
        "http error",
        "unreachable",
        "timeout",
        "a body cut short",
        "a connection reset while reading",
    ],
)
def test_the_client_raises_one_error_for_an_unreachable_or_bad_answer(
    monkeypatch: pytest.MonkeyPatch, answer: Any
) -> None:
    with pytest.raises(EmbeddingApiError) as raised:
        embed_with(monkeypatch, FakeNetwork(answer), ["text"])

    assert KEY not in str(raised.value)


def test_idea_text_is_title_then_summary() -> None:
    assert idea_text(Idea(title="A title", summary="A summary", details="Private")) == (
        "A title\nA summary"
    )


# --- the script and the tables -------------------------------------------------------------


def apply_script() -> None:
    async def work(session: Any) -> None:
        connection = await (await session.connection()).get_raw_connection()
        for script in SCRIPTS:
            await connection.driver_connection.execute(script.read_text(encoding="utf-8"))

    run(work)


def embedding_schema() -> list[tuple[Any, ...]]:
    """What the scripts define: columns, constraints, indexes, triggers and their functions."""
    queries = [
        """SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                  pg_get_expr(d.adbin, d.adrelid), a.attnotnull
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE c.relname IN ('idea_embeddings', 'user_embeddings')
             AND a.attnum > 0 AND NOT a.attisdropped
           ORDER BY 1, a.attnum""",
        """SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
           FROM pg_constraint
           WHERE conrelid IN ('idea_embeddings'::regclass, 'user_embeddings'::regclass)
           ORDER BY 1, 2""",
        """SELECT tablename, indexname, indexdef FROM pg_indexes
           WHERE tablename IN ('idea_embeddings', 'user_embeddings') ORDER BY 1, 2""",
        """SELECT tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) FROM pg_trigger
           WHERE NOT tgisinternal AND tgname LIKE '%invalidate_embedding' ORDER BY 1, 2""",
        """SELECT proname, pg_get_functiondef(oid) FROM pg_proc
           WHERE proname LIKE '%invalidate_embedding' ORDER BY 1""",
    ]

    async def work(session: Any) -> list[tuple[Any, ...]]:
        rows: list[tuple[Any, ...]] = []
        for query in queries:
            rows.extend(tuple(row) for row in await session.execute(text(query)))
        return rows

    return run(work)


def test_the_scripts_run_twice_and_leave_the_tables_as_they_were() -> None:
    # once first: a database may have had a script applied from a checkout with other line
    # endings, which a function's stored text keeps
    apply_script()
    before = embedding_schema()
    assert {
        "idea_embeddings_model",
        "idea_embeddings_hnsw_idx",
        "user_embeddings_model",
        "user_embeddings_sha256_format",
        "user_embeddings_hnsw_idx",
        "ideas_invalidate_embedding",
        "users_invalidate_embedding",
        "user_roles_invalidate_embedding",
        "user_technologies_invalidate_embedding",
        "user_sectors_invalidate_embedding",
    } <= {row[1] for row in before}

    apply_script()
    apply_script()

    assert embedding_schema() == before
    idea = make_idea(uuid4().hex)
    embed_everything(FakeEmbedder())
    assert idea_vector(idea) is not None
    change("UPDATE ideas SET title = 'Changed by the test' WHERE id = :id", id=idea.id)
    assert idea_vector(idea) is None


# The tables of a database made before 025, in a schema of their own that the test rolls back.
OLD_MODEL_TABLES = """
CREATE SCHEMA before_025;
SET LOCAL search_path TO before_025, public;
CREATE TABLE users (id uuid PRIMARY KEY, bio text);
CREATE TABLE user_roles (user_id uuid, role_id uuid, verified_at timestamptz);
CREATE TABLE user_technologies (user_id uuid, technology_id uuid);
CREATE TABLE user_sectors (user_id uuid, sector_id uuid);
CREATE TABLE ideas (id uuid PRIMARY KEY);
CREATE TABLE idea_embeddings (
  idea_id       uuid        PRIMARY KEY REFERENCES ideas (id) ON DELETE CASCADE,
  model         text        NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  embedding     vector(384) NOT NULL,
  source_sha256 text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idea_embeddings_model CHECK (model = 'all-MiniLM-L6-v2'),
  CONSTRAINT idea_embeddings_sha256_format CHECK (source_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idea_embeddings_hnsw_idx ON idea_embeddings USING hnsw (embedding vector_cosine_ops);
"""


def test_the_scripts_remove_rows_of_an_older_model_and_change_the_width() -> None:
    first, second = (script.read_text(encoding="utf-8") for script in SCRIPTS)
    old_vector = "[" + ",".join(["1"] * 384) + "]"
    new_vector = "[" + ",".join(["1"] * 768) + "]"
    insert_new = (
        "INSERT INTO idea_embeddings (idea_id, embedding, source_sha256) "
        f"SELECT id, '{new_vector}', repeat('b', 64) FROM ideas"
    )

    async def work() -> tuple[int, str, int, int, int]:
        connection = await asyncpg.connect(TEST_DB_URL)
        transaction = connection.transaction()
        await transaction.start()
        try:
            await connection.execute(OLD_MODEL_TABLES)
            await connection.execute("INSERT INTO ideas VALUES (gen_random_uuid())")
            await connection.execute(
                "INSERT INTO idea_embeddings (idea_id, embedding, source_sha256) "
                f"SELECT id, '{old_vector}', repeat('a', 64) FROM ideas"
            )
            await connection.execute(first)
            left = await connection.fetchval("SELECT count(*) FROM idea_embeddings")
            width = await connection.fetchval(
                "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                "WHERE attrelid = 'before_025.idea_embeddings'::regclass AND attname = 'embedding'"
            )
            # a vector that 025's model made is removed by 028, and one of the model in use
            # outlives both scripts run again in order
            await connection.execute(insert_new)
            await connection.execute(second)
            replaced = await connection.fetchval("SELECT count(*) FROM idea_embeddings")
            await connection.execute(insert_new)
            await connection.execute(first)
            await connection.execute(second)
            kept = await connection.fetchval("SELECT count(*) FROM idea_embeddings")
            made = await connection.fetchval("SELECT count(*) FROM user_embeddings")
            return left, width, replaced, kept, made
        finally:
            await transaction.rollback()
            await connection.close()

    left, width, replaced, kept, made = asyncio.run(work())

    assert left == 0
    assert width == "vector(768)"
    assert replaced == 0
    assert kept == 1
    assert made == 0


@pytest.mark.parametrize(
    ("table", "column"), [("idea_embeddings", "idea_id"), ("user_embeddings", "user_id")]
)
@pytest.mark.parametrize(
    ("model", "vector", "sha"),
    [
        ("gemini-embedding-2", "[" + ",".join(["1"] * 768) + "]", "a" * 64),
        ("text-embedding-3-small", "[" + ",".join(["1"] * 384) + "]", "a" * 64),
        ("text-embedding-3-small", "[" + ",".join(["1"] * 768) + "]", "not a hash"),
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
