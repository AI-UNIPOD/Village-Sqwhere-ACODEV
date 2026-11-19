"""What leaves the server to be embedded, and the client that asks OpenAI to embed it.

Only public text is sent: an idea's title and summary, and a developer's verified roles,
technologies, sectors and bio. Why, and what the provider's documentation says:
docs/decisions/2026-11-19-embeddings-on-openai.md
"""

import asyncio
import hashlib
import json
import math
from http.client import HTTPException
from urllib.request import Request, urlopen

from app.config import OPENAI_API_KEY
from app.models import Idea, User
from app.models.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL

EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingConfigurationError(Exception):
    pass


class EmbeddingApiError(Exception):
    pass


def idea_text(idea: Idea) -> str:
    """The public part of an idea. Never idea.details, the private brief."""
    return f"{idea.title}\n{idea.summary}"


def profile_text(user: User) -> str:
    """A developer's verified roles, technologies, sectors and bio, in a fixed order, so the same
    profile always gives the same text. No name, username or email."""
    lines = [
        ("Roles", sorted(held.role.name for held in user.roles if held.verified_at is not None)),
        ("Technologies", sorted(held.technology.name for held in user.technologies)),
        ("Sectors", sorted(held.sector.name for held in user.sectors)),
    ]
    parts = [f"{label}: {', '.join(names)}" for label, names in lines if names]
    if user.bio and user.bio.strip():
        parts.append(f"Bio: {user.bio.strip()}")
    return "\n".join(parts)


def source_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class OpenAIEmbedder:
    def __init__(self, api_key: str | None = OPENAI_API_KEY, timeout: float = 30) -> None:
        self.api_key = api_key
        self.timeout = timeout

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One unit-length vector of EMBEDDING_DIMENSIONS numbers per text, in the same order."""
        if not self.api_key:
            raise EmbeddingConfigurationError("An OpenAI API key is required.")
        if not texts:
            return []
        payload = {
            "model": EMBEDDING_MODEL,
            "input": texts,
            "dimensions": EMBEDDING_DIMENSIONS,
            "encoding_format": "float",
        }
        try:
            response = await asyncio.to_thread(self._post_json_sync, EMBEDDINGS_URL, payload)
        except (HTTPException, OSError, ValueError) as error:
            raise EmbeddingApiError("OpenAI could not be reached.") from error
        try:
            # the reference names an index on each vector and promises no order, so sort by it
            items = sorted(response["data"], key=lambda item: item["index"])
            if [item["index"] for item in items] != list(range(len(texts))):
                raise ValueError("not one vector per text")
            return [unit_length(item["embedding"]) for item in items]
        except (KeyError, TypeError, ValueError) as error:
            raise EmbeddingApiError("OpenAI returned an invalid embedding.") from error

    def _post_json_sync(self, url: str, payload: dict) -> dict:
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "village-sqwhere-api",
                "Authorization": f"Bearer {self.api_key or ''}",
            },
            method="POST",
        )
        with urlopen(request, timeout=self.timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("OpenAI response is not an object")
        return result


def unit_length(values: list[float]) -> list[float]:
    """Scaled to length 1, so cosine similarity does not depend on how the model scaled it."""
    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError("wrong number of dimensions")
    length = math.sqrt(sum(value * value for value in values))
    if not math.isfinite(length) or length == 0:
        raise ValueError("vector has no length")
    return [value / length for value in values]
