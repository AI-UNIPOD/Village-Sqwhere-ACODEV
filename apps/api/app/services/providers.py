"""Claude and OpenAI, the fallbacks behind Groq in the three verification steps, and the one
way the steps try their providers in order.

docs/decisions/2026-11-19-interviews-without-gemini.md
"""

import asyncio
import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from anthropic import AnthropicError, AsyncAnthropic

from app.config import ANTHROPIC_API_KEY, OPENAI_API_KEY

# Room for the model's thinking plus a short JSON answer, as the SDKs' non-streaming default.
MAX_OUTPUT_TOKENS = 16_000


class ProviderUnavailable(RuntimeError):
    """Not configured, not reachable, refused, cut short, or answered something that does not
    match the schema. The step moves on to its next provider."""


class JsonProvider(Protocol):
    name: str

    async def answer(self, system: str, user: str, schema: dict[str, Any]) -> str: ...


async def first_answer[P, R](
    providers: Sequence[P],
    ask: Callable[[P], Awaitable[R]],
    failures: tuple[type[Exception], ...],
) -> R:
    """The first provider's answer that does not fail. When all fail, the last failure is raised,
    so callers see the error type they already handle."""
    for provider in providers[:-1]:
        try:
            return await ask(provider)
        except failures:
            continue
    return await ask(providers[-1])


TEXT: dict[str, Any] = {"type": "string"}
NUMBER: dict[str, Any] = {"type": "number"}


def list_of(item: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": item}


def object_schema(**properties: dict[str, Any]) -> dict[str, Any]:
    # Both providers' structured output needs every field required and no extra fields. Lengths
    # and ranges are not sent (neither enforces them); the Pydantic model checks them after.
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


TEXT_LIST = list_of(TEXT)


class ClaudeJson:
    name = "Claude"

    def __init__(
        self, model: str, api_key: str | None = ANTHROPIC_API_KEY, timeout: float = 60
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    async def answer(self, system: str, user: str, schema: dict[str, Any]) -> str:
        # Checked here, before the client exists: without a key the SDK would look for other
        # credentials on the machine, such as a developer's own sign-in.
        if not self.api_key or not self.model:
            raise ProviderUnavailable("Claude is not configured.")
        try:
            # No retries: the next provider in the step is the retry.
            async with AsyncAnthropic(
                api_key=self.api_key, timeout=self.timeout, max_retries=0
            ) as client:
                response = await client.messages.create(
                    model=self.model,
                    max_tokens=MAX_OUTPUT_TOKENS,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                    output_config={
                        "effort": "low",
                        "format": {"type": "json_schema", "schema": schema},
                    },
                )
        except AnthropicError as error:
            raise ProviderUnavailable("Claude could not be reached.") from error
        # A refusal or a cut-off answer may not match the schema, so it never counts.
        if response.stop_reason != "end_turn":
            raise ProviderUnavailable(f"Claude stopped early ({response.stop_reason}).")
        text = "".join(block.text for block in response.content if block.type == "text")
        if not text.strip():
            raise ProviderUnavailable("Claude returned no answer.")
        return text


class OpenAIJson:
    name = "OpenAI"

    def __init__(
        self, model: str, api_key: str | None = OPENAI_API_KEY, timeout: float = 60
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    async def answer(self, system: str, user: str, schema: dict[str, Any]) -> str:
        if not self.api_key or not self.model:
            raise ProviderUnavailable("OpenAI is not configured.")
        try:
            response = await asyncio.to_thread(self._post_sync, system, user, schema)
            choice = response["choices"][0]
            message = choice["message"]
            if message.get("refusal"):
                raise ValueError("the model refused")
            if choice["finish_reason"] != "stop":
                raise ValueError("the answer was cut short or filtered")
            content = message["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("empty model response")
            return content
        except (
            HTTPError,
            URLError,
            TimeoutError,
            KeyError,
            IndexError,
            TypeError,
            ValueError,
        ) as error:
            raise ProviderUnavailable("OpenAI returned no usable answer.") from error

    def _post_sync(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(
                {
                    "model": self.model,
                    "reasoning_effort": "low",
                    "max_completion_tokens": MAX_OUTPUT_TOKENS,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {"name": "answer", "strict": True, "schema": schema},
                    },
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
        with urlopen(request, timeout=self.timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("OpenAI response is not an object")
        return result
