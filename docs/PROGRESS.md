# Progress

Read this first, every session. Update "Current state" and "What's next" in place when you
finish meaningful work. Keep the whole file under 60 lines: history belongs in
`CHANGELOG.md` and `docs/decisions/`, not here.

## Current state (2026-11-11)

- Monorepo in place: `apps/web` (Next.js 16, a placeholder home page and one Vitest test),
  `apps/api` (FastAPI v1 auth, profiles, roles and verification endpoints), `infra/`
  (Postgres 17 with pgvector in Docker).
- Team rules for people and agents are in `AGENTS.md`. CI runs on every pull request:
  title rule, dash check, web, api and secret scan.
- API verification endpoints now support GitHub evidence, applicant polling and abandonment,
  plus role-eligible peer review decisions and persisted AI phase tracking.
- The codebase analysis boundary now accepts bounded GitHub repository snapshots through a
  provider-neutral analyzer interface.
- A Groq codebase analyzer now validates configurable structured JSON output without coupling
  the verification endpoint to a provider.
- A worker boundary now claims pending codebase analysis sessions with row locking and advances
  completed sessions to the technical defence phase.
- Analysis failures now record a safe error, return to `pending`, and retry up to the configured
  limit. Gemini is available as a fallback analyzer after Groq errors.
- Applicants can now open an authenticated WebSocket interview, persist text turns, buffer audio,
  and move a completed interview into `report_generation`.
- Configured environments can now use Groq Whisper transcription, Prompt Guard inspection, and a
  Groq interview question agent, with safe defaults when provider settings are absent.
- Completed interviews can now produce a structured Groq reviewer report and move to
  `awaiting_review` without allowing the AI to make the final decision.
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.
- GitHub does not enforce the rules on `main` yet (see
  `docs/decisions/2026-11-04-team-workflow-and-ci.md`). Until it does, the rules hold by
  team agreement.

## What's next

1. Add the production worker loop, final-report Gemini fallback, and peer-review report display.
2. Build the core flow from PRD v2.2: sign in, share an idea, AI matching, the idea's
   owner approving the team, and the Virtual Collaboration Hub with all four phases. The
   PRD is not in this repository yet; ask Tanny for it before starting.
3. Add English and French switching to the web app, before the first real screens.
4. Add a deploy job to CI once the team has Systalink platform access.
5. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
