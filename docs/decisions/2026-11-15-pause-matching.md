# Pausing matching

## Context

Once a developer verifies a role, every idea owner who needs that role sees them as a match,
with their score, place and shared technologies. There was no way to step back for a while (a
busy month, a new job). The matching record of 2026-11-13 left an opt-out for later, and the
build plan (F5) planned one before launch. Tracker row 106 asks for it. Tanny approved the
database script on 2026-11-15.

## Decision

- `users.matching_paused_at` (script 024). `PATCH /v1/me` takes `"matching_paused": true` or
  `false`; profiles show `matching_paused` and `matching_paused_at`.
- While paused, the developer is left out of every owner's developer matches.
- Nothing else changes: their own matches still answer, so they can look around while paused;
  their public profile stays visible (`2026-11-14-public-profile.md`); owners can still invite
  them by username, and they can still ask to join.
- Pausing again keeps the first moment, so the profile can say "paused since".

## Options we considered

- Hide the profile too. Not chosen: the public profile record keeps it visible, and a name on a
  team list or a post must still lead somewhere.
- Refuse invitations while paused. Not chosen: the person can decline, and an owner who knows
  someone by name should be able to ask.
- A pause that ends by itself after some time. Not chosen: nothing asks for it yet, and an end
  date is one more rule to explain.

## Consequences

The web side, a switch on the profile page in English and French, is still to build.
