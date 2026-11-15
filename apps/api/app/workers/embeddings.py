from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from app.models import (
    Idea,
    IdeaEmbedding,
    ProfileEmbedding,
    User,
    UserRole,
    UserSector,
    UserTechnology,
)
from app.services.embeddings import (
    MODEL_VERSION,
    encode,
    idea_text,
    load_encoder,
    profile_text,
    source_hash,
)


async def process_pending_embeddings(db, limit: int = 32) -> int:
    ideas = list(
        (
            await db.scalars(
                select(Idea)
                .outerjoin(IdeaEmbedding, IdeaEmbedding.idea_id == Idea.id)
                .where(Idea.deleted_at.is_(None), IdeaEmbedding.idea_id.is_(None))
                .order_by(Idea.created_at, Idea.id)
                .limit(limit)
            )
        ).all()
    )
    users = list(
        (
            await db.scalars(
                select(User)
                .outerjoin(ProfileEmbedding, ProfileEmbedding.user_id == User.id)
                .options(
                    selectinload(User.roles).selectinload(UserRole.role),
                    selectinload(User.technologies).selectinload(UserTechnology.technology),
                    selectinload(User.sectors).selectinload(UserSector.sector),
                )
                .where(User.deleted_at.is_(None), ProfileEmbedding.user_id.is_(None))
                .order_by(User.created_at, User.id)
                .limit(limit)
            )
        ).all()
    )
    profile_sources = [(user, profile_text(user)) for user in users]
    profile_sources = [(user, text) for user, text in profile_sources if text]
    if not ideas and not profile_sources:
        return 0

    idea_sources = [(idea, idea_text(idea.title, idea.summary)) for idea in ideas]
    sources = [*idea_sources, *profile_sources]
    vectors = encode(load_encoder(), [text for _, text in sources])
    saved = 0
    for (record, text), vector in zip(sources, vectors, strict=True):
        is_idea = isinstance(record, Idea)
        table = IdeaEmbedding if is_idea else ProfileEmbedding
        key = "idea_id" if is_idea else "user_id"
        value = record.id
        await db.execute(
            insert(table)
            .values(
                **{key: value},
                model=MODEL_VERSION,
                embedding=vector,
                source_sha256=source_hash(text),
            )
            .on_conflict_do_update(
                index_elements=[key],
                set_={
                    "model": MODEL_VERSION,
                    "embedding": vector,
                    "source_sha256": source_hash(text),
                },
            )
        )
        saved += 1
    await db.commit()
    return saved
