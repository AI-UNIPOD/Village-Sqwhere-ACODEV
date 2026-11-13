# Idea lifecycle and privacy

## Context

An idea is the start of collaboration, but it can contain a confidential brief. The database
already separates its public `summary` from its optional `details`, and stores the roles an
owner needs. The API needed rules for when an idea is visible and which data can leave it.

## Decision

An authenticated developer creates an idea as a private `draft`. Only its author can list,
read, edit, publish or close it through `/v1/me/ideas`.

Publishing moves a draft to `open` and records `published_at`. Any signed-in developer can
then read its public card at `/v1/ideas`, which includes title, summary, stage, author and
roles needed. It never includes `details`. Closing moves an open idea to `closed`, which
removes it from discovery while preserving the owner's record and its publication time.

Role requirements use the existing role slugs and reject unknown, inactive and duplicate
roles. They are available to matching as a reliable team-composition signal.

## Options we considered

- Make open ideas public to the whole internet. Not chosen: the product is a developer
  platform, and even a summary should stay within its signed-in community.
- Return the full brief to anyone who can view an open idea. Not chosen: the brief is
  confidential before a team has accepted the hub agreement.
- Publish directly on creation. Not chosen: a developer needs a safe space to prepare and
  correct an idea before it becomes discoverable.

## Consequences

- The existing hub endpoint can use a published idea without a new database migration.
- Matching can use the public title, summary and required roles. It must not send or expose
  confidential details.
- Reopening a closed idea is not part of this first lifecycle. A later product decision can
  add it with clear rules for existing matches and hubs.
