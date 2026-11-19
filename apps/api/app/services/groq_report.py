import asyncio
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import GROQ_API_KEY, GROQ_EVALUATION_MODEL
from app.services.report import VerificationReport, build_report_prompt


class GroqReportEvaluator:
    def __init__(
        self,
        api_key: str | None = GROQ_API_KEY,
        model: str | None = GROQ_EVALUATION_MODEL,
        timeout: float = 90,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def evaluate(
        self, role_slug: str, codebase_result: dict, interview_turns: list[dict], language: str
    ) -> VerificationReport:
        if not self.api_key or not self.model:
            raise RuntimeError("Groq evaluation is not configured.")
        system, user = build_report_prompt(role_slug, codebase_result, interview_turns, language)
        response = await asyncio.to_thread(self._post_json_sync, system, user)
        try:
            content = response["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("model content is not text")
            return VerificationReport.model_validate(json.loads(content))
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("Groq returned an invalid verification report.") from error

    def _post_json_sync(self, system: str, user: str) -> dict[str, Any]:
        request = Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(
                {
                    "model": self.model,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                }
            ).encode(),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "village-sqwhere-api",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                result = json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise RuntimeError("Groq evaluation failed.") from error
        if not isinstance(result, dict):
            # a RuntimeError, like every other failure here, so the report moves on to Claude
            raise RuntimeError("Groq evaluation response is not an object")
        return result
