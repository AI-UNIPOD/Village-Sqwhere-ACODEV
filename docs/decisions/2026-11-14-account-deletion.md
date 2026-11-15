# Deleting an account

## Context

A developer could not delete their account. The schema keeps user content with `deleted_at`,
and agreement signatures are append-only, so the user row cannot simply be removed. Every
signed-in route already refuses a user with `deleted_at`. Tracker row 14 asks for
`POST /v1/me/deletion`. On 2026-11-14 Tanny chose to anonymise the account and keep its
content.

## Decision

- The person types their username to confirm.
- The user row stays, with `deleted_at` set. The username becomes `deleted-` plus 12 characters
  of the id, so the GitHub name is free for a new account. The display name becomes
  "Deleted account", and the names, email, avatar, bio and country are cleared.
- The GitHub link, technologies, sectors and feed topics are removed. Signing in with the same
  GitHub account later makes a new, empty account.
- Posts, comments, likes and signatures stay, shown under "Deleted account".
- Open ideas are closed, so nobody asks to join something no one will run.
- Deleting is refused while an active hub the person owns has other active members. A hub's
  owner must be the idea's author, so the hub cannot change hands, and a team should not lose
  its owner without warning. A hub with only its owner is archived.
- Elsewhere, an active membership becomes `left`, an invitation is removed (as when an owner
  withdraws it) and a request is withdrawn.
- Verifications in progress or waiting for review are abandoned, so no reviewer gets a case
  nobody will hear back about.

## Options we considered

- Anonymise and also remove posts, comments and ideas. Not chosen by Tanny: conversations would
  lose their replies' context.
- Hard delete. Not possible without changing the schema: signatures and memberships point to
  the user and are kept as evidence.
- Hand the hub to another member. Not possible today: the schema ties the owner to the idea's
  author.

## Consequences

- Finished verification records (the repositories check, the interview and the report) stay for
  the review audit. They hold the person's GitHub work and answers. Tanny should decide whether
  they are erased too, or after how long.
- An account cannot be restored: the person signs in again as a new account.
- The web side, a confirmation screen, is still to build.
