# Review checklist: checks against each piece, and the owner finishing the hub

Name: `2026-11-15-hub-review-checklist.md`

## Context

The hub has four phases (`2026-11-14-hub-phases.md`), and each one gets a tool for the team.
Brainstorm notes, the design sketch (`2026-11-14-hub-design-sketch.md`) and the build tab
(`2026-11-15-hub-build-tab.md`) are done. Review is the fourth: the team has built its pieces, so
it needs to say what each piece must do, and to see that a teammate has looked at it. Then the
hub's owner calls the work finished.

## Decision

The build plan says this tool has checks per piece, that nobody ticks a check on their own piece,
which is what makes "teammates read each other's work" true, and that the owner can finish the
hub. The rules of the tools are the plan's, as for the other three: active members only, reading
once the tool's phase has started (`review`), writing only in that phase while the hub is active,
and the read-only demo reads what the seed wrote.

We added for Tanny to review, because the plan did not say:

- **A builder cannot tick a check of their own piece, but can add checks to it.** Ticking is the
  proof that someone else looked, so the builder ticking it would prove nothing. Adding a check is
  only saying what to look at, and the builder knows best where the risk is. The owner is held to
  the same rule for a piece they build. A piece nobody holds can be ticked by any member, and a
  holder who left or was removed counts as nobody, as in the build tab.
- **The member who ticked a check, or the hub's owner, can untick it.** A tick made by mistake
  must be undoable, and the owner can undo any tick so one absent member cannot block the team.
- **The member who wrote a check, or the hub's owner, removes it,** ticked or not. Removal is
  soft, with `deleted_at` and `deleted_by`, as for notes and pieces, so the history stays.
- **A piece keeps at most 10 checks that are not removed.** A checklist of more than ten lines per
  piece is a sign the piece is too big. The write locks the hub row, so two requests cannot both
  take the tenth place. The limit is one constant (`MAX_CHECKS`).
- **A check is plain text of 1 to 200 characters,** trimmed.
- **Finishing needs every check ticked.** The owner may not finish while a check that is not
  removed is open, so a finished hub means the team agreed on every line. The answer says how many
  are open. Checks of a removed piece are not counted.
- **A hub with no checks may be finished.** It is the owner's call: some teams will not use the
  checklist, and the platform should not force them to write empty checks to finish.
- **There is no way to undo a finish in this version.** A finished hub keeps its checklist
  readable but changes no check and no phase: `HUB_FINISHED` refuses the writes and the move back
  to build. Undoing it needs a rule about who may reopen a hub and what happens to the ticks, and
  nobody has asked for it yet. It is one column (`hubs.finished_at`), so a later decision can add
  a route.
- **The hub card carries `finished_at`,** so the hub page can say a hub is finished without
  reading the checklist.
- **The API answers with flags,** `can_add`, `can_finish` and `can_tick`, `can_untick` and
  `can_delete` on each check, so the screen never works the rules out. `open_checks` is counted by
  the API for the same reason.
- **The database keeps a piece and its checks in one hub** with a composite foreign key, as for
  links. It cannot know who holds a piece when a check is ticked, because claims can change, so
  the API enforces the own piece rule.

## Options we considered

- **Letting the builder tick their own checks.** It would make the checklist a to-do list for one
  person and say nothing about review.
- **A required number of ticks, or ticks by two people.** The team is at most five people. One
  teammate reading each piece is enough for a first version.
- **Finishing with open checks, with a warning.** The warning would be clicked through. A finish
  that always means every check is ticked is simpler to trust.
- **Hard delete of checks.** It would leave nothing to look at if a check disappeared after being
  ticked. Soft removal costs one column.
- **Reopening a finished hub.** See above: not needed yet, and it needs its own rules.

## Consequences

- The web can show a checklist per piece and read every button from a flag, and show a hub as
  finished from `finished_at`.
- If the owner holds every piece and nobody else is active, nobody can tick, so the owner cannot
  finish a hub that has checks. The owner removes the checks, then finishes.
- A finished hub is final until a later decision adds a way back.
- A piece cannot be given more than 10 checks, whatever the team wants.
