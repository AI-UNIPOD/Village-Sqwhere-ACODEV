"""Embeds the ideas and developers that have no vector yet. Why a worker and not the request:
docs/decisions/2026-11-15-embeddings-on-gemini.md
"""

import logging
from collections.abc import Callable
from typing import Protocol

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
from app.services.embeddings import idea_text, profile_text, source_sha256
from app.services.gemini import GeminiApiError, GeminiConfigurationError

logger = logging.getLogger(__name__)

BATCH_SIZE = 20

# The same rule the match queries use to pick ideas, and a developer with a verified role.
IDEAS_TO_EMBED = (
    Idea.status == IdeaStatus.OPEN,
    Idea.deleted_at.is_(None),
    ~exists().where(IdeaEmbedding.idea_id == Idea.id),
)
USERS_TO_EMBED = (
    User.deleted_at.is_(None),
    exists().where(UserRole.user_id == User.id, UserRole.verified_at.is_not(None)),
    ~exists().where(UserEmbedding.user_id == User.id),
)

warned_without_key = False


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


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
    # the hash is of exactly what was sent, whatever happens to the row while Gemini answers
    sent = {row.id: text_of(row) for row in rows}
    vectors = dict(zip(sent, await embedder.embed(list(sent.values())), strict=True))

    async with async_session() as db:
        # read again and locked: a row whose text changed while Gemini answered gets no vector
        # here, and the next run embeds it again
        current = await db.scalars(
            select(entity).where(*to_embed, entity.id.in_(sent)).with_for_update(read=True)
        )
        stored = 0
        for row in current:
            digest = source_sha256(sent[row.id])
            if source_sha256(text_of(row)) == digest:
                db.add(model(**{key: row.id}, embedding=vectors[row.id], source_sha256=digest))
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
        except GeminiConfigurationError:
            if not warned_without_key:
                logger.warning("GEMINI_API_KEY is not set, so nothing is embedded.")
                warned_without_key = True
        except GeminiApiError as error:
            logger.warning("Embedding failed, will retry on the next run: %s", error)
    return stored
