# A hub has a phase that its owner starts and moves

## Context

The hub page printed four phase names that all read "Not started". No phase existed in the
database, so the page had nothing true to show. The product promises that a team goes through
brainstorm, design and architecture, build, and review and test, so the API needs to know which
one a hub is in and who can change it.

## Decision

Tanny chose, on 14 November 2026:

- **The owner starts the work with an explicit step, "Confirm the team"**
  (`POST /v1/hubs/{hub_id}/team/confirm`). It is allowed at any team size, with no minimum: the
  owner alone may confirm. Confirming opens brainstorm.
- **Only the owner moves the phase** (`POST /v1/hubs/{hub_id}/phase`), one phase at a time,
  never skipping.

The build plan's default, which Tanny read and did not change:

- **The owner can go back one phase.** Going back from brainstorm is not possible: the team
  stays confirmed.

We added, on the same day, for Tanny to review:

- **Inviting and joining stay open after the team is confirmed**, up to the cap of five active
  members (`2026-11-13-hub-team-cap.md`).
- **An archived hub cannot be confirmed or moved.**
- **A move must go to the phase just before or just after the current one.** Asking for the
  phase the hub is already in is refused too, so a request sent twice moves the hub once.
- **Every change is written to `hub_phase_moves`**, a log that cannot be edited or deleted, in
  the same transaction as the change. Confirming the team is its first row.
- **The hub card carries the phase.** `phase` and `team_confirmed_at` are empty until the team is
  confirmed, and `phases` lists the four phases in order with a state: done, in progress or not
  started.

The four phases and their slugs are `brainstorm`, `design`, `build` and `review`.

## Options we considered

- **A minimum of two active members before confirming**, as the first plan had it. It stops a
  one-person hub from starting, but a developer who wants to begin alone, or whose invitations
  are still pending, would be stuck. The owner alone may confirm instead.
- **No way back.** Simpler, but a hub that moved too early could never return to the earlier
  work. One step back is allowed, and the web asks for a confirmation first.
- **Phases that move by themselves**, for example when a checklist is complete. No phase tool
  exists yet to measure that, and a hub would change phase without anyone choosing it. The owner
  decides.

## Consequences

- The hub page can show real states. The demo hub is seeded in build, so the read-only demo
  shows a phase done, one in progress and one not started.
- The web must ask for a confirmation before it moves a hub back.
- Finishing a hub, the tools of each phase, and members leaving or being removed come in later
  pull requests. Nothing here marks a hub as finished.
- Because joining stays open, a confirmed team can still grow, and the owner is the only person
  who decides when the work moves on.
