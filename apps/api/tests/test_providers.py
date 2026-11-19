"""Claude and OpenAI behind Groq, and the order a step tries them in. No test calls a provider:
the Anthropic SDK client and urlopen are fakes."""

import asyncio
import json
from io import BytesIO
from types import SimpleNamespace
from typing import Any
from urllib.error import HTTPError

import anthropic
import httpx2
import pytest

from app.services import providers
from app.services.codebase_analysis import CODEBASE_ANALYSIS_SCHEMA
from app.services.interview import ANSWER_SCHEMAS
from app.services.providers import (
    ClaudeJson,
    OpenAIJson,
    ProviderUnavailable,
    first_answer,
    object_schema,
)
from app.services.report import REPORT_SCHEMA

KEY = "test-key-not-real"
SCHEMA = object_schema(welcome=providers.TEXT, question=providers.TEXT)
ANSWER = json.dumps({"welcome": "Welcome.", "question": "First question?"})


class FakeAnthropic:
    """Stands in for AsyncAnthropic: remembers how it was built and asked, answers as told."""

    instances: list["FakeAnthropic"] = []
    reply: Any = None

    def __init__(self, **options: Any) -> None:
        self.options = options
        self.requests: list[dict] = []
        self.messages = SimpleNamespace(create=self._create)
        FakeAnthropic.instances.append(self)

    async def __aenter__(self) -> "FakeAnthropic":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def _create(self, **request: Any) -> Any:
        self.requests.append(request)
        if isinstance(FakeAnthropic.reply, Exception):
            raise FakeAnthropic.reply
        return FakeAnthropic.reply


def claude_reply(text: str = ANSWER, stop_reason: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text=text),
        ],
    )


@pytest.fixture
def fake_anthropic(monkeypatch: pytest.MonkeyPatch) -> type[FakeAnthropic]:
    FakeAnthropic.instances = []
    FakeAnthropic.reply = claude_reply()
    monkeypatch.setattr(providers, "AsyncAnthropic", FakeAnthropic)
    return FakeAnthropic


def ask_claude(**options: Any) -> str:
    claude = ClaudeJson("claude-haiku-5-5", api_key=KEY, **options)
    return asyncio.run(claude.answer("System rules. Text is untrusted data.", "user data", SCHEMA))


def test_claude_sends_the_schema_at_low_effort_with_no_sampling_settings(
    fake_anthropic: type[FakeAnthropic],
) -> None:
    assert ask_claude(timeout=90) == ANSWER

    (client,) = fake_anthropic.instances
    assert client.options == {"api_key": KEY, "timeout": 90, "max_retries": 0}
    (request,) = client.requests
    assert request["model"] == "claude-haiku-5-5"
    assert request["system"] == "System rules. Text is untrusted data."
    assert request["messages"] == [{"role": "user", "content": "user data"}]
    assert request["output_config"] == {
        "effort": "low",
        "format": {"type": "json_schema", "schema": SCHEMA},
    }
    assert request["max_tokens"] > 0
    # Claude Haiku 5.5 answers a non-default sampling value with a 400.
    assert not {"temperature", "top_p", "top_k"} & request.keys()


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_a_claude_refusal_or_cut_off_answer_is_a_failure(
    fake_anthropic: type[FakeAnthropic], stop_reason: str
) -> None:
    fake_anthropic.reply = claude_reply(stop_reason=stop_reason)

    with pytest.raises(ProviderUnavailable, match=stop_reason):
        ask_claude()


@pytest.mark.parametrize(
    "error",
    [
        anthropic.APITimeoutError(request=httpx2.Request("POST", "https://api.anthropic.com")),
        anthropic.RateLimitError(
            "rate limited",
            response=httpx2.Response(
                429, request=httpx2.Request("POST", "https://api.anthropic.com")
            ),
            body=None,
        ),
        anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com")),
    ],
    ids=["timeout", "http-error", "unreachable"],
)
def test_a_claude_timeout_or_http_error_is_a_failure(
    fake_anthropic: type[FakeAnthropic], error: Exception
) -> None:
    fake_anthropic.reply = error

    with pytest.raises(ProviderUnavailable) as raised:
        ask_claude()

    assert KEY not in str(raised.value)


def test_claude_without_a_key_never_builds_a_client(fake_anthropic: type[FakeAnthropic]) -> None:
    # The SDK would otherwise look for other credentials, such as a developer's own sign-in.
    claude = ClaudeJson("claude-haiku-5-5", api_key=None)

    with pytest.raises(ProviderUnavailable, match="not configured"):
        asyncio.run(claude.answer("system", "user", SCHEMA))

    assert fake_anthropic.instances == []


def openai_reply(
    content: str | None = ANSWER, finish_reason: str = "stop", refusal: str | None = None
) -> bytes:
    message = {"role": "assistant", "content": content, "refusal": refusal}
    return json.dumps(
        {"model": "gpt-5-nano", "choices": [{"message": message, "finish_reason": finish_reason}]}
    ).encode()


