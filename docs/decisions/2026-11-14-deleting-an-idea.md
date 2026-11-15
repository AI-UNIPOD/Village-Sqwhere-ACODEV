# Deleting an idea

## Context

An author could close an open idea but never remove one, so a draft typed by mistake stayed in
"My ideas" for good. The schema has `ideas.deleted_at` and every idea read already skips deleted
rows. Tanny asked on 2026-11-14 for the remaining tracker rows to be built, and row 31 is this.

## Decision

- `DELETE /v1/me/ideas/{idea_id}`, under `/v1/me/ideas` with the author's other routes (the
  tracker named `/v1/ideas/{idea_id}`).
- Any status may be deleted: draft, open or closed.
- An idea with a hub may not (`409 IDEA_HAS_HUB`). Its members signed an agreement about it, the
  hub points to it, and the brief they were shown is part of what they agreed to keep secret.
  Closing is the way out for those.
- Soft delete, as for all user content, and the confidential brief is erased at once. Title and
  summary stay in the row, readable by no route.

## Options we considered

- Delete the row. Not chosen: the schema keeps user content with `deleted_at`, and a hard delete
  would need care with every foreign key.
- Let a deleted idea take its hub with it. Not chosen: hubs hold signatures and members' work.
- Keep the brief in the deleted row. Not chosen: nobody may read it again, so holding it only
  adds risk.

## Consequences

A deleted idea cannot be brought back by its author. An author whose idea has a hub closes it
instead.
