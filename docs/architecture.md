# Architecture

A short overview of how Village Sqwhere fits together. Update it when the design changes.

## Components

```text
Browser ──► apps/web (Next.js) ──► apps/api (FastAPI) ──► PostgreSQL + pgvector
```

- **apps/web**: the user interface, in English and French. It calls the API for sign-in and
  profile data, and will add the collaboration flow next.
- **apps/api**: business logic: sign-in, profiles, role verification, ideas and initial hub
  creation today, with matching and the remaining hub collaboration routes still to build.
  Settings come from environment variables or a root `.env` file (`apps/api/app/config.py`):
  `DATABASE_URL`, `CORS_ORIGINS`, `FRONTEND_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  and `JWT_SECRET_KEY`. The API will not start without `JWT_SECRET_KEY`.
- **PostgreSQL + pgvector**: the main data store, set up by the scripts in `infra/db/init/`.
  The schema has an `idea_embeddings` table with a pgvector column, for finding similar
  ideas. Nothing writes to it yet.
- **Hosting**: everything is deployed on Systalink (see `infra/README.md`).

## What the API does today

All routes are under `/v1` (`apps/api/app/api/v1/router.py`). Details and examples are in
`docs/backend.md`.

- **System**: `GET /v1/health`. `GET /health` also exists at the root.
- **Lookups** (public): `GET /v1/roles`, `GET /v1/sectors` and `GET /v1/technologies`.
- **Sign-in** with GitHub, OAuth with PKCE: `POST /v1/auth/oauth/{provider}/start`,
  `GET /v1/auth/oauth/{provider}/callback`, `POST /v1/auth/token` (a login code or a
  refresh token) and `POST /v1/auth/logout`. `POST /v1/auth/demo` signs in as the shared,
  read-only demo account when `DEMO_ENABLED` is `true`; demo accounts see only demo content,
  and nobody else sees it. The API signs access and refresh tokens with
  `JWT_SECRET_KEY`. Bitbucket is not built and returns `503`. A new account also gets a
  verified email from GitHub when there is one (`apps/api/app/services/provider_emails.py`).
  A missing, clashing or unreadable email never blocks sign-in.
- **Profile** (Bearer token): `GET /v1/me`, `PATCH /v1/me` and `POST /v1/me/deletion`
  (anonymises the account and keeps its posts). Another developer's public profile (card
  fields and bio, never email or names) is `GET /v1/users/{username}`.
- **Roles, technologies, feed topics and sectors** (Bearer token): `POST /v1/me/roles`,
  `PATCH /v1/me/roles/{role_slug}` (make it the primary role), `DELETE /v1/me/roles/{role_slug}`
  (refused with `409` once the role has verification attempts), `PUT /v1/me/technologies`
  and `PUT /v1/me/feed-topics` (each replaces the whole list, by technology slug), and
  `PUT /v1/me/sectors` (replaces the whole set, by sector slug).
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
- **Hubs** (Bearer token): `GET /v1/agreements/current` (the published agreement with the
  highest version, which a hub owner signs) and `POST /v1/hubs` (the idea's author creates
  its one hub, signing the agreement; the hub, the signature and the owner's membership are
  saved together), `GET /v1/hubs/{hub_id}` (any signed-in user reads a hub's card, with
  their own membership in it) and `GET /v1/me/hubs` (the hubs the person is in, has asked to
  join or is invited to). Joining: the owner invites with
  `POST /v1/hubs/{hub_id}/invitations` and withdraws with
  `DELETE /v1/hubs/{hub_id}/invitations/{user_id}`; the invitee reads
  `GET /v1/hubs/{hub_id}/agreement`, then signs with `POST /v1/hubs/{hub_id}/invitation/accept`
  or says no with `POST /v1/hubs/{hub_id}/invitation/decline`. A developer can also ask with
  `POST /v1/hubs/{hub_id}/join-requests` (and takes it back with
  `POST /v1/hubs/{hub_id}/join-request/withdraw`); the owner answers with
  `POST /v1/hubs/{hub_id}/members/{user_id}/approve` (an invitation, signed the same way) or
  `POST /v1/hubs/{hub_id}/members/{user_id}/decline`. Only active members read
  `GET /v1/hubs/{hub_id}/members` and `GET /v1/hubs/{hub_id}/idea` (the confidential brief).
  A member leaves with `POST /v1/hubs/{hub_id}/membership/leave`, and the owner removes one
  with `POST /v1/hubs/{hub_id}/members/{user_id}/remove`.
  The owner starts the work with `POST /v1/hubs/{hub_id}/team/confirm` (any team size, which
  opens brainstorm) and moves the hub one phase forward or back with
  `POST /v1/hubs/{hub_id}/phase`; the hub card says which phase it is in. Active members write
  short brainstorm notes: `GET /v1/hubs/{hub_id}/notes` reads them in every phase once the team
  is confirmed, `POST /v1/hubs/{hub_id}/notes` adds one and
  `DELETE /v1/hubs/{hub_id}/notes/{note_id}` removes one, both only during brainstorm.
- **Ideas** (Bearer token): `POST /v1/me/ideas`, `GET /v1/me/ideas`,
  `GET /v1/me/ideas/{idea_id}`, `PATCH /v1/me/ideas/{idea_id}`,
  `POST /v1/me/ideas/{idea_id}/publish`, `POST /v1/me/ideas/{idea_id}/close` and
  `DELETE /v1/me/ideas/{idea_id}` (only while it has no hub) create and manage the owner's
  private ideas. `GET /v1/ideas` and `GET /v1/ideas/{idea_id}` show only
  open idea cards to signed-in developers. A card has the summary and roles needed, never the
  confidential brief. Guide: `docs/backend.md`.
- **Matching** (Bearer token): `GET /v1/me/ideas/{idea_id}/matches` ranks developers verified
  in the roles one of my open ideas needs, and `GET /v1/me/matches` ranks open ideas that need
  my verified roles. Every match has a score out of 100, counted from roles, shared technologies
  and shared sectors, and both lists are ordered by it. No AI model and no idea details are
  involved.
- **Posts** (Developer Exchange, Bearer token): `POST /v1/posts`, `GET /v1/posts/{post_id}`,
  `PATCH /v1/posts/{post_id}` and `DELETE /v1/posts/{post_id}`. Lists, newest first:
  `GET /v1/posts` (filter by `type`, repeatable `topic`, `author`) and `GET /v1/feed` (your feed topics
  and your own posts). Likes and saves, each safe to repeat: `PUT /v1/posts/{post_id}/like`,
  `DELETE /v1/posts/{post_id}/like`, `PUT /v1/posts/{post_id}/save`,
  `DELETE /v1/posts/{post_id}/save` and `GET /v1/me/saved-posts`.
- **Comments** (Bearer token): comment or reply with `POST /v1/posts/{post_id}/comments`, then
  `GET /v1/comments/{comment_id}`, `PATCH /v1/comments/{comment_id}` and
  `DELETE /v1/comments/{comment_id}`. Lists, oldest first: `GET /v1/posts/{post_id}/comments`
  (with the first two replies of each), `GET /v1/comments/{comment_id}/replies` and
  `GET /v1/comments/{comment_id}/thread` (five levels below). Likes, safe to repeat:
  `PUT /v1/comments/{comment_id}/like` and `DELETE /v1/comments/{comment_id}/like`.
- OAuth states, login codes and revoked refresh tokens are kept in API memory, so run one
  API process. See `docs/decisions/2026-11-07-sign-in-without-dev-login.md`.

## Core flow

1. A developer signs in and shares an idea.
2. The API embeds the idea and finds developers with similar ideas and complementary skills.
3. Matched developers accept the digital IP/NDA agreement before joining.
4. The API provisions a Virtual Collaboration Hub. When the owner confirms the team, the hub
   opens in brainstorm, then the owner moves it through four phases: brainstorm → design and
   architecture → build → review and test.

## Decisions so far

- Monorepo with one folder per app (`apps/web`, `apps/api`), shared tooling at the root.
- pnpm workspace for JavaScript, uv for Python, Docker Compose for local services.
- GitHub Flow with squash merges (see `AGENTS.md` and `CONTRIBUTING.md`).

Each decision someone might question gets a record in `docs/decisions/`.