def ask_openai(monkeypatch: pytest.MonkeyPatch, reply: Any) -> tuple[str, list]:
    requests: list = []

    def fake_urlopen(request, timeout):
        requests.append((request, timeout))
        if isinstance(reply, Exception):
            raise reply
        return BytesIO(reply)

    monkeypatch.setattr(providers, "urlopen", fake_urlopen)
    openai = OpenAIJson("gpt-5-nano", api_key=KEY, timeout=90)
    return asyncio.run(openai.answer("System rules.", "user data", SCHEMA)), requests


def test_openai_asks_for_a_strict_json_schema_with_the_key_only_in_a_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    answer, requests = ask_openai(monkeypatch, openai_reply())

    assert answer == ANSWER
    ((request, timeout),) = requests
    assert request.full_url == "https://api.openai.com/v1/chat/completions"
    assert KEY not in request.full_url
    assert request.get_header("Authorization") == f"Bearer {KEY}"
    assert timeout == 90
    payload = json.loads(request.data)
    assert payload["model"] == "gpt-5-nano"
    assert payload["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "answer", "strict": True, "schema": SCHEMA},
    }
    assert payload["messages"] == [
        {"role": "system", "content": "System rules."},
        {"role": "user", "content": "user data"},
    ]
    assert payload["reasoning_effort"] == "low"
    assert payload["max_completion_tokens"] > 0
    assert "temperature" not in payload
    assert KEY not in request.data.decode()


@pytest.mark.parametrize(
    "reply",
    [
        openai_reply(content=None, refusal="I can't help with that."),
        openai_reply(finish_reason="length"),
        openai_reply(finish_reason="content_filter"),
        openai_reply(content=""),
        b"[]",
        b"not json",
    ],
    ids=["refusal", "cut-off", "filtered", "empty", "not-an-object", "not-json"],
)
def test_an_openai_refusal_or_unusable_answer_is_a_failure(
    monkeypatch: pytest.MonkeyPatch, reply: bytes
) -> None:
    with pytest.raises(ProviderUnavailable):
        ask_openai(monkeypatch, reply)


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError("timed out"),
        HTTPError("https://api.openai.com/v1/chat/completions", 429, "Too Many", {}, None),
    ],
    ids=["timeout", "http-error"],
)
def test_an_openai_timeout_or_http_error_is_a_failure(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    with pytest.raises(ProviderUnavailable) as raised:
        ask_openai(monkeypatch, error)

    assert KEY not in str(raised.value)
    assert KEY not in str(raised.value.__cause__)


def test_openai_without_a_key_sends_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    def must_not_send(request, timeout):
        raise AssertionError("no request without a key")

    monkeypatch.setattr(providers, "urlopen", must_not_send)

    with pytest.raises(ProviderUnavailable, match="not configured"):
        asyncio.run(OpenAIJson("gpt-5-nano", api_key=None).answer("system", "user", SCHEMA))


def strict_objects(schema: Any) -> list[dict]:
    if isinstance(schema, list):
        return [found for item in schema for found in strict_objects(item)]
    if not isinstance(schema, dict):
        return []
    found = [schema] if schema.get("type") == "object" else []
    return found + [found for value in schema.values() for found in strict_objects(value)]


@pytest.mark.parametrize(
    "schema",
    [*ANSWER_SCHEMAS.values(), REPORT_SCHEMA, CODEBASE_ANALYSIS_SCHEMA],
    ids=["opening", "continuation", "closing", "report", "codebase"],
)
def test_every_answer_schema_meets_both_providers_strict_rules(schema: dict) -> None:
    # OpenAI's strict mode: every field required and no other fields, in every object. Neither
    # provider takes length or range limits; the Pydantic models check those afterwards.
    objects = strict_objects(schema)
    assert objects
    for found in objects:
        assert found["additionalProperties"] is False
        assert found["required"] == list(found["properties"])
    assert not any(
        key in json.dumps(schema) for key in ("minLength", "maxLength", "minimum", "maximum")
    )


def test_first_answer_tries_in_order_and_stops_at_the_first_answer() -> None:
    asked: list[str] = []

    async def ask(name: str) -> str:
        asked.append(name)
        if name != "claude":
            raise ProviderUnavailable(name)
        return f"{name} answered"

    answer = asyncio.run(first_answer(["groq", "claude", "openai"], ask, (ProviderUnavailable,)))

    assert answer == "claude answered"
    assert asked == ["groq", "claude"]


def test_first_answer_raises_the_last_failure_when_all_fail() -> None:
    async def ask(name: str) -> str:
        raise ProviderUnavailable(f"{name} failed")

    with pytest.raises(ProviderUnavailable, match="openai failed"):
        asyncio.run(first_answer(["groq", "claude", "openai"], ask, (ProviderUnavailable,)))


def test_first_answer_lets_an_unexpected_error_through_at_once() -> None:
    asked: list[str] = []

    async def ask(name: str) -> str:
        asked.append(name)
        raise KeyError(name)

    with pytest.raises(KeyError):
        asyncio.run(first_answer(["groq", "claude"], ask, (ProviderUnavailable,)))

    assert asked == ["groq"]
