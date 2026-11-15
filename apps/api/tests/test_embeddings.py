from collections.abc import Generator
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Idea,
    IdeaEmbedding,
    IdeaRoleNeed,
    ProfileEmbedding,
    Role,
    Sector,
    Technology,
    User,
    UserRole,
    UserSector,
    UserTechnology,
)
from app.services.embeddings import MODEL_VERSION, idea_text, profile_text, source_hash
from app.workers import embeddings as embedding_worker
from tests.hub_support import auth, bad_auth_headers, make_idea, make_user, run

DIMENSIONS = 384
SIMILAR = "/v1/ideas"
MY_IDEAS = "/v1/me/ideas"


class EmbeddingRows:
    def __init__(self) -> None:
        self.idea_ids: set[UUID] = set()
        self.profile_ids: set[UUID] = set()

    def track_idea(self, idea_id: UUID) -> None:
        self.idea_ids.add(idea_id)

    def track_profile(self, user_id: UUID) -> None:
        self.profile_ids.add(user_id)

    def save_idea(self, idea_id: UUID, vector: list[float]) -> None:
        self.track_idea(idea_id)

        async def save(session: AsyncSession) -> None:
            session.add(
                IdeaEmbedding(
                    idea_id=idea_id,
                    model=MODEL_VERSION,
                    embedding=vector,
                    source_sha256="a" * 64,
                )
            )
            await session.commit()

        run(save)

    def save_profile(self, user_id: UUID, vector: list[float]) -> None:
        self.track_profile(user_id)

        async def save(session: AsyncSession) -> None:
            session.add(
                ProfileEmbedding(
                    user_id=user_id,
                    model=MODEL_VERSION,
                    embedding=vector,
                    source_sha256="b" * 64,
                )
            )
            await session.commit()

        run(save)


@pytest.fixture
def embedding_rows() -> Generator[EmbeddingRows]:
    rows = EmbeddingRows()
    yield rows

    async def clean(session: AsyncSession) -> None:
        if rows.idea_ids:
            await session.execute(
                delete(IdeaEmbedding).where(IdeaEmbedding.idea_id.in_(rows.idea_ids))
            )
            await session.execute(
                update(Idea).where(Idea.id.in_(rows.idea_ids)).values(created_at=datetime.now(UTC))
            )
        if rows.profile_ids:
            await session.execute(
                delete(ProfileEmbedding).where(ProfileEmbedding.user_id.in_(rows.profile_ids))
            )
            await session.execute(
                update(User)
                .where(User.id.in_(rows.profile_ids))
                .values(created_at=datetime.now(UTC))
            )
        await session.commit()

    run(clean)


@pytest.fixture
def unique_role() -> Generator[Role]:
    slug = f"test-embedding-{uuid4().hex[:12]}"

    async def create(session: AsyncSession) -> Role:
        role = Role(slug=slug, name=slug.replace("-", " ").title())
        session.add(role)
        await session.commit()
        return role

    role = run(create)
    yield role

    async def clean(session: AsyncSession) -> None:
        await session.execute(delete(IdeaRoleNeed).where(IdeaRoleNeed.role_id == role.id))
        await session.execute(delete(UserRole).where(UserRole.role_id == role.id))
        await session.execute(delete(Role).where(Role.id == role.id))
        await session.commit()

    run(clean)


def vector(x: float, y: float = 0.0) -> list[float]:
    values = [0.0] * DIMENSIONS
    values[0], values[1] = x, y
    return values


def publish(client: TestClient, owner: User, *, title: str = "Offline farm ledger") -> str:
    response = client.post(
        MY_IDEAS,
        headers=auth(owner),
        json={
            "title": title,
            "summary": "A ledger that works offline for smallholder farmers in Kano.",
            "details": "Private rollout notes that must never be embedded or returned.",
            "roles_needed": [],
        },
    )
    assert response.status_code == 201, response.text
    idea_id = response.json()["data"]["id"]
    response = client.post(f"{MY_IDEAS}/{idea_id}/publish", headers=auth(owner))
    assert response.status_code == 200, response.text
    return idea_id


def verify(user: User, role: Role) -> None:
    async def add(session: AsyncSession) -> None:
        session.add(UserRole(user_id=user.id, role_id=role.id, verified_at=datetime.now(UTC)))
        await session.commit()

    run(add)


def save_profile_bio(user: User, bio: str) -> None:
    async def update_bio(session: AsyncSession) -> None:
        await session.execute(update(User).where(User.id == user.id).values(bio=bio))
        await session.commit()

    run(update_bio)


