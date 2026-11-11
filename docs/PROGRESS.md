# Progress

Read this first, every session. Update "Current state" and "What's next" in place when you
finish meaningful work. Keep the whole file under 60 lines: history belongs in
`CHANGELOG.md` and `docs/decisions/`, not here.

## Current state (2026-11-11)

- Monorepo in place: `apps/web` (Next.js 16, the landing page in English and French),
  `apps/api` (FastAPI v1 auth, profiles, roles and verification endpoints), `infra/`
  (Postgres 17 with pgvector in Docker).
- Team rules for people and agents are in `AGENTS.md`. CI runs on every pull request:
  title rule, dash check, web, api and secret scan.
- The API (guide: `docs/backend.md`) has GitHub sign-in with PKCE, profiles, roles,
  technologies, feed topics, and verification (GitHub evidence, polling, abandoning) with
  peer review by developers verified in that role. The full schema is in
  `infra/db/init/002-schema.sql`; nothing uses the idea, hub or post tables yet.
- Verification now includes bounded GitHub analysis, Groq and Gemini fallbacks, a streamed
  technical defence with a five-turn limit, report generation, retries and a polling worker.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`). The web
  app does not call the API yet.
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero animation included: walking country
  names, the logo fading in, the loop, pause and the pointer twins, plus background words
  scrolling right to left in an endless loop (held on hover). The motion was checked by
  tests, a line-by-line port of B3v and measurements in the app, not by eye. "Try the demo",
  "Start the tour" and "Sign in" show "Coming soon". No other product screens exist yet.
- Below the hero, steps and tour stops rise into view once, the header marks the section
  being read, tour stops show their share of the three minutes, "coming soon" presses are
  announced, and phones get a row of section links (see
  `docs/decisions/2026-11-11-landing-section-interactions.md`).
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.
- GitHub does not enforce the rules on `main` yet (see
  `docs/decisions/2026-11-04-team-workflow-and-ci.md`). Until it does, the rules hold by
  team agreement.

## What's next

1. Add peer-review report display and production deployment configuration.
2. Build the rest of the core flow from PRD v2.2: share an idea, AI matching, the idea's
   owner approving the team, and the Virtual Collaboration Hub with all four phases. The
   PRD is not in this repository yet; ask Tanny for it before starting.
3. Review and merge the landing page: watch the motion in a browser, including with reduced
   motion, and have a
   French-speaking teammate check the French. New pages go under `app/[lang]` with English
   and French text (see `docs/decisions/2026-11-10-landing-page-language-and-theme.md`).
4. Build the sign-in screens on the API (`docs/backend.md`), then point the "Coming soon"
   buttons at real screens. Before launch, move sign-in state out of API memory (the
   decision record suggests a `refresh_tokens` table).
5. Add a deploy job to CI once the team has Systalink platform access.
6. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
