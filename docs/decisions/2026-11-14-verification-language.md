# The AI interview and report follow a stored language

## Context

The site works in English and French, but nothing told the AI interviewer or the report which
language to use. The prompts and the built-in fallback interviewer were English. The report is
written later by a worker, after the applicant has left the interview, so the language has to be
kept somewhere the worker can read it.

## Decision

The language, `en` or `fr`, is stored on the verification attempt when it starts and never
changes (`verification_sessions.language`, default `en`). The interview and the report both follow
it: the report is written in the applicant's language. Tanny decided this on 14 November 2026.

- `POST /v1/me/verifications/{role_slug}` takes an optional `language`. Anything but `en` or `fr`
  is a `422`.
- The applicant's attempt and the reviewer's queue and case carry `language`.
- The AI agents add one instruction to their system prompt, taken from a fixed list in our code
  and keyed by the stored value. Nothing the applicant types can reach it. The built-in
  interviewer used when no AI answers has French text for the same turns.
- The report instruction asks for the summary, findings and concerns in that language. JSON keys,
  `security_flags` codes, `model` and numbers stay as they are.
- The repositories check, the first phase, follows the same language, so its summary, strengths,
  concerns and criterion rationales are written in it (changed the same day, in a second pull
  request).

## Options we considered

- **Write the report in both languages.** A reviewer would always find a language they read, but
  every report would cost about twice as much AI work and the response would carry two copies.
- **Always write the report in English.** Simple and the same for every reviewer, but an
  applicant who was interviewed in French would get a report in a language they did not use.

## Consequences

- The interview and the report always match, and nothing needs to be guessed from the answers.
- A reviewer who reads only English may get a French report. The review case will show the
  report's language ("Report language: French") so they know before they open it. That is a later
  web pull request; this one only exposes the field.
- Attempts made before the script `015-verification-language.sql` are `en`, the language they
  ran in.
- A third language means a new value in the database check, in the request schema and in the
  fixed list of instructions, plus the built-in interviewer's text.
