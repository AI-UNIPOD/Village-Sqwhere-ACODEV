# Sign-in state in Postgres

## Context

The API kept three things in the memory of one process (`apps/api/app/api/v1/auth.py`):

- the one-time OAuth states that `POST /v1/auth/oauth/{provider}/start` issues;
- the one-time login codes that the callback issues and `POST /v1/auth/token` exchanges;
- the refresh tokens that were signed out or rotated.

The record of 7 November (`2026-11-07-sign-in-without-dev-login.md`) accepted this as a known
limit: run a single API process, and revisit before launch.

The API now runs on Vercel functions (`2026-11-15-deploy-on-vercel.md`). Several instances
serve requests and each can restart at any time. A sign-in that started on one instance and
came back on another failed with `INVALID_STATE`. A refresh token signed out on one instance
still worked on another. The repository is public and real GitHub sign-ins are expected.

## Decision

The build owner decided on 19 November 2026, for Tanny: all three live in PostgreSQL, so any
instance can finish what another started. `infra/db/init/029-sign-in-state.sql` adds the
tables.

| Table | What a row holds | It expires |
|---|---|---|
| `oauth_states` | provider, PKCE challenge, redirect address | 10 minutes after `/start` |
| `login_codes` | user, whether the account is new, PKCE challenge | 5 minutes after the callback |
| `revoked_refresh_tokens` | nothing else | when the token itself expires (30 days at most) |

- **Only hashes are stored.** A row is found by the SHA-256 of the state, the code or the
  token, and the value itself is never written. A state and a code are 32 random bytes and a
  token is signed, so nobody can guess one from its hash and no salt is needed. A copy of the
  database is not enough to finish a sign-in or to reuse a token. The whole refresh token is
  hashed, not an id inside it, so a token made before this change is covered too.
- **One use, on every instance.** A state or a code is taken with one statement:
  `DELETE ... WHERE hash = :h AND expires_at > now() RETURNING ...`. When two instances get
  the same value, the database gives the row to one and the other finds nothing. A refresh
  token is rotated with `INSERT ... ON CONFLICT DO NOTHING RETURNING ...`, so of two requests
  with the same token only one gets a new pair.
- **One clock.** The database's `now()` decides what has expired, not each instance's clock.
- **No clean-up job.** Each write first deletes the expired rows of its table, through an
  index on `expires_at`. No worker step and no schedule.
- **Logout keeps only real tokens.** Anyone can call `POST /v1/auth/logout`. A value the API
  did not sign, or one that has expired, could never be used, so it is not stored and made-up
  values cannot fill the table. The answer is `204` either way, as before.
- **Callers see no change.** The routes, the checks (provider, expiry, PKCE, one use), the
  status codes and the error codes are the same.

## Options we considered

- **A signed state that needs no store** (the provider, the challenge and the expiry inside a
  value signed with `JWT_SECRET_KEY`). Any instance could check it, but nothing would make it
  one use: a state or a code read from a log or a browser history would work again until it
  expired. Logout would still need a store.
- **Redis or another shared cache.** It fits short-lived keys well, but it is a new service,
  account, secret and dependency for a few small rows. Every sign-in already reads and writes
  Postgres, and a few more short statements cost little.
- **A `refresh_tokens` table with every token issued**, the fix the 7 November record named.
  It needs a row for each sign-in and each refresh, and an id in each token. A list of the
  revoked ones gives the same promise with a smaller change. Worth another look if we add
  "sign out everywhere".
- **Keep one process.** Vercel starts and stops function instances as it needs, so we cannot
  hold the API to one.

## Consequences

- GitHub sign-in works whichever instance answers each step, and a logout holds on every
  instance and after a restart. The "single API process" rule is gone for sign-in.
- **An existing database must get `029-sign-in-state.sql` before this version of the API
  runs**, or sign-in answers `500`. Run it once by hand; running it twice is safe. People in
  the middle of signing in when it deploys start again.
- `/start` and logout now need the database, and each sign-in step makes a few more short
  statements. When the callback cannot reach the database, it sends the person back to the
  web app with `OAUTH_EXCHANGE_FAILED`.
  Changed on 19 November 2026: the API also logs such a failure, by its error type only, since
  the message of a database or HTTP error can hold the code or a token.
- `revoked_refresh_tokens` gets a row for each logout and each refresh, kept until the token
  would have expired. A row is one hash and one date. If the table grows large, that is the
  time for the `refresh_tokens` table above.
- A refresh token now carries a random id (`jti`), as an access token already did. Before, two
  refresh tokens made for one account in the same second were the same token, so revoking one
  revoked the other. With the revocations shared by every instance, that would have let one
  visitor's sign-out end another visitor's session on the shared demo account.
- Two other things still live in one process's memory and are not part of this change: the
  interview tickets (`2026-11-15-interview-ticket.md`) and the listeners of the live hub chat
  (`2026-11-15-live-hub-chat.md`).
