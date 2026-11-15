# Review checklist on the hub page

Name: `2026-11-15-hub-review-screen.md`

## Context

The API keeps a review checklist for a hub: checks written against each piece, a teammate who
ticks them, and the owner who finishes the hub (`GET /v1/hubs/{id}/review`, see
`2026-11-15-hub-review-checklist.md`). This is the fourth and last phase tool on the web, after the
brainstorm notes, the design sketch and the build tab.

## Decision

The web frontend's owner chose, on 15 November 2026, that the demo bar in the page frame is the
only place that says the demo's content is made up. We settled the rest:

- **The buttons come from the API's flags.** `can_add`, `can_finish` and, on each check, `can_tick`,
  `can_untick` and `can_delete` say what the viewer may do now. The page never works out who built a
  piece or who ticked a check. A stale flag is fixed by a refusal that says the checklist or the hub has changed: that refusal reads it again. The refusals about who may do what (own piece, not the ticker, not the author, the limit, not the owner) only say the sentence.
- **Buttons with state text, not checkboxes.** A check shows "Ticked by Amina, 3 hours ago" or "Not
  ticked yet" as an icon and words, and a Tick or Untick button changes it. A bare checkbox would
  leave its meaning to its colour and to a label that says nothing of who ticked it, and a screen
  reader would hear "checked" with no name. Each button's name holds the check's text, because a
  piece can hold ten of them.
- **Delete and finish ask first, tick and untick do not.** Deleting a check cannot be undone, and
  finishing the hub cannot be undone either. A tick is undone by pressing Untick, so a dialog would
  only add a step to something people do often. Both dialogs close before the change is sent: the
  button that was pressed is gone afterwards, and a modal dialog would not let the status line take
  the keyboard focus.
- **The checklist is read again after each change.** The answer to a tick replaces the check at once,
  and the page then reads the checklist so `can_finish` and the owner's line follow the other
  checks (ticking the last open check makes Finish the hub appear). If that second read fails the
  row is still right, and a later refusal fixes the rest. The checklist is also read when the
  section shows and when Try again is pressed, as in the build tab. There is no refresh button: the
  checklist changes only when a teammate ticks, and each change corrects it.
- **What a finished hub shows.** The checklist stays to read, with no field and no button, under a
  line that says when the hub was finished. In the phases the last one says "Finished" in place of
  "In progress", and the owner's move back is not offered, because the API refuses it with
  `HUB_FINISHED`. The finish answer is the hub card, so the page uses it as it is instead of asking
  for the hub a second time.
- **The owner is told why there is no Finish button.** While a check is open the owner reads "Every
  check must be ticked before the hub can be finished." A member reads nothing: it is not theirs to do.
- **The status line sits under the piece that was changed.** One at a time, so the focus has one
  place to go. A line about a piece that is no longer in the checklist is said with the checklist as
  a whole.
- **Refusals.** A refusal that says the checklist was not as shown (a check ticked by someone else
  first, or gone) reads it again. A refusal that says the hub moved on (finished, archived, left the
  phase, no longer a member) loads the hub again too, so the section and the phases follow it. The
  demo's refusal returns early, because the frame already announces it.
- **Checks are plain text.** They are written by the team, so they are never rendered as markup, and a
  long word wraps.

## Options we considered

- **A checkbox for each check.** Familiar, but it tells nothing about who ticked and when, and its
  state would rest on the box alone. A button and a line of words say both.
- **A confirm dialog for ticking.** A tick is one press from undone, so the dialog would only slow the
  people who read each piece and tick its checks one after another.
- **Working out `can_finish` in the page from the checks.** It would be a second copy of the API's
  rule, and it would drift. One more read after each change costs a request and keeps one rule.
- **A refresh button.** Two ways to read the same list. The checklist is read when the section shows
  and after each change.

## Consequences

- The page changes with the API's rules and needs no change when a rule does.
- Each change costs two requests: the change and the read after it.
- A hub cannot be reopened after it is finished, because the API has no way back. The phases and the
  checklist say so by offering nothing to press.
- Revisit the read after each change if teams ask for a checklist that updates on its own.
