# Progress

Read this first. Update "Current state" and "What's next" in place after meaningful work.
Keep the file under 60 lines: history goes in `CHANGELOG.md` and `docs/decisions/`.

## Current state (2026-11-11)

- Monorepo: `apps/web` (Next.js 16, landing page in English and French), `apps/api` (FastAPI
  v1 auth, profiles, roles, verification), `infra/` (Postgres 17 with pgvector in Docker).
- Team rules for people and agents are in `AGENTS.md`. CI runs on every pull request:
  title rule, dash check, web, api and secret scan.
- The API has GitHub sign-in with PKCE, profiles, roles, technologies, feed topics, and
  verification (GitHub evidence, polling, abandoning) with peer review by developers
  verified in that role. Guide: `docs/backend.md`. Routes are listed in
  `docs/architecture.md` and tested. Schema: `infra/db/init/` (new scripts need a rebuilt local
  database, see `infra/README.md`); idea, hub and post tables unused. `004` is a TEST agreement.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero and background motion included, checked
  by tests and measurements. "Try the demo" and "Start the tour" show "Coming soon".
- `/{lang}/sign-in` reuses the hero and is the only screen that calls the API so far.
- Below the hero, sections reveal once, the header marks the section being read, tour stops
  show their share of three minutes, "coming soon" presses are announced, and phones get
  section links (`docs/decisions/2026-11-11-landing-section-interactions.md`).
- Onboarding after first sign-in is at `/en/onboarding` and `/fr/onboarding`: a welcome, then
  one question per screen, then a developer card. Static demo data, nothing saved, no API calls.
  API gaps: `docs/decisions/2026-11-11-onboarding-page.md`.
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.
- GitHub does not enforce the rules on `main` yet, so they hold by team agreement
  (`docs/decisions/2026-11-04-team-workflow-and-ci.md`).

## What's next

1. Connect a verification worker to move pending sessions through AI analysis into peer
   review. The worker contract and GitHub repository analysis are still open.
2. Connect the onboarding page to the API once the gaps are closed: onboarding completion,
   country, idea topics, French lookup names, one save endpoint (see
   `docs/decisions/2026-11-11-onboarding-page.md`).
3. Build the rest of the core flow from PRD v2.2: share an idea, AI matching, the idea's
   owner approving the team, and the Virtual Collaboration Hub with all four phases. The
   PRD is not in this repository yet; ask Tanny for it before starting.
4. Watch the landing page motion in a browser, including with reduced motion, and have a
   French-speaking teammate check the French. New pages go under `app/[lang]` with English
   and French text (see `docs/decisions/2026-11-10-landing-page-language-and-theme.md`).
5. Build the `/auth/callback` page: exchange the login code for tokens, keep the session,
   and send GitHub failures back to `/{lang}/sign-in?error=CODE`. Point the API's callback
   redirect at a language path. Before launch, move sign-in state out of API memory (the
   decision record suggests a `refresh_tokens` table).
6. Add a deploy job to CI once the team has Systalink platform access.
7. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
