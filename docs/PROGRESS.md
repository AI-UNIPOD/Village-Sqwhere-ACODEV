# Progress

Read this first. Update "Current state" and "What's next" in place after meaningful work.
Keep the file under 60 lines: history goes in `CHANGELOG.md` and `docs/decisions/`.

## Current state (2026-11-12)

- Monorepo: `apps/web` (Next.js 16, landing page in English and French), `apps/api` (FastAPI
  v1 auth, profiles, roles, verification), `infra/` (Postgres 17 with pgvector in Docker).
- Team rules are in `AGENTS.md`. The `ci` workflow is switched off since an account billing
  limit blocked GitHub Actions, so everything after #33 (up to #55) landed on local checks.
- The API has GitHub sign-in with PKCE, profiles, roles, technologies, feed topics and
  verification (GitHub analysis, a five-question AI interview over a WebSocket, a report) with
  peer review by developers verified in that role, Groq and Gemini fallbacks and a separate
  worker. Guide: `docs/backend.md`; routes: `docs/architecture.md`.
- Models and schemas for ideas, hubs, agreements and members exist, but no route uses them or
  the post tables yet. Schema: `infra/db/init/` (new scripts need a rebuilt local database,
  see `infra/README.md`); `004` is a TEST agreement. API tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero and background motion included, checked
  by tests and measurements. The hero leads to sign-in; the demo and tour start say "Coming soon".
- `/{lang}/sign-in` starts GitHub sign-in; `/{lang}/auth/callback` finishes it, keeps the
  session in localStorage (`docs/decisions/2026-11-11-web-session-in-local-storage.md`).
- Below the hero, sections reveal once, the header marks the section being read, tour stops
  show their share of three minutes, "coming soon" presses are announced, and phones get
  section links (`docs/decisions/2026-11-11-landing-section-interactions.md`).
- Onboarding after first sign-in is at `/en/onboarding` and `/fr/onboarding`: a welcome, then
  one question per screen, then a developer card. Answers stay in sessionStorage for the tab and
  never reach the API. API gaps: `docs/decisions/2026-11-11-onboarding-page.md`.
- Unknown addresses get a 404 in their language; landing and sign-in have an error page. French
  copy puts a narrow no-break space before ? ! : ; (`docs/design-system/voice-and-tone.md`).
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.

## What's next

1. Fix the GitHub Actions billing limit, turn the `ci` workflow back on and re-run CI on `main`.
2. Build the six hub endpoints on the new models, then the rest of the core flow from PRD v2.2:
   share an idea, AI matching, the owner approving the team and the four hub phases. The PRD
   is not in this repository yet; ask Tanny for it before starting.
3. Add peer-review report display, production deployment configuration and, once the team has
   Systalink platform access, a deploy job in CI.
4. Connect the onboarding page to the API once the gaps in its decision record are closed.
5. Replace the TEST agreement with the real text, as version 2 in a new script, before launch.
6. Web follow-ups: one header for the app screens, shared parts out of `app/landing/`, a wider
   hero text column on phones, a server-rendered 404 (production sends an empty shell), watching
   the landing motion by eye, and a French-speaking teammate's check of the copy.
7. Before launch, move the session out of localStorage and sign-in state out of API memory
   (a `refresh_tokens` table, per the sign-in record); have the API carry the language via GitHub.
8. Turn on GitHub protection for `main` (an org admin and a paid plan, or a public repository);
   until then rules hold by agreement (`docs/decisions/2026-11-04-team-workflow-and-ci.md`).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
