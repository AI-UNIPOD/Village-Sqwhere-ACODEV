# Claude and OpenAI, not Gemini, behind Groq in the verification steps

## Context

A developer proves a role in three AI steps: the repositories check, the interview (text, and
speech turned into text) and the written report. Each step used Groq first and Google's Gemini
as the fallback (`2026-11-10-verification-api.md`). Tanny expects Gemini to go down and wants it
out of these steps, with Groq, Claude and OpenAI, on the cheapest models that work.

## Decision

Tanny decided on 19 November 2026:

- **The order, in all three steps:** Groq, then Claude, then OpenAI. A step fails only when every
  provider that has a key fails. A provider with no key is skipped. The interview keeps its
  built-in questions after all three, so a text interview always goes on.
- **Speech:** Groq's Whisper, then OpenAI. Claude has no speech to text.
- **Models, with defaults in code, so a deployment adds only `ANTHROPIC_API_KEY` and
  `OPENAI_API_KEY`:**

  | Setting | Default |
  |---|---|
  | `ANTHROPIC_CODEBASE_MODEL`, `ANTHROPIC_INTERVIEW_MODEL`, `ANTHROPIC_EVALUATION_MODEL` | `claude-haiku-5-5` |
  | `OPENAI_CODEBASE_MODEL`, `OPENAI_INTERVIEW_MODEL`, `OPENAI_EVALUATION_MODEL` | `gpt-6-luna` |
  | `OPENAI_STT_MODEL` | `gpt-transcribe` |

- **Gemini leaves these steps:** its interview and report files, its three model settings, its
  wiring and its tests. The embeddings still use Gemini on `main`; pull request #255 moves them,
  so `GEMINI_API_KEY` and the two error classes they raise stay until it merges.
- **One answer shape per step, sent to both providers:** a JSON schema in
  `app/services/codebase_analysis.py`, `interview.py` and `report.py`. Every answer is then checked
  with the same Pydantic model as Groq's answer. An answer that does not validate, a refusal, an
  answer cut short, a timeout and an HTTP error all count as that provider failing, so the step
  moves on and nothing unchecked is stored.
- **One way to try providers in order:** `first_answer` in `app/services/providers.py`, used by
  the codebase, interview, speech and report fallbacks.
- **Claude through Anthropic's SDK** (`anthropic`, 2.10.0, added with `uv add`): its async client,
  typed errors and structured output. Each call opens a client with the key from
  `ANTHROPIC_API_KEY`, the step's timeout (60 seconds, 90 for the report) and no retries, since the
  next provider is the retry. Without the key no client is made, because the SDK would otherwise
  look for other credentials on the machine.
- **OpenAI over plain HTTP**, with `urllib` in a thread like the Groq clients. No SDK.

## What each provider's documentation says

Anthropic, read on 19 November 2026:

- "Structured outputs" (`platform.claude.com/docs/en/build-with-claude/structured-outputs`): the
  schema goes in `output_config.format` with `type: "json_schema"`. `claude-haiku-5-5` is in the
  supported models. `additionalProperties` "must be set to `false` for objects", and
  `minLength`, `maxLength`, `minimum` and `maximum` are not supported. "A map, dictionary, or
  record type lists no keys, so the Python and TypeScript SDKs send it as an object with empty
  `properties`" and "Claude can only return `{}` for it": that is why the codebase schema spells
  out `evidence` and `criterion_assessments`, which `CodebaseAnalysisResult` keeps as loose
  objects. On a refusal "the output might not match your schema", and on `max_tokens` "the output
  might be incomplete".
- Anthropic's Python SDK reference and the Claude Haiku 5.5 migration notes: thinking is adaptive
  and on by default, effort defaults to `medium`, and a `temperature`, `top_p` or `top_k` other
  than the default is a 400, as is an assistant prefill. We send `output_config.effort: "low"`
  for these short answers, `max_tokens` 16,000 (room for thinking), no sampling settings, and
  check `stop_reason` is `end_turn`.

OpenAI (`developers.openai.com/api/docs/...`), read on 19 November 2026:

- "Pricing" (`pricing.md`): `gpt-5-nano` is the cheapest text model at $0.05 in and $0.40 out per
  million tokens; `gpt-6-luna` is next at $0.10 and $0.50.
- "GPT-5 nano" (`models/gpt-5-nano.md`): supports `v1/chat/completions` and structured outputs;
  status "Deprecated".
