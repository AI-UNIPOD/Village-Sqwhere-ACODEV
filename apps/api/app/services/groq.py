import asyncio
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import GROQ_API_KEY, GROQ_CODEBASE_MODEL
from app.services.codebase_analysis import build_codebase_analysis_prompt
from app.services.verification import (
    CodebaseAnalysisResult,
    RepositorySnapshot,
)


class GroqConfigurationError(Exception):
    pass


class GroqApiError(Exception):
    pass


class GroqCodebaseAnalyzer:
    def __init__(
        self,
        api_key: str | None = GROQ_API_KEY,
        model: str | None = GROQ_CODEBASE_MODEL,
        timeout: float = 60,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def analyze(
        self, repositories: list[RepositorySnapshot], role_slug: str
    ) -> CodebaseAnalysisResult:
        if not self.api_key or not self.model:
            raise GroqConfigurationError("Groq API key and codebase model are required.")

        prompt = build_codebase_analysis_prompt(role_slug, repositories)
        response = await self._post_json(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                "model": self.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": prompt.system},
                    {"role": "user", "content": prompt.user},
                ],
            },
        )
        try:
            content = response["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("model content is not text")
            return CodebaseAnalysisResult.model_validate(json.loads(self._strip_fence(content)))
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise GroqApiError("Groq returned an invalid codebase analysis.") from error

    async def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(self._post_json_sync, url, payload)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            raise GroqApiError("Groq could not be reached.") from error

    def _post_json_sync(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "village-sqwhere-api",
            },
            method="POST",
        )
        with urlopen(request, timeout=self.timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("Groq response is not an object")
        return result

    @staticmethod
    def _strip_fence(content: str) -> str:
        stripped = content.strip()
        if stripped.startswith("```") and stripped.endswith("```"):
            return stripped.split("\n", 1)[1].rsplit("\n", 1)[0]
        return stripped
