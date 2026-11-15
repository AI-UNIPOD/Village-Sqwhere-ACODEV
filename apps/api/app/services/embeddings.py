import hashlib
from collections.abc import Sequence
from functools import lru_cache
from typing import Protocol

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_VERSION = "all-MiniLM-L6-v2"
EMBEDDING_DIMENSIONS = 384


class TextEncoder(Protocol):
    def encode(self, sentences: Sequence[str], **kwargs: object) -> object: ...


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def idea_text(title: str, summary: str) -> str:
    return f"{title}\n{summary}"


def profile_text(user: object) -> str | None:
    bio = getattr(user, "bio", None)
    parts = [bio.strip()] if bio and bio.strip() else []
    for association in getattr(user, "roles", []):
        if association.role and association.role.is_active and association.verified_at is not None:
            parts.append(association.role.name)
    for association in getattr(user, "technologies", []):
        if association.technology and association.technology.is_active:
            parts.append(association.technology.name)
    for association in getattr(user, "sectors", []):
        if association.sector and association.sector.is_active:
            parts.append(association.sector.name)
    return "\n".join(parts) if parts else None


@lru_cache(maxsize=1)
def load_encoder() -> TextEncoder:
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME, device="cpu")


def encode(encoder: TextEncoder, texts: list[str]) -> list[list[float]]:
    vectors = encoder.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return [[float(value) for value in vector] for vector in vectors]
