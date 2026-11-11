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
- The language on return comes from the browser, not the sign-in page. Someone who chose
  French on an English browser comes back in English. Fixing that needs the API to carry
  the language through GitHub.
