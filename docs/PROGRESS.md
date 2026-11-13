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
- Ideas: private drafts with roles, published for signed-in developers, then closed; the brief
  stays owner-only. Matching ranks people and ideas by verified roles (no AI). Hubs: create,
  read, list mine, invite, accept by signing, decline, members and the brief for members. No
  posts API yet. Schema: `infra/db/init/` (`004`: TEST agreement). Tests need `TEST_DATABASE_URL`.
- The API needs `JWT_SECRET_KEY` (32 characters or more) and keeps sign-in state in memory,
  so run one process (`docs/decisions/2026-11-07-sign-in-without-dev-login.md`).
- The landing page is at `/en` and `/fr` (`apps/web/app/landing/`; `/` redirects by browser
  language). It matches the approved B3v design, hero and background motion included, checked
  by tests and measurements. The hero leads to sign-in; the demo and tour start say "Coming soon".
- GitHub sign-in works end to end (real account, own language); `app/session/` refreshes and
  signs out (`docs/decisions/2026-11-11-web-session-in-local-storage.md`).
- Below the hero, sections reveal once, the header marks the section being read and pins as a
  pill once scrolled away (`docs/decisions/2026-11-13-landing-pill-header.md`).
- Onboarding after sign-in is at `/en/onboarding` and `/fr/onboarding`, for signed-in people
  only, greeting them by their name from `GET /v1/me`. The last screen saves the main role and
  the stack; country and topics stay in the tab (`docs/decisions/2026-11-11-onboarding-page.md`).
- Signed-in web screens share the `AppFrame` header: village home, role verification and its
  interview, peer review, ideas, hubs. Addresses: `apps/web/README.md`; why: `docs/decisions/`.
- Unknown addresses get a 404 in their language; landing and sign-in have an error page. French
  copy puts a narrow no-break space before ? ! : ; (`docs/design-system/voice-and-tone.md`).
- The design system is in `docs/design-system/`: tokens, the palaver tree logo and docs.
  `apps/web` uses it: tokens, fonts, the logo and tab icon, with tests that hold it.

## What's next

1. Fix the GitHub Actions billing limit, turn `ci` back on, then revisit the merge agent.
2. Build AI matching on published ideas, then the owner's team approval, invitations and the
   four hub phases. Ask Tanny for the PRD before any product decision it must settle.
3. Add production deployment configuration and, once the team has Systalink platform access, a
   deploy job in CI.
4. Save the onboarding country and topics, and a completion flag, once API gaps 1, 2 and 3 close.
5. Replace the TEST agreement with the real text, as version 2 in a new script, before launch.
6. Web screens next: navigation, a profile page, matches and invitations. Also a server-rendered
   404 and a French-speaking teammate's check of the copy.
7. Before launch, move the session out of localStorage and sign-in state out of API memory
   (a `refresh_tokens` table, per the sign-in record); have the API carry the language via GitHub.
8. Turn on GitHub protection for `main` (an org admin and a paid plan, or a public repository);
   until then the merge agent enforces green checks (`docs/decisions/2026-11-13-merge-agent.md`).

## Open questions

- Systalink platform details: how apps and Postgres with pgvector are hosted there.
- Competition facts still to confirm from the team's platform login: dates, rubric,
  required deliverables.
