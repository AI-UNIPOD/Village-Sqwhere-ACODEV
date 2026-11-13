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
  feed and saved posts. Comments and replies: create, read, edit, delete, lists. Schema:
  `infra/db/init/`. Tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32+ chars) and keeps sign-in state in memory, so run one
  process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- Landing page at `/en` and `/fr` matches B3v design with motion and dark theme. Hero leads to
  sign-in; demo and tour show "Coming soon". GitHub sign-in works end to end with token refresh.
- Below the hero, sections reveal once; the header pins as a pill while scrolling. Onboarding
  saves role and stack. Signed-in web screens share `AppFrame`.
- Unknown addresses get a 404 sent as HTML; landing and sign-in have an error page. Design system
  is in `docs/design-system/`: tokens, palaver tree logo, fonts, accessible contrast.

## What's next

1. Fix the GitHub Actions billing limit, turn `ci` back on, then revisit the merge agent.
2. Comment threads and comment likes (tracker rows 67 to 75).
3. Leaving and removing members, editing and archiving a hub, and the four hub phases (decisions
   and next steps need a new schema script); later, semantic similarity for matching.
4. Add peer-review report display, production deployment configuration and, once the team has
   Systalink platform access, a deploy job in CI.
5. Save the onboarding country and topics, and a completion flag, once API gaps 1, 2 and 3 close.
6. Replace the TEST agreement with the real text, as version 2 in a new script, before launch.
7. Web next: a French-speaking teammate's check of the copy.
8. Before launch, move the session out of localStorage and sign-in state out of API memory
   (a `refresh_tokens` table, per the sign-in record); have the API carry the language via GitHub.
9. Turn on GitHub protection for `main` (an org admin and a paid plan, or a public repository);
   until then the merge agent enforces green checks (`docs/decisions/2026-11-13-merge-agent.md`).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts to confirm: dates, rubric, required deliverables.