def test_similar_ideas_requires_authentication_and_valid_pagination(
    client: TestClient,
) -> None:
    owner = make_user()
    idea = make_idea(owner)
    url = f"{SIMILAR}/{idea.id}/similar"

    for headers in bad_auth_headers().values():
        assert client.get(url, headers=headers).status_code == 401
    assert client.get(url, headers=auth(make_user()), params={"limit": 0}).status_code == 422
    assert client.get(url, headers=auth(make_user()), params={"limit": 51}).status_code == 422
    assert client.get(url, headers=auth(make_user()), params={"offset": -1}).status_code == 422
    assert client.get(f"{SIMILAR}/not-a-uuid/similar", headers=auth(make_user())).status_code == 422


@pytest.mark.parametrize("status", ["draft", "closed", "deleted", "missing", "other-world"])
def test_similar_ideas_hides_inaccessible_target_ideas(client: TestClient, status: str) -> None:
    viewer = make_user()
    if status == "missing":
        idea_id = uuid4()
    elif status == "other-world":
        owner = make_user()
        idea = make_idea(owner)

        async def mark_demo(session: AsyncSession) -> None:
            await session.execute(update(User).where(User.id == owner.id).values(is_demo=True))
            await session.commit()

        run(mark_demo)
        idea_id = idea.id
    else:
        owner = make_user()
        idea = make_idea(owner, status={"draft": "draft", "closed": "closed"}.get(status, "open"))
        if status == "deleted":

            async def soft_delete(session: AsyncSession) -> None:
                await session.execute(
                    update(Idea).where(Idea.id == idea.id).values(deleted_at=datetime.now(UTC))
                )
                await session.commit()

            run(soft_delete)
        idea_id = idea.id

    response = client.get(f"{SIMILAR}/{idea_id}/similar", headers=auth(viewer))

    assert response.status_code == 404, response.text
    assert response.json()["detail"]["code"] == "NOT_FOUND"


