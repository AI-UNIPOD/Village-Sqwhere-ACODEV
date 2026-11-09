# Sign-in without a dev login, with a required signing key

## Context

The first version of GitHub sign-in (pull request #3) had a "dev simulation mode".
`POST /v1/auth/token` accepted any login code it had not issued, such as
`lc_gh_developer_samuel`, then created that account and signed the caller in. The mode was
always on, even on a server with real GitHub credentials, so anyone could create accounts
and sign in as them. The OAuth `state` and the PKCE verifier were never checked, and a
built-in fallback secret signed tokens whenever `JWT_SECRET_KEY` was missing.

## Decision

Tanny decided on 2026-11-07:

- **No dev login.** Every sign-in goes through GitHub: `start` stores a one-time `state`
  and the PKCE challenge, the callback accepts only that state, and `/auth/token` accepts
  only the one-time login code the callback issued, with the matching PKCE verifier.
  Anything else gets `401`. Providers without a real code exchange (Bitbucket for now)
  return `503 PROVIDER_NOT_CONFIGURED`. Developers who want to sign in locally register
  their own GitHub OAuth app. Tests fake GitHub's side of the exchange.
- **The API refuses to start without a signing key.** `JWT_SECRET_KEY` must be set and at
  least 32 characters. There is no default.
- **OAuth states, login codes and revoked refresh tokens stay in memory for now.** This is
  a known limit, not a final design.

## Options we considered

- **Keep the dev login behind an opt-in switch** (for example `AUTH_DEV_LOGIN=true`, local
  only). Not chosen: more code to secure and test, and a switch that could be turned on in
  production by mistake.
- **Generate a random signing key on each start.** Not chosen: everyone is signed out on
  every restart, and more than one API process breaks sign-in.
- **Store refresh tokens in a new database table now.** Not chosen for this change, to keep
  it small. It is the planned fix for the limit below.

## Consequences

- Sign-in cannot be faked. Local sign-in needs a GitHub OAuth app and an internet
  connection.
- Every environment must set `JWT_SECRET_KEY`, including Systalink.
- Because of the in-memory stores, a restart cancels sign-ins in progress and forgets
  logouts: a logged-out refresh token works again until it expires (30 days). Run a single
  API process. Revisit before launch with a `refresh_tokens` table (hashed tokens,
  `revoked_at`), and move login codes and states there or to a shared cache.
