# Design sketch: pieces and labelled links the team lists in the second phase

Name: `2026-11-14-hub-design-sketch.md`

## Context

The hub has four phases (`2026-11-14-hub-phases.md`), and each one gets a tool for the team.
Brainstorm came first (`2026-11-14-hub-brainstorm-notes.md`). Design and architecture is second:
the team needs to say which pieces the system has and how they connect, before the build starts.

## Decision

Tanny decided, on 14 November 2026, that a simple version is enough for launch: pieces, each with
a name and a summary, and labelled links between them, drawn by the page as boxes and arrows,
with no dragging, no saved positions and no live co-editing.

The rules of the tools are the build plan's, as for notes: active members only, reading once the
tool's phase has started and in every later phase, writing only in the tool's own phase (`design`)
while the hub is active. The read-only demo reads the sketch the seed wrote.

We added for Tanny to review, because the plan did not say:

- **Any active member may add and correct a piece,** because the sketch is shared and a
  correction should not wait for its creator.
- **The piece's creator or the hub's owner removes it.** The same goes for a link. This is the
  rule notes follow.
- **The caps are 30 pieces and 60 links that are not removed, per hub.** That is enough for the
  boxes and arrows to stay readable on one page. Both writes lock the hub row, so two requests
  cannot take the last place together.
- **Piece names are unique in a hub,** ignoring case and outer spaces, so a link label and an
  arrow always point at one clear box.
- **A link has a direction and a label,** from one piece to another. A link from A to B and one
  from B to A are different links. Two links from A to B are not allowed.
- **Deleting a piece removes its links** in the same transaction, so the sketch never holds an
  arrow with a missing end.
- **A piece has a name of 1 to 60 characters and a summary of 0 to 280,** and a label is 1 to 60
  characters. The text is plain and trimmed.
- **Removal is soft,** with `deleted_at`, as for notes.
- **One read answers everything,** with no paging, because 30 pieces and 60 links are small.

## Options we considered

- **A free canvas with dragging and saved positions.** It needs a drawing model, touch handling
  and merge rules for two people moving the same box. The team needs to list the parts of the
  system, not lay out a diagram.
- **Live co-editing.** The API has no push channel for hubs, and a small sketch does not need one.
  The web will reload the sketch and offer a Refresh button.
- **Skipping this tool.** The design phase would have nothing to show, and the build phase would
  have no list of pieces to claim.

## Consequences

- The web draws the layout itself from the pieces and links, and reads `can_delete` instead of
  working out who may remove what.
- The Build tool will let a member claim a piece. It will need a new decision and a new column or
  table.
- Pieces have no positions or colours. Adding them later needs new columns.
- If a team outgrows 30 pieces or 60 links, the caps are two constants (`MAX_PIECES` and
  `MAX_LINKS`).
