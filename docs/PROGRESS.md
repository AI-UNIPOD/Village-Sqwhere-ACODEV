# Progress

Read this first. Update "Current state" and "What's next" in place after meaningful work.
Keep the file under 60 lines: history goes in `CHANGELOG.md` and `docs/decisions/`.

## Current state (2026-11-13)

- Monorepo: `apps/web` (Next.js 16, landing page in English and French), `apps/api` (FastAPI
  v1 auth, profiles, roles, verification), `infra/` (Postgres 17 with pgvector in Docker).
- Team rules are in `AGENTS.md`. GitHub Actions is off (billing limit), so a merge agent on
  Tanny's PC runs the CI checks and merges green pull requests (not in this repository).
- The API has GitHub sign-in with PKCE, profiles, roles, technologies, feed topics and
  verification (GitHub analysis, a five-question AI interview over a WebSocket, a report) with
  peer review by developers verified in that role, Groq and Gemini fallbacks and a separate
  worker. Guide: `docs/backend.md`; routes: `docs/architecture.md`.
- Hubs so far: `GET /v1/agreements/current` and `POST /v1/hubs`; ideas and posts have models
  but no routes. Schema: `infra/db/init/` (new scripts need a rebuilt local database, see
  `infra/README.md`); `004` is a TEST agreement. API tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero and background motion included, checked
  by tests and measurements. The hero leads to sign-in; the demo and tour start say "Coming soon".
- GitHub sign-in works end to end (real account, own language); `app/session/` refreshes and
  signs out (`docs/decisions/2026-11-11-web-session-in-local-storage.md`).
- Below the hero, sections reveal once, the header marks the section being read, "coming soon"
  presses are announced, phones get section links, and the scrolled-away header is pinned as a
  pill (`docs/decisions/2026-11-11-landing-section-interactions.md`, `2026-11-13-landing-pill-header.md`).
- Onboarding after sign-in is at `/en/onboarding` and `/fr/onboarding`, for signed-in people
  only, greeting them by their name from `GET /v1/me`. Answers stay in sessionStorage for the tab
  and never reach the API. API gaps: `docs/decisions/2026-11-11-onboarding-page.md`.
- Unknown addresses get a 404 in their language; landing and sign-in have an error page. French
  copy puts a narrow no-break space before ? ! : ; (`docs/design-system/voice-and-tone.md`).
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.

## What's next

1. Fix the GitHub Actions billing limit, turn `ci` back on, then revisit the merge agent.
2. Build the remaining hub endpoints on the new models, then the rest of the core flow from PRD v2.2:
   share an idea, AI matching, the owner approving the team and the four hub phases. The PRD
   is not in this repository yet; ask Tanny for it before starting.
3. Add peer-review report display, production deployment configuration and, once the team has
   Systalink platform access, a deploy job in CI.
4. Save onboarding answers via the API once its gaps 1, 2, 3 and 6 close.
5. Replace the TEST agreement with the real text, as version 2 in a new script, before launch.
6. Web follow-ups: one header for the app screens, shared parts out of `app/landing/`, a wider
   hero text column on phones, a server-rendered 404 (production sends an empty shell), watching
   the landing motion by eye, and a French-speaking teammate's check of the copy.
7. Before launch, move the session out of localStorage and sign-in state out of API memory
   (a `refresh_tokens` table, per the sign-in record); have the API carry the language via GitHub.
8. Turn on GitHub protection for `main` (an org admin and a paid plan, or a public repository);
   until then the merge agent enforces green checks (`docs/decisions/2026-11-13-merge-agent.md`).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
