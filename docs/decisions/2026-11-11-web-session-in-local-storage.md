# Keep the web session in localStorage for now

## Context

The GitHub sign-in callback page in `apps/web` finishes sign-in. It exchanges the one-time
login code for an access token and a refresh token, then keeps them in the browser. The API
has no cookie, so the web app must choose where the tokens live between visits.

## Decision

The project owner chose on 2026-11-11 to keep both tokens in localStorage, under one key,
with their expiry times. Sign-in survives closing the browser. Nothing changes in the API.

## Options we considered

- **sessionStorage.** Cleared when the tab closes, so people sign in again often, which is
  hard on phones. It has the same script exposure as localStorage, so it adds little safety.
- **localStorage (chosen).** Sign-in lasts across visits. It needs no API change.
- **An httpOnly cookie set by the API or a Next route handler.** Scripts on the page cannot
  read it, so it is the safest option against cross-site scripting. It needs changes to the
  API, CORS and credentials handling. That is too big for this step.

## Consequences

- Any script running on the page can read the tokens. A cross-site scripting bug would
  expose them.
- The refresh token lives for 30 days on the device.
- Signing out must clear the key and call `POST /v1/auth/logout`.
- On a shared computer, the next person stays signed in until the tokens expire or someone
  signs out.
- Revisit before launch, or as soon as the API can set an httpOnly cookie.
- *Update, 12 November 2026:* the sign-in page keeps its language in sessionStorage, and the
  callback page moves to that language before it uses the one-time code. Someone who chose
  French on an English browser now comes back in French, with no API change.
- *Update, 12 November 2026:* only the tokens are stored, never the profile. Pages read the
  profile from `GET /v1/me`. An access token about to expire (they last 15 minutes) is
  refreshed with the refresh token, which the API rotates. Calls in one tab share a single
  refresh, and a refused refresh keeps a new pair another tab has already saved. Two tabs
  refreshing in the very same moment can still sign the person out. This is rare and safe, so
  it waits until the session moves out of localStorage.
- *Update, 12 November 2026:* signing out clears the session and the tab's onboarding answers
  first, then calls `POST /v1/auth/logout`, so it works even when the API cannot be reached.
