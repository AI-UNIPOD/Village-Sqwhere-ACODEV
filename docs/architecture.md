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
- **Post image storage**: image bytes use an S3-compatible object store. `post_attachments`
  stores object keys and image metadata. Uploads stay disabled until bucket and public URL
  settings are supplied.
- **PostgreSQL + pgvector**: the main data store, set up by the scripts in `infra/db/init/`.
  `idea_embeddings` and `user_embeddings` hold what an idea and a developer mean, as 768
  numbers each from Google's `gemini-embedding-2`. The worker writes them, never a request
  (see "The worker" below). The match score and similar ideas read them.
- **The worker** (`python -m app.workers.runner`): the slow steps that must not hold a request.
  It runs the role verification (reading repositories, writing the report) and, each run,
  embeds up to 20 open ideas and 20 developers that have no vector. Only public text leaves the
  server for that: an idea's title and summary, and a developer's verified roles, technologies,
  sectors and bio. Never an idea's private brief, an email, a name or a username. When the text
  changes, a database trigger removes the vector and the next run makes a new one. Without
  `GEMINI_API_KEY` the step does nothing. Why:
  `docs/decisions/2026-11-15-embeddings-on-gemini.md`.
- **Hosting**: one Vercel project, from `vercel.json`: the web app, the API and the verification
  worker on one domain (see `infra/README.md`).

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
  WebSocket, `WS /v1/me/verifications/{session_id}/interview`, opened with a one-use ticket
  from `POST /v1/me/verifications/{session_id}/interview-ticket` in the `ticket` query
  parameter (the older `token` parameter is deprecated). The socket is not in the OpenAPI
  schema, so the route test does not cover it.
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
  Anyone with a membership row reads their own, with what they signed, at
  `GET /v1/hubs/{hub_id}/membership`.
  A member leaves with `POST /v1/hubs/{hub_id}/membership/leave`, and the owner removes one
  with `POST /v1/hubs/{hub_id}/members/{user_id}/remove`.
  The owner renames or describes the hub with `PATCH /v1/hubs/{hub_id}` and archives it, for
  good, with `POST /v1/hubs/{hub_id}/archive`.
  The owner starts the work with `POST /v1/hubs/{hub_id}/team/confirm` (any team size, which
  opens brainstorm) and moves the hub one phase forward or back with
  `POST /v1/hubs/{hub_id}/phase`; the hub card says which phase it is in. Active members write
  short brainstorm notes: `GET /v1/hubs/{hub_id}/notes` reads them in every phase once the team
  is confirmed, `POST /v1/hubs/{hub_id}/notes` adds one and
  `DELETE /v1/hubs/{hub_id}/notes/{note_id}` removes one, both only during brainstorm. In the
  design phase they sketch the system: `GET /v1/hubs/{hub_id}/design` reads the pieces and the
  labelled links between them in design, build and review, `POST /v1/hubs/{hub_id}/pieces`,
  `PATCH /v1/hubs/{hub_id}/pieces/{piece_id}` and `DELETE /v1/hubs/{hub_id}/pieces/{piece_id}`
  change the pieces, and `POST /v1/hubs/{hub_id}/links` and
  `DELETE /v1/hubs/{hub_id}/links/{link_id}` change the links, all only during design. In the
  build phase they split the work and follow the code: `GET /v1/hubs/{hub_id}/build` reads who
  holds each piece, the repository address and the latest commits in build and review,
  `POST /v1/hubs/{hub_id}/pieces/{piece_id}/claim` and
  `DELETE /v1/hubs/{hub_id}/pieces/{piece_id}/claim` take and free a piece, and
  `PUT /v1/hubs/{hub_id}/repository` (the owner) sets the public GitHub address, all only during
  build. `POST /v1/hubs/{hub_id}/commits/refresh` copies the repository's latest 20 commits from
  GitHub, at most once a minute per hub, in build and review.
  In the review phase the team checks each other's work: `GET /v1/hubs/{hub_id}/review` reads
  the checks of every piece, `POST /v1/hubs/{hub_id}/pieces/{piece_id}/checks` adds one,
  `POST /v1/hubs/{hub_id}/checks/{check_id}/tick` and
  `DELETE /v1/hubs/{hub_id}/checks/{check_id}/tick` tick and untick it (never the piece's
  holder), `DELETE /v1/hubs/{hub_id}/checks/{check_id}` removes it, and
  `POST /v1/hubs/{hub_id}/finish` lets the owner finish the hub once every check is ticked.
  Active members also chat, in any phase: `GET /v1/hubs/{hub_id}/messages` (newest first),
  `POST /v1/hubs/{hub_id}/messages` (optionally quoting one),
  `PATCH /v1/hubs/{hub_id}/messages/{message_id}` (the author) and
  `DELETE /v1/hubs/{hub_id}/messages/{message_id}` (the author or the owner). They hear
  changes live on the WebSocket `WS /v1/hubs/{hub_id}/messages/live` (the token goes in its
  first frame, never the URL; one API process only).
- **Ideas** (Bearer token): `POST /v1/me/ideas`, `GET /v1/me/ideas`,
  `GET /v1/me/ideas/{idea_id}`, `PATCH /v1/me/ideas/{idea_id}`,
  `POST /v1/me/ideas/{idea_id}/publish`, `POST /v1/me/ideas/{idea_id}/close` and
  `DELETE /v1/me/ideas/{idea_id}` (only while it has no hub) create and manage the owner's
  private ideas. `GET /v1/ideas` and `GET /v1/ideas/{idea_id}` show only
  open idea cards to signed-in developers, and `GET /v1/ideas/{idea_id}/similar` gives up to
  five other open ideas that read close to one. A card has the summary and roles needed, never
  the confidential brief. Guide: `docs/backend.md`.
- **Matching** (Bearer token): `GET /v1/me/ideas/{idea_id}/matches` ranks developers verified
  in the roles one of my open ideas needs, and `GET /v1/me/matches` ranks open ideas that need
  my verified roles. Every match has a score out of 100, counted from roles, shared technologies,
  shared sectors and, when both vectors exist, how close the idea and the profile read, and both
  lists are ordered by it. A match can also name the closest idea of the other person or of mine
  (`similar_idea`). No AI model is called at request time and no idea details are involved.
- **Posts** (Developer Exchange, Bearer token): `POST /v1/posts`, `GET /v1/posts/{post_id}`,
  `PATCH /v1/posts/{post_id}` and `DELETE /v1/posts/{post_id}`. Lists, newest first:
  `GET /v1/posts` (filter by `type`, repeatable `topic`, `author`) and `GET /v1/feed` (your feed topics
  and your own posts). Likes and saves, each safe to repeat: `PUT /v1/posts/{post_id}/like`,
  `DELETE /v1/posts/{post_id}/like`, `PUT /v1/posts/{post_id}/save`,
  `DELETE /v1/posts/{post_id}/save` and `GET /v1/me/saved-posts`. The author adds an image (JPEG,
  PNG or WebP, up to 5 MB, at most 10) with `POST /v1/uploads`; it answers 503 until storage is set.
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
- GitHub Flow with squash merges (see `CONTRIBUTING.md`).

Each decision someone might question gets a record in `docs/decisions/`.