- "Deprecations" (`deprecations.md`): `gpt-5-nano`, notice "Jun 11, 2026", shutdown
  "Dec 11, 2026", replacement "`gpt-6-luna`". `whisper-1`, `gpt-4o-transcribe` and
  `gpt-4o-mini-transcribe` shut down "Feb 26, 2027", replacement "`gpt-live-transcribe` or
  `gpt-transcribe`".
- "Create chat completion" (`reference/resources/chat/subresources/completions/methods/create.md`):
  `POST https://api.openai.com/v1/chat/completions` with `Authorization: Bearer`;
  `response_format: {"type": "json_schema", "json_schema": {name, schema, strict}}` "enables
  Structured Outputs"; `max_completion_tokens` includes reasoning tokens and replaces the
  deprecated `max_tokens`; `reasoning_effort` takes `none`, `minimal`, `low`, `medium`, `high`,
  `xhigh` or `max`; the answer is in `choices[].message.content`, a refusal in
  `choices[].message.refusal`, and `finish_reason` is `stop`, `length`, `content_filter` and
  others. We send no `temperature`, and treat anything but `stop` as a failure.
- "Structured Outputs" (`guides/structured-outputs.md`): "all fields or function parameters must
  be specified as `required`", and "we require developers to set `additionalProperties: false`".
  The supported string keywords are `pattern` and `format`, so lengths are checked by our models.
- "Speech to text" (`guides/speech-to-text.md`): `gpt-transcribe` "is the recommended model for
  transcribing recorded speech", sent to `/v1/audio/transcriptions` as a form with `model` and
  `file`. Input formats are named by extension (`flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`,
  `wav`, `webm`), up to 25 MB, and the answer carries `text`. So the file is named for its real
  type, where Groq's always says `answer.webm`.

## Options we considered

- **Gemini kept as a third fallback.** Not chosen: Tanny expects it to go down and wants it out.
- **`gpt-5-nano` as OpenAI's default.** It is the cheapest ($0.05 in, $0.40 out per million
  tokens) and passed the trial, but OpenAI shuts it down on 11 December 2026, three weeks after
  this decision. `gpt-6-luna`, the replacement OpenAI names, costs $0.10 and $0.50, which is
  still a fraction of a cent per verification, so it is the default.
- **`gpt-4o-mini-transcribe` for speech.** Its estimate, $0.003 a minute, is below
  `gpt-transcribe`'s $0.0045, but it is deprecated and shuts down on 26 February 2027.
  `gpt-transcribe` is the cheapest model that is not deprecated, so it was chosen.
- **OpenAI's SDK.** Not chosen: one JSON request and one form upload fit the small `urllib`
  pattern the Groq clients already use.
- **Anthropic's SDK `messages.parse()` with the Pydantic models.** Its schema would turn the
  codebase result's loose objects into empty ones, and OpenAI needs a plain schema anyway, so both
  share one hand-written schema per answer.
- **SDK retries for Claude.** Not chosen: two retries of a 60-second call would hold an applicant
  for minutes before OpenAI is tried.

## Consequences

- A deployment that sets only the two new keys gets the full chain. With no key at all, the steps
  fail as before and the interview uses its built-in questions.
- The answer guard is still Groq's. Without `GROQ_API_KEY` every answer is flagged
  `guard_not_configured`, as before. Claude and OpenAI get the same instruction that the text is
  untrusted data, and their answers are held to a schema.
- **Checked by hand on 19 November 2026,** with made-up data, one call per step per provider:
  OpenAI's `gpt-6-luna` returned a valid codebase analysis (11.4 s), interview turn (2.3 s) and
  report (5.0 s), as `gpt-5-nano` had before it, and
  `gpt-transcribe` turned a spoken sentence (made with Windows speech synthesis) into the right
  text. Claude answered every call with a 400, "Identity verification is required to continue":
  the Anthropic account needs that check before Claude can be tried for real.
- **Not checked:** Groq, since no Groq key is set on the machine used; Claude's real answers, until
  the account is verified; the chain end to end in a deployment.
- The `model` field of a report or analysis from Claude or OpenAI is the model that answered, set
  by the code. The models name themselves wrongly: in the trial `gpt-6-luna` called itself
  "OpenAI GPT-4.1" once and "unknown" once. Groq's answers still carry the name Groq's model
  writes.
- A Groq report answer that is not a JSON object now counts as Groq failing, so the report moves
  on to Claude. Before, it raised an error the fallback did not catch.
