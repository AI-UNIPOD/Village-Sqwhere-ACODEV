# Progress

Read this first, every session. Update "Current state" and "What's next" in place when you
finish meaningful work. Keep the whole file under 60 lines: history belongs in
`CHANGELOG.md` and `docs/decisions/`, not here.

## Current state (2026-11-04)

- Monorepo in place: `apps/web` (Next.js 16, a placeholder home page and one Vitest test),
  `apps/api` (FastAPI with `/health` and one pytest test), `infra/` (Postgres 17 with
  pgvector in Docker).
- Team rules for people and agents are in `AGENTS.md`. CI runs on every pull request:
  title rule, dash check, web, api and secret scan.
- No product features are built yet.
- GitHub does not enforce the rules on `main` yet (see
  `docs/decisions/2026-11-04-team-workflow-and-ci.md`). Until it does, the rules hold by
  team agreement.

## What's next

1. Build the core flow from PRD v2.2: sign in, share an idea, AI matching, the idea's
   owner approving the team, and the Virtual Collaboration Hub with all four phases. The
   PRD is not in this repository yet; ask Tanny for it before starting.
2. Add English and French switching to the web app, before the first real screens.
3. Add a deploy job to CI once the team has Systalink platform access.
4. Turn on GitHub protection for `main` (needs an org admin and a paid plan, or a public
   repository).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
