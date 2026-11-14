import asyncio
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import GEMINI_API_KEY, GEMINI_EVALUATION_MODEL
from app.services.report import VerificationReport, build_report_prompt


class GeminiReportEvaluator:
    def __init__(
        self,
        api_key: str | None = GEMINI_API_KEY,
        model: str | None = GEMINI_EVALUATION_MODEL,
        timeout: float = 90,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def evaluate(
        self, role_slug: str, codebase_result: dict, interview_turns: list[dict], language: str
    ) -> VerificationReport:
        if not self.api_key or not self.model:
            raise RuntimeError("Gemini evaluation is not configured.")
        system, user = build_report_prompt(role_slug, codebase_result, interview_turns, language)
        response = await self._post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self.model, safe='')}:generateContent",
            {
                "contents": [{"parts": [{"text": f"{system}\n\n{user}"}]}],
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
            return VerificationReport.model_validate(json.loads(content))
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("Gemini returned an invalid verification report.") from error

    async def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(self._post_json_sync, url, payload)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("Gemini evaluation failed.") from error

    def _post_json_sync(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            url,
            data=json.dumps(payload).encode(),
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
            raise ValueError("Gemini evaluation response is not an object")
        return result
