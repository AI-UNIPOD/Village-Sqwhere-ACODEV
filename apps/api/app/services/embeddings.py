"""What leaves the server to be embedded, and the client that asks Gemini to embed it.

Only public text is sent: an idea's title and summary, and a developer's verified roles,
technologies, sectors and bio. Why, and what the provider's documentation says:
docs/decisions/2026-11-15-embeddings-on-gemini.md
"""

import asyncio
import hashlib
import json
import math
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import GEMINI_API_KEY
from app.models import Idea, User
from app.models.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from app.services.gemini import GeminiApiError, GeminiConfigurationError

BATCH_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:batchEmbedContents"
)
# gemini-embedding-2 has no task type field: the task goes in front of the text instead.
TASK_PREFIX = "task: sentence similarity | query: "


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


class GeminiEmbedder:
    def __init__(self, api_key: str | None = GEMINI_API_KEY, timeout: float = 30) -> None:
        self.api_key = api_key
        self.timeout = timeout

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One unit-length vector of EMBEDDING_DIMENSIONS numbers per text, in the same order."""
        if not self.api_key:
            raise GeminiConfigurationError("A Gemini API key is required.")
        if not texts:
            return []
        payload = {
            "requests": [
                {
                    "model": f"models/{EMBEDDING_MODEL}",
                    "content": {"parts": [{"text": TASK_PREFIX + text}]},
                    "embedContentConfig": {"outputDimensionality": EMBEDDING_DIMENSIONS},
                }
                for text in texts
            ]
        }
        try:
            response = await asyncio.to_thread(self._post_json_sync, BATCH_EMBED_URL, payload)
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            raise GeminiApiError("Gemini could not be reached.") from error
        try:
            vectors = [unit_length(item["values"]) for item in response["embeddings"]]
        except (KeyError, TypeError, ValueError) as error:
            raise GeminiApiError("Gemini returned an invalid embedding.") from error
        if len(vectors) != len(texts):
            raise GeminiApiError("Gemini returned an invalid embedding.")
        return vectors

    def _post_json_sync(self, url: str, payload: dict) -> dict:
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "village-sqwhere-api",
                "x-goog-api-key": self.api_key or "",
            },
            method="POST",
        )
        with urlopen(request, timeout=self.timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("Gemini response is not an object")
        return result


def unit_length(values: list[float]) -> list[float]:
    """Scaled to length 1, so cosine similarity does not depend on how the model scaled it."""
    if len(values) != EMBEDDING_DIMENSIONS:
        raise ValueError("wrong number of dimensions")
    length = math.sqrt(sum(value * value for value in values))
    if not math.isfinite(length) or length == 0:
        raise ValueError("vector has no length")
    return [value / length for value in values]
