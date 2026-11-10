# Progress

Read this first, every session. Update "Current state" and "What's next" in place when you
finish meaningful work. Keep the whole file under 60 lines: history belongs in
`CHANGELOG.md` and `docs/decisions/`, not here.

## Current state (2026-11-10)

- Monorepo in place: `apps/web` (Next.js 16, the landing page in English and French),
  `apps/api` (FastAPI with `/health` and one pytest test), `infra/` (Postgres 17 with
  pgvector in Docker).
- Team rules for people and agents are in `AGENTS.md`. CI runs on every pull request:
  title rule, dash check, web, api and secret scan.
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero animation included: walking country
  names, the logo fading in, the loop, pause and the pointer twins, plus background words
  drifting slowly right to left (held on hover). The motion was checked by tests, a
  line-by-line port of B3v and measurements in the app, not by eye. "Try the demo", "Start
  the tour" and "Sign in" show "Coming soon". No other product screens exist yet.
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.
- GitHub does not enforce the rules on `main` yet (see
  `docs/decisions/2026-11-04-team-workflow-and-ci.md`). Until it does, the rules hold by
  team agreement.

## What's next

1. Build the core flow from PRD v2.2: sign in, share an idea, AI matching, the idea's
   owner approving the team, and the Virtual Collaboration Hub with all four phases. The
   PRD is not in this repository yet; ask Tanny for it before starting.
2. Review and merge the landing page: watch the hero motion in a browser, and have a
   French-speaking teammate check the French. New pages go under `app/[lang]` with English
   and French text (see `docs/decisions/2026-11-10-landing-page-language-and-theme.md`).
3. Point "Try the demo", "Start the tour" and "Sign in" at real screens once they exist.
4. Add a deploy job to CI once the team has Systalink platform access.
5. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
