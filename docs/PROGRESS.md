# Progress

Read this first. Update "Current state" and "What's next" in place after meaningful work.
Keep the file under 60 lines: history goes in `CHANGELOG.md` and `docs/decisions/`.

## Current state (2026-11-11)

- Monorepo: `apps/web` (Next.js 16, landing page in English and French), `apps/api` (FastAPI
  v1 auth, profiles, roles, verification), `infra/` (Postgres 17 with pgvector in Docker).
- Team rules are in `AGENTS.md`. CI has not run since an account billing limit blocked GitHub
  Actions, so #29, #35, #34 and #20 landed on local checks (last green run on `main`: #33).
- The API has GitHub sign-in with PKCE, profiles, roles, technologies, feed topics and
  verification (GitHub analysis, a five-question AI interview over a WebSocket, a report) with
  peer review by developers verified in that role, Groq and Gemini fallbacks and a separate
  worker. Guide: `docs/backend.md`; routes: `docs/architecture.md`.
- The API has Developer Exchange posts: create, read, edit, delete, a filtered list
  (`GET /v1/posts`) and the feed (`GET /v1/feed`). Hub, idea, and agreement models exist.
  Schema: `infra/db/init/`. API tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero and background motion included, checked
  by tests and measurements. "Try the demo" and "Start the tour" show "Coming soon".
- `/{lang}/sign-in` starts GitHub sign-in; `/{lang}/auth/callback` finishes it, keeps the
  session in localStorage (`docs/decisions/2026-11-11-web-session-in-local-storage.md`).
- Below the hero, sections reveal once, the header marks the section being read, tour stops
  show their share of three minutes, "coming soon" presses are announced, and phones get
  section links (`docs/decisions/2026-11-11-landing-section-interactions.md`).
- Onboarding after first sign-in is at `/en/onboarding` and `/fr/onboarding`: a welcome, then
  one question per screen, then a developer card. Static demo data, nothing saved, no API calls.
  API gaps: `docs/decisions/2026-11-11-onboarding-page.md`.
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.

## What's next

1. Fix the GitHub Actions limit and re-run CI on `main`.
2. Build the six hub endpoints on the new models, then the rest of the core flow from PRD v2.2:
   share an idea, AI matching, the owner approving the team and the four hub phases. The PRD
   is not in this repository yet; ask Tanny for it before starting.
3. Add peer-review report display, production deployment configuration and, once the team has
   Systalink platform access, a deploy job in CI.
4. Connect the onboarding page to the API once its gaps are closed (see
   `docs/decisions/2026-11-11-onboarding-page.md`).
5. Replace the TEST agreement with the real text, as version 2 in a new script, before launch.
6. Watch the landing page motion in a browser, including with reduced motion, and have a
   French-speaking teammate check the French.
7. Move the session out of localStorage before launch, and sign-in state out of API memory
   (the sign-in decision record suggests a `refresh_tokens` table). Have the API carry the
   language through GitHub.
8. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository). Until then the rules hold by team agreement
   (`docs/decisions/2026-11-04-team-workflow-and-ci.md`).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