def test_similar_ideas_reports_pending_target_and_an_empty_result(
    client: TestClient,
    embedding_rows: EmbeddingRows,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api import deps

    monkeypatch.setattr(deps.config, "DEMO_ENABLED", True)
    owner, viewer = make_user(), make_user()
    pending = make_idea(owner)

    async def mark_demo(session: AsyncSession) -> None:
        await session.execute(
            update(User).where(User.id.in_([owner.id, viewer.id])).values(is_demo=True)
        )
        await session.commit()

    run(mark_demo)

    response = client.get(f"{SIMILAR}/{pending.id}/similar", headers=auth(viewer))

    assert response.status_code == 200, response.text
    assert response.json() == {"data": [], "next_offset": None, "embedding_pending": True}

    ready = make_idea(owner)
    embedding_rows.save_idea(ready.id, vector(1.0))
    response = client.get(f"{SIMILAR}/{ready.id}/similar", headers=auth(viewer))

    assert response.status_code == 200, response.text
    assert response.json() == {"data": [], "next_offset": None, "embedding_pending": False}


def test_similar_ideas_uses_cosine_order_paginates_and_returns_only_public_cards(
    client: TestClient, embedding_rows: EmbeddingRows
) -> None:
    target_owner, reader = make_user(), make_user()
    target = make_idea(target_owner)
    nearer = make_idea(make_user())
    orthogonal = make_idea(make_user())
    opposite = make_idea(make_user())
    no_vector = make_idea(make_user())
    embedding_rows.save_idea(target.id, vector(1.0))
    embedding_rows.save_idea(nearer.id, vector(0.8, 0.6))
    embedding_rows.save_idea(orthogonal.id, vector(0.0, 1.0))
    embedding_rows.save_idea(opposite.id, vector(-1.0))

    results = []
    offset = 0
    while True:
        response = client.get(
            f"{SIMILAR}/{target.id}/similar",
            headers=auth(reader),
            params={"limit": 2, "offset": offset},
        )
        assert response.status_code == 200, response.text
        page = response.json()
        results.extend(page["data"])
        if page["next_offset"] is None:
            break
        offset = page["next_offset"]

    ids = [item["idea"]["id"] for item in results]
    assert len(ids) == len(set(ids))
    assert ids.index(str(nearer.id)) < ids.index(str(orthogonal.id)) < ids.index(str(opposite.id))
    assert {item["idea"]["id"]: item["similarity"] for item in results}[str(nearer.id)] == 0.8
    assert {item["idea"]["id"]: item["similarity"] for item in results}[str(orthogonal.id)] == 0.0
    assert {item["idea"]["id"]: item["similarity"] for item in results}[str(opposite.id)] == 0.0
    assert all("details" not in item["idea"] for item in results)
    assert "details" not in response.text
    assert str(target.id) not in ids
    assert str(no_vector.id) not in ids


def test_similar_ideas_keeps_demo_content_inside_its_world(
    client: TestClient,
    embedding_rows: EmbeddingRows,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api import deps

    monkeypatch.setattr(deps.config, "DEMO_ENABLED", True)
    real_user, real_owner, demo_owner, demo_viewer = [make_user() for _ in range(4)]
    real_target = make_idea(real_owner)
    demo_candidate = make_idea(demo_owner)

    async def mark_demo(session: AsyncSession) -> None:
        await session.execute(
            update(User).where(User.id.in_([demo_owner.id, demo_viewer.id])).values(is_demo=True)
        )
        await session.commit()

    run(mark_demo)
    embedding_rows.save_idea(real_target.id, vector(1.0))
    embedding_rows.save_idea(demo_candidate.id, vector(1.0))

    hidden_target = client.get(f"{SIMILAR}/{demo_candidate.id}/similar", headers=auth(real_user))
    real_results = client.get(f"{SIMILAR}/{real_target.id}/similar", headers=auth(real_user))
    demo_results = client.get(f"{SIMILAR}/{demo_candidate.id}/similar", headers=auth(demo_viewer))

    assert hidden_target.status_code == 404
    assert all(
        item["idea"]["author"]["id"] != str(demo_owner.id) for item in real_results.json()["data"]
    )
    assert all(
        item["idea"]["author"]["id"] != str(real_owner.id) for item in demo_results.json()["data"]
    )


def test_embedding_text_and_hash_use_only_the_intended_profile_fields() -> None:
    active = SimpleNamespace(name="Backend Engineer", is_active=True)
    inactive = SimpleNamespace(name="Retired Role", is_active=False)
    tech = SimpleNamespace(name="Python", is_active=True)
    sector = SimpleNamespace(name="Agriculture", is_active=True)
    user = SimpleNamespace(
        bio="Builds offline tools",
        username="private-handle",
        email="private@example.test",
        roles=[
            SimpleNamespace(role=active, verified_at=datetime.now(UTC)),
            SimpleNamespace(role=inactive, verified_at=datetime.now(UTC)),
            SimpleNamespace(role=active, verified_at=None),
        ],
        technologies=[SimpleNamespace(technology=tech)],
        sectors=[SimpleNamespace(sector=sector)],
    )

    text = profile_text(user)

    assert text == "Builds offline tools\nBackend Engineer\nPython\nAgriculture"
    assert "private-handle" not in text and "private@example.test" not in text
    assert profile_text(SimpleNamespace(bio=None, roles=[], technologies=[], sectors=[])) is None
    assert idea_text("Title", "Public abstract") == "Title\nPublic abstract"
    assert source_hash("same") == source_hash("same")
    assert source_hash("same") != source_hash("different")


def test_embedding_worker_writes_vectors_hashes_and_never_encodes_private_fields(
    monkeypatch: pytest.MonkeyPatch, embedding_rows: EmbeddingRows
) -> None:
    owner = make_user()
    idea = make_idea(owner)
    save_profile_bio(owner, "Builds community farming software")
    oldest = datetime(1, 1, 1, tzinfo=UTC)

    async def make_first(session: AsyncSession) -> None:
        await session.execute(update(Idea).where(Idea.id == idea.id).values(created_at=oldest))
        await session.execute(update(User).where(User.id == owner.id).values(created_at=oldest))
        await session.commit()

    run(make_first)

    class FakeEncoder:
        texts: list[str] = []

        def encode(self, sentences: list[str], **kwargs: Any) -> list[list[float]]:
            self.texts = list(sentences)
            assert kwargs["normalize_embeddings"] is True
            return [vector(1.0) for _ in sentences]

    encoder = FakeEncoder()
    monkeypatch.setattr(embedding_worker, "load_encoder", lambda: encoder)
    embedding_rows.track_idea(idea.id)
    embedding_rows.track_profile(owner.id)

    async def process(session: AsyncSession) -> int:
        return await embedding_worker.process_pending_embeddings(session, limit=1)

    processed = run(process)

    assert processed == 2
    assert idea_text(idea.title, idea.summary) in encoder.texts
    assert "Confidential plan, for hub members only." not in "\n".join(encoder.texts)
    assert "community farming software" in "\n".join(encoder.texts)
    assert owner.username not in "\n".join(encoder.texts)

    async def stored(session: AsyncSession) -> tuple[IdeaEmbedding, ProfileEmbedding]:
        idea_row = await session.get(IdeaEmbedding, idea.id)
        profile_row = await session.get(ProfileEmbedding, owner.id)
        assert idea_row is not None and profile_row is not None
        return idea_row, profile_row

    idea_row, profile_row = run(stored)
    assert len(idea_row.embedding) == len(profile_row.embedding) == DIMENSIONS
    assert idea_row.source_sha256 == source_hash(idea_text(idea.title, idea.summary))
    assert profile_row.source_sha256 == source_hash("Builds community farming software")


@pytest.mark.parametrize("source", ["bio", "role", "technology", "sector"])
def test_profile_source_changes_invalidate_the_saved_vector(
    source: str, embedding_rows: EmbeddingRows
) -> None:
    user = make_user()
    embedding_rows.save_profile(user.id, vector(1.0))

    async def change(session: AsyncSession) -> None:
        if source == "bio":
            await session.execute(update(User).where(User.id == user.id).values(bio="New bio"))
        elif source == "role":
            role = await session.scalar(select(Role).where(Role.slug == "backend-engineer"))
            assert role is not None
            session.add(UserRole(user_id=user.id, role_id=role.id, verified_at=datetime.now(UTC)))
        elif source == "technology":
            technology = await session.scalar(select(Technology).where(Technology.slug == "python"))
            assert technology is not None
            session.add(UserTechnology(user_id=user.id, technology_id=technology.id))
        else:
            sector = await session.scalar(select(Sector).where(Sector.slug == "agritech"))
            assert sector is not None
            session.add(UserSector(user_id=user.id, sector_id=sector.id))
        await session.commit()

    run(change)

    async def missing(session: AsyncSession) -> bool:
        return await session.get(ProfileEmbedding, user.id) is None

    assert run(missing)


@pytest.mark.parametrize("field", ["title", "summary"])
def test_idea_text_changes_invalidate_the_saved_vector(
    field: str, embedding_rows: EmbeddingRows
) -> None:
    idea = make_idea(make_user())
    embedding_rows.save_idea(idea.id, vector(1.0))

    async def change(session: AsyncSession) -> None:
        await session.execute(
            update(Idea).where(Idea.id == idea.id).values({field: f"Changed {field} text"})
        )
        await session.commit()

    run(change)

    async def missing(session: AsyncSession) -> bool:
        return await session.get(IdeaEmbedding, idea.id) is None

    assert run(missing)


def test_developer_match_score_uses_meaning_and_orders_partial_scores_correctly(
    client: TestClient,
    unique_role: Role,
    embedding_rows: EmbeddingRows,
) -> None:
    owner, aligned, partial, orthogonal = [make_user() for _ in range(4)]
    for user in (aligned, partial, orthogonal):
        verify(user, unique_role)
    idea_id = publish(client, owner)

    async def attach_role(session: AsyncSession) -> None:
        session.add(IdeaRoleNeed(idea_id=UUID(idea_id), role_id=unique_role.id))
        await session.commit()

    run(attach_role)
    embedding_rows.save_idea(UUID(idea_id), vector(1.0))
    embedding_rows.save_profile(aligned.id, vector(1.0))
    embedding_rows.save_profile(orthogonal.id, vector(0.0, 1.0))

    response = client.get(f"{MY_IDEAS}/{idea_id}/matches", headers=auth(owner))

    assert response.status_code == 200, response.text
    cards = response.json()["data"]
    assert [card["id"] for card in cards] == [
        str(aligned.id),
        str(partial.id),
        str(orthogonal.id),
    ], [(card["id"], card["score"], card["breakdown"]) for card in cards]
    assert [card["score"] for card in cards] == [60, 43, 30]
    assert [card["score_version"] for card in cards] == [2, 1, 2]
    assert [card["partial"] for card in cards] == [False, True, False]
    assert [card["breakdown"]["meaning"]["points"] for card in cards] == [30, None, 0]


def test_idea_match_score_compares_the_caller_profile_to_idea_vectors(
    client: TestClient,
    unique_role: Role,
    embedding_rows: EmbeddingRows,
) -> None:
    developer = make_user()
    verify(developer, unique_role)
    aligned_owner, partial_owner, orthogonal_owner = [make_user() for _ in range(3)]
    aligned_id = publish(client, aligned_owner)
    partial_id = publish(client, partial_owner)
    orthogonal_id = publish(client, orthogonal_owner)
    for idea_id in (aligned_id, partial_id, orthogonal_id):

        async def require_role(session: AsyncSession, item_id: str = idea_id) -> None:
            session.add(IdeaRoleNeed(idea_id=UUID(item_id), role_id=unique_role.id))
            await session.commit()

        run(require_role)
    embedding_rows.save_profile(developer.id, vector(1.0))
    embedding_rows.save_idea(UUID(aligned_id), vector(1.0))
    embedding_rows.save_idea(UUID(orthogonal_id), vector(0.0, 1.0))

    response = client.get("/v1/me/matches", headers=auth(developer))

    assert response.status_code == 200, response.text
    cards = response.json()["data"]
    assert [card["idea"]["id"] for card in cards] == [
        aligned_id,
        partial_id,
        orthogonal_id,
    ], [(card["idea"]["id"], card["score"], card["breakdown"]) for card in cards]
    assert [card["score"] for card in cards] == [60, 43, 30]
    assert [card["score_version"] for card in cards] == [2, 1, 2]
    assert [card["partial"] for card in cards] == [False, True, False]
    assert [card["breakdown"]["meaning"]["points"] for card in cards] == [30, None, 0]
