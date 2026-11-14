import asyncio
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import GEMINI_API_KEY, GEMINI_CODEBASE_MODEL
from app.services.codebase_analysis import build_codebase_analysis_prompt
from app.services.verification import CodebaseAnalysisResult, RepositorySnapshot


class GeminiConfigurationError(Exception):
    pass


class GeminiApiError(Exception):
    pass


class GeminiCodebaseAnalyzer:
    def __init__(
        self,
        api_key: str | None = GEMINI_API_KEY,
        model: str | None = GEMINI_CODEBASE_MODEL,
        timeout: float = 60,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def analyze(
        self, repositories: list[RepositorySnapshot], role_slug: str, language: str
    ) -> CodebaseAnalysisResult:
        if not self.api_key or not self.model:
            raise GeminiConfigurationError("Gemini API key and codebase model are required.")

        prompt = build_codebase_analysis_prompt(role_slug, repositories, language)
        response = await self._post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self.model, safe='')}:generateContent",
            {
                "contents": [{"parts": [{"text": f"{prompt.system}\n\n{prompt.user}"}]}],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                },
            },
        )
        try:
            content = response["candidates"][0]["content"]["parts"][0]["text"]
            if not isinstance(content, str):
                raise TypeError("model content is not text")
            return CodebaseAnalysisResult.model_validate(json.loads(content))
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise GeminiApiError("Gemini returned an invalid codebase analysis.") from error

    async def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(self._post_json_sync, url, payload)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            raise GeminiApiError("Gemini could not be reached.") from error

    def _post_json_sync(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
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
