# Architecture

A short overview of how Village Sqwhere fits together. Update it when the design changes.

## Components

```text
Browser ──► apps/web (Next.js) ──► apps/api (FastAPI) ──► PostgreSQL + pgvector
```

- **apps/web**: the user interface, in English and French. It is meant to talk to the API
  over HTTP (`NEXT_PUBLIC_API_URL` in `.env.example`), but it does not call the API yet.
- **apps/api**: business logic: sign-in, profiles and role verification today, with ideas,
  matching, agreements and hubs still to build. Settings come from environment variables or
  a root `.env` file (`apps/api/app/config.py`): `DATABASE_URL`, `CORS_ORIGINS`,
  `FRONTEND_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `JWT_SECRET_KEY`. The API
  will not start without `JWT_SECRET_KEY`.
- **PostgreSQL + pgvector**: the main data store, set up by the scripts in `infra/db/init/`.
  The schema has an `idea_embeddings` table with a pgvector column, for finding similar
  ideas. Nothing writes to it yet.
- **Hosting**: everything is deployed on Systalink (see `infra/README.md`).

## What the API does today

All routes are under `/v1` (`apps/api/app/api/v1/router.py`). Details and examples are in
`docs/backend.md`.

- **System**: `GET /v1/health`. `GET /health` also exists at the root.
- **Lookups** (public): `GET /v1/roles` and `GET /v1/technologies`.
- **Sign-in** with GitHub, OAuth with PKCE: `POST /v1/auth/oauth/{provider}/start`,
  `GET /v1/auth/oauth/{provider}/callback`, `POST /v1/auth/token` (a login code or a
  refresh token) and `POST /v1/auth/logout`. The API signs access and refresh tokens with
  `JWT_SECRET_KEY`. Bitbucket is not built and returns `503`. A new account also gets a
  verified email from GitHub when there is one (`apps/api/app/services/provider_emails.py`).
  A missing, clashing or unreadable email never blocks sign-in.
- **Profile** (Bearer token): `GET /v1/me` and `PATCH /v1/me`.
- **Roles, technologies and feed topics** (Bearer token): `POST /v1/me/roles`,
  `PATCH /v1/me/roles/{role_slug}` (make it the primary role), `DELETE /v1/me/roles/{role_slug}`
  (refused with `409` once the role has verification attempts), `PUT /v1/me/technologies`
  and `PUT /v1/me/feed-topics` (each replaces the whole list, by technology slug).
- **Verification of a claimed role** (Bearer token), up to three attempts per role:
  `POST /v1/me/verifications/{role_slug}` (start, with GitHub repositories as evidence),
  `GET /v1/me/verifications`, `GET /v1/me/verifications/{session_id}` (poll one attempt)
  and `POST /v1/me/verifications/{session_id}/abandon`. The technical defence runs over a
  WebSocket, `WS /v1/me/verifications/{session_id}/interview`, which takes the access token in
  the `token` query parameter. It is not in the OpenAPI schema, so the route test does not
  cover it.
- **Peer review** (Bearer token, for developers verified in the attempt's role, never their
  own attempt): `GET /v1/reviews/verifications`, `GET /v1/reviews/verifications/{session_id}`
  and `POST /v1/reviews/verifications/{session_id}/decision` (`passed` or `failed`).
- **Posts** (Developer Exchange, Bearer token): `POST /v1/posts`, `GET /v1/posts/{post_id}`,
  `PATCH /v1/posts/{post_id}` and `DELETE /v1/posts/{post_id}`. Lists, newest first:
  `GET /v1/posts` (filter by `type`, `topic`, `author`) and `GET /v1/feed` (your feed topics
  and your own posts).
- OAuth states, login codes and revoked refresh tokens are kept in API memory, so run one
  API process. See `docs/decisions/2026-11-07-sign-in-without-dev-login.md`.

## Core flow

1. A developer signs in and shares an idea.
2. The API embeds the idea and finds developers with similar ideas and complementary skills.
3. Matched developers accept the digital IP/NDA agreement before joining.
4. The API provisions a Virtual Collaboration Hub that moves through four phases:
   brainstorm → design and architecture → build → peer review.

## Decisions so far

- Monorepo with one folder per app (`apps/web`, `apps/api`), shared tooling at the root.
- pnpm workspace for JavaScript, uv for Python, Docker Compose for local services.
- GitHub Flow with squash merges (see `AGENTS.md` and `CONTRIBUTING.md`).

Each decision someone might question gets a record in `docs/decisions/`.
