# Renaming and archiving a hub

## Context

A hub's name and description were fixed when it was created, and the schema has had an
`archived` status since the start with no route to set it. Every hub route already refuses
changes to an archived hub with `409 HUB_ARCHIVED`. Tanny asked on 2026-11-14 for the remaining
tracker rows to be built, and rows 38 and 39 are these.

## Decision

- `PATCH /v1/hubs/{hub_id}`: the owner changes the name, the description or both. A left-out
  field keeps its value, and a `null` description clears it. The terms and the agreement are
  not editable here: people signed them.
- `POST /v1/hubs/{hub_id}/archive`: the owner archives the hub. It is one way: there is no
  unarchive. The hub stays readable to its members, and every write is refused.
- An archived hub cannot be edited either.
- Archiving is not the build plan's "finish": finishing marks the review done and keeps the
  hub active (the build session's `POST /v1/hubs/{hub_id}/finish`).

## Options we considered

- Let the owner unarchive. Not chosen: nothing needs it yet, and a hub that can come back makes
  "archived" mean less to the people who left it.
- Archive by deleting the hub. Not chosen: hubs hold signatures and members' work, which the
  schema keeps on purpose.
- Close pending invitations and requests when archiving. Not chosen: they can no longer be
  accepted or approved anyway, and the person can still withdraw a request.

## Consequences

An owner who archives by mistake cannot undo it without a database change. The web side is
still to build.
