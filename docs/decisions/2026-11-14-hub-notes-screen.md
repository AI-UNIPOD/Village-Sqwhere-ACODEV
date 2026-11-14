# Brainstorm notes on the hub page

## Context

The API now keeps sticky notes for a hub's brainstorm phase (`GET`, `POST` and `DELETE` on
`/v1/hubs/{id}/notes`). This is the first of the four phase tools on the web. There was no place
for a tool on the hub page yet.

## Decision

The web frontend's owner chose, on 14 November 2026:

- **The notes sit on the hub page, under the Phases section**, as their own section
  (`id="brainstorm"`). They do not get a page of their own, and the page gets no tabs, until more
  tools exist and the page needs the room.
- **Who sees what.** Only an active member of a hub whose team is confirmed sees the section, and
  no request is made for anyone else. While the hub is active and in brainstorm, a member can add
  notes, and the note's author or the hub's owner can delete one. After brainstorm, or in an
  archived hub, there is no form and no delete button, and one line says the notes stay to read.
- **No live updates.** The list is read when the section shows and when the person presses
  Refresh, which says it is done to a screen reader. A second writer's note shows up on the next
  Refresh.
- **Delete asks first.** The note is removed for everyone in the hub and it cannot be undone, so the
  icon button opens the confirm dialog. Its name says whose note it is.
- **The page writes the refusal sentences itself.** A hub that moved on (`PHASE_CLOSED`,
  `TEAM_NOT_CONFIRMED`, `HUB_ARCHIVED`) or a person who left (`NOT_HUB_MEMBER`) makes the page load
  the hub again, so the section fits it. The API's English text is never shown.
- **The add button is a quiet one**, as the phase buttons are: the owner's invite form above holds
  the page's one main button.

## Options we considered

- **A tab or a page for the notes:** one tool does not need navigation, and each tab would be
  rewritten when the other tools arrive.
- **Live updates (polling or a socket):** the API has none, and a list that moves while someone
  reads or types is harder to use than one they refresh.
- **Deleting without a dialog:** a stray tap on a phone would remove a teammate's note for good.

## Consequences

- When the design, build and review tools arrive, the page has to decide between more sections and
  tabs. Revisit this then.
- A hub holds at most 200 notes, so the whole list is read at once. If that limit grows, the list
  needs a "show more" button.
