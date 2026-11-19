"""The demo's frozen vectors, and the script that measures them.

The demo's developers and open ideas were measured once with the real model, and the vectors
are kept in demo_fixtures/vectors.json. The seed writes them, so the demo shows full match
scores where there is no OpenAI key, and while OpenAI is down. Each vector is kept with the hash
of the exact text it was made from, and only a row that still has that text gets it.

Make the file again after changing a demo bio, stack, sector or role, or an idea's title or
summary. Seed a new, empty database with the changed code, then run this, both with that
DATABASE_URL and the second with OPENAI_API_KEY set:

    uv run --directory apps/api python -m app.demo_seed
    uv run --directory apps/api python -m app.demo_vectors

It keeps the vectors of the texts that did not change, sends the others to OpenAI in one
request, and prints no key and no vector. Every text is made up, as the whole demo is.
docs/decisions/2026-11-19-demo-frozen-vectors.md
"""

import asyncio
import base64
import json
import struct
import sys
from pathlib import Path

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Idea, IdeaEmbedding, User, UserEmbedding
from app.models.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from app.services.embeddings import (
    EmbeddingApiError,
    EmbeddingConfigurationError,
    OpenAIEmbedder,
    idea_text,
    profile_text,
    source_sha256,
)
from app.workers.embeddings import EMBEDDED_IDEAS, EMBEDDED_USERS

FILE = Path(__file__).parent / "demo_fixtures" / "vectors.json"
# A vector in the file is its numbers as little-endian float32, which is what pgvector keeps,
# in base64.
PACKED = struct.Struct(f"<{EMBEDDING_DIMENSIONS}f")
# The demo's rows that the worker embeds, as (rows, which of them, their text, where the vector
# goes, its key).
DEMO_TEXTS = (
    (
        Idea,
        (*EMBEDDED_IDEAS, exists().where(User.id == Idea.author_id, User.is_demo)),
        idea_text,
        IdeaEmbedding,
        "idea_id",
    ),
    (User, (*EMBEDDED_USERS, User.is_demo), profile_text, UserEmbedding, "user_id"),
)


def frozen_vectors() -> dict[str, list[float]]:
    """The frozen vectors, by the hash of the text each was made from. None when the file holds
    another model's: vectors of two models cannot be compared, so the worker makes them all."""
    held = json.loads(FILE.read_text(encoding="utf-8"))
    if held["model"] != EMBEDDING_MODEL:
        return {}
    return {
        entry["sha256"]: list(PACKED.unpack(base64.b64decode(entry["vector"])))
        for entry in held["vectors"]
    }


async def write_frozen_vectors(db: AsyncSession) -> None:
    """Gives each demo row that has no vector the frozen one made from its text. A row whose
    text has no frozen vector, because it changed since the file was made, is left to the worker.
    Call it after the rows are written: a trigger removes a vector when its text changes."""
    frozen = frozen_vectors()
    for entity, rule, text_of, vector, key in DEMO_TEXTS:
        rows = await db.scalars(
            select(entity)
            .where(*rule, ~exists().where(getattr(vector, key) == entity.id))
            # read again: the seed adds roles, technologies and sectors to people the session
            # already holds, and their text must be today's
            .execution_options(populate_existing=True)
        )
        for row in rows.all():
            digest = source_sha256(text_of(row))
            if digest in frozen:
                db.add(
                    vector(
                        **{key: row.id},
                        model=EMBEDDING_MODEL,
                        embedding=frozen[digest],
                        source_sha256=digest,
                    )
                )
    await db.flush()


def file_text(vectors: dict[str, list[float]]) -> str:
    """One vector a line, in the order of the hashes, so a changed text changes one line."""
    lines = ",\n".join(
        json.dumps(
            {"sha256": digest, "vector": base64.b64encode(PACKED.pack(*vector)).decode("ascii")}
        )
        for digest, vector in sorted(vectors.items())
    )
    return f'{{"model": {json.dumps(EMBEDDING_MODEL)}, "vectors": [\n{lines}\n]}}\n'


async def main() -> int:
    from app.database import async_session, engine

    engine.echo = False  # the API logs every statement; here that would print the texts
    texts: dict[str, str] = {}
    async with async_session() as db:
        for entity, rule, text_of, _, _ in DEMO_TEXTS:
            for row in await db.scalars(select(entity).where(*rule)):
                texts[source_sha256(text_of(row))] = text_of(row)
    if not texts:
        print("The demo is not seeded in this database, so nothing was written.", file=sys.stderr)
        return 1
    held = frozen_vectors()
    changed = {digest: text for digest, text in texts.items() if digest not in held}
    try:
        measured = await OpenAIEmbedder().embed(list(changed.values()))
    except (EmbeddingConfigurationError, EmbeddingApiError) as error:
        print(f"Nothing was written. {error}", file=sys.stderr)
        return 1
    vectors = {digest: held[digest] for digest in texts if digest in held}
    vectors.update(zip(changed, measured, strict=True))
    FILE.write_text(file_text(vectors), encoding="utf-8", newline="\n")
    print(
        f"{FILE.name} holds {len(vectors)} vectors of {EMBEDDING_MODEL}: "
        f"{len(changed)} measured now, {len(vectors) - len(changed)} kept."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
