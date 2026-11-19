"""Embeds the ideas and developers that have no vector yet. Why a worker and not the request:
docs/decisions/2026-11-19-embeddings-on-openai.md
"""

import logging
from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from sqlalchemy import exists, select

from app.database import async_session
from app.models import (
    Idea,
    IdeaEmbedding,
    IdeaStatus,
    User,
    UserEmbedding,
    UserRole,
)
from app.models.embeddings import EMBEDDING_MODEL
from app.services.embeddings import (
    EmbeddingApiError,
    EmbeddingConfigurationError,
    idea_text,
    profile_text,
    source_sha256,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 20

# The same rule the match queries use to pick ideas, and a developer with a verified role. The
# demo's people and ideas are embedded like everyone else's: the seed gives them the vectors
# frozen in the repository, and a row it left without one gets its vector here.
# docs/decisions/2026-11-19-demo-frozen-vectors.md
EMBEDDED_IDEAS = (Idea.status == IdeaStatus.OPEN, Idea.deleted_at.is_(None))
EMBEDDED_USERS = (
    User.deleted_at.is_(None),
    exists().where(UserRole.user_id == User.id, UserRole.verified_at.is_not(None)),
)
IDEAS_TO_EMBED = (*EMBEDDED_IDEAS, ~exists().where(IdeaEmbedding.idea_id == Idea.id))
USERS_TO_EMBED = (*EMBEDDED_USERS, ~exists().where(UserEmbedding.user_id == User.id))

warned_without_key = False


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


async def embed_texts(embedder: Embedder, sent: dict[UUID, str]) -> dict[UUID, list[float]]:
    """One request for all the texts. If OpenAI refuses it, ask for each text alone, so one text it
    always refuses does not keep every row behind it from getting a vector."""
    try:
        return dict(zip(sent, await embedder.embed(list(sent.values())), strict=True))
    except EmbeddingApiError:
        if len(sent) == 1:
            raise
    vectors: dict[UUID, list[float]] = {}
    for row_id, text in sent.items():
        try:
            (vectors[row_id],) = await embedder.embed([text])
        except EmbeddingApiError as error:
            logger.warning("Embedding failed for %s, will retry on the next run: %s", row_id, error)
    return vectors


async def embed_rows(
    embedder: Embedder,
    entity: type[Idea] | type[User],
    to_embed: tuple,
    text_of: Callable,
    model: type[IdeaEmbedding] | type[UserEmbedding],
    key: str,
    limit: int,
) -> int:
    async with async_session() as db:
        rows = (
            await db.scalars(
                select(entity).where(*to_embed).order_by(entity.created_at, entity.id).limit(limit)
            )
        ).all()
    if not rows:
        return 0
    # the hash is of exactly what was sent, whatever happens to the row while OpenAI answers
    sent = {row.id: text_of(row) for row in rows}
    vectors = await embed_texts(embedder, sent)

    async with async_session() as db:
        # read again and locked: a row whose text changed while OpenAI answered gets no vector
        # here, and the next run embeds it again
        current = await db.scalars(
            select(entity).where(*to_embed, entity.id.in_(sent)).with_for_update(read=True)
        )
        stored = 0
        for row in current:
            if row.id not in vectors:
                continue
            digest = source_sha256(sent[row.id])
            if source_sha256(text_of(row)) == digest:
                db.add(
                    model(
                        **{key: row.id},
                        model=EMBEDDING_MODEL,
                        embedding=vectors[row.id],
                        source_sha256=digest,
                    )
                )
                stored += 1
        await db.commit()
    return stored


async def embed_missing(embedder: Embedder, limit: int = BATCH_SIZE) -> int:
    """One run: up to `limit` ideas and `limit` developers. A failure writes nothing and is
    logged without any text or key; the next run tries again."""
    global warned_without_key
    stored = 0
    for entity, to_embed, text_of, model, key in (
        (Idea, IDEAS_TO_EMBED, idea_text, IdeaEmbedding, "idea_id"),
        (User, USERS_TO_EMBED, profile_text, UserEmbedding, "user_id"),
    ):
        try:
            stored += await embed_rows(embedder, entity, to_embed, text_of, model, key, limit)
        except EmbeddingConfigurationError:
            if not warned_without_key:
                logger.warning("OPENAI_API_KEY is not set, so nothing is embedded.")
                warned_without_key = True
        except EmbeddingApiError as error:
            logger.warning("Embedding failed, will retry on the next run: %s", error)
        except Exception as error:
            # whatever else goes wrong with ideas must not stop the developers from being embedded;
            # the type only, as the message of a database error can hold values
            logger.warning(
                "Embedding %s failed, will retry on the next run: %s",
                entity.__name__,
                type(error).__name__,
            )
    return stored
