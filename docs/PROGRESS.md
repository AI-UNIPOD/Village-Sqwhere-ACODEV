# Progress

Read this first. Update "Current state" and "What's next" in place after meaningful work.
Keep the file under 60 lines: history goes in `CHANGELOG.md` and `docs/decisions/`.

## Current state (2026-11-13)

- Monorepo: `apps/web` (Next.js 16, landing page in English and French), `apps/api` (FastAPI
  v1 auth, profiles, roles, verification), `infra/` (Postgres 17 with pgvector in Docker).
- Team rules are in `AGENTS.md`. GitHub Actions is off (billing limit), so a merge agent on
  Tanny's PC runs the CI checks and merges green pull requests (not in this repository).
- The API has GitHub sign-in with PKCE, profiles, roles, technologies, feed topics and
  verification (GitHub analysis, five-question AI interview, report, peer review), Groq
  and Gemini fallbacks and a separate worker. Guide: `docs/backend.md`.
- Ideas, matching and hubs are in place (drafts, cards, ranking, agreements, membership).
  Posts: create, read, edit, delete, like, save, a filtered list (`GET /v1/posts`), the
  feed and saved posts. Schema: `infra/db/init/`. Tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32+ chars) and keeps sign-in state in memory, so run one
  process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- Landing page at `/en` and `/fr` matches B3v design with motion and dark theme. Hero leads to
  sign-in; demo and tour show "Coming soon". GitHub sign-in works end to end with token refresh.
- Below the hero, sections reveal once; the header pins as a pill while scrolling. Onboarding
  saves role and stack. Signed-in web screens share `AppFrame`.
- Unknown addresses get a localized 404; landing and sign-in have an error page. Design system
  is in `docs/design-system/`: tokens, palaver tree logo, fonts, accessible contrast.

## What's next

1. Fix GitHub Actions billing limit, turn CI back on, then revisit the merge agent.
2. Posts feeds, topic filtering, likes and saves (PR 2).
3. Leaving and removing members, archiving a hub, and the four hub phases.
4. Add peer-review report display, production deploy config and CI deploy job.
5. Save onboarding country, topics and completion flag once API gaps close.
6. Replace TEST agreement with real text (v2 script) before launch.
7. Move session out of localStorage and sign-in state out of API memory before launch.
8. Turn on GitHub branch protection for `main`.

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts to confirm: dates, rubric, required deliverables.
