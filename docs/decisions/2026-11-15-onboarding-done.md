# Recording that onboarding is finished

## Context

The web had no way to know whether a developer had already finished onboarding, so it could
send someone who finished back through it. The progress notes said the web would save a
"finished" flag once the API had a field for it. Tracker row 107 asks for it. Tanny approved
the database script on 2026-11-15.

## Decision

- `users.onboarding_completed_at` (script 023), shown on every profile answer.
- `PATCH /v1/me` takes `"onboarding_completed": true`. The first time sets the moment; later
  ones keep it.
- Only `true` is accepted. Finishing is never undone, so there is nothing for `false` to mean.

## Options we considered

- A boolean column. Not chosen: the moment costs nothing more and says when.
- Work it out from the profile (a role, a stack, a country). Not chosen: those can be filled or
  emptied from the profile page too, so they say nothing reliable about onboarding.
- Let `false` clear it. Not chosen: no screen needs to send a developer back through onboarding.

## Consequences

Accounts made before this have no moment, so the web decides what to do with them (for example,
treat a developer with a role as finished). The web side, sending it at the end of onboarding
and reading it on sign-in, is still to build.
