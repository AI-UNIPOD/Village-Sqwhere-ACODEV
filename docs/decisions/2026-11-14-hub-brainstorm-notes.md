# Brainstorm notes: short sticky notes the team writes in the first phase

Name: `2026-11-14-hub-brainstorm-notes.md`

## Context

The hub has four phases (`2026-11-14-hub-phases.md`), and each one gets a tool for the team.
Brainstorm is first. The team needs a place to drop short ideas, questions and doubts about the
product, before design and build. This is the first of the four tools.

`002-schema.sql` already has `hub_messages`, a flat chat with messages up to 10,000 characters,
quote-replies and edits. It is a different tool: notes are short, never edited and never
quoted, so they get their own table, `hub_notes`, and chat is left free for later.

## Decision

Tanny set the rules of the tools in the build plan: active members only, reading in every phase
once the tool's phase has started, writing only in that tool's own phase. For notes:

- **A note is plain text of 1 to 280 characters,** counted as characters, so an accented or
  non-Latin note is not cut short. The text is trimmed. Nothing is rendered from it.
- **Who reads and when.** Active members who signed the agreement, in every phase once the team
  is confirmed. Invited, requested and declined people see nothing. The read-only demo reads the
  notes the seed wrote.
- **Who writes and when.** Active members add notes, only while the hub is active and in
  `brainstorm`. The note's author or the hub's owner removes one, in the same window. After the
  owner moves the hub on, the notes stay readable and cannot change.
- **Notes are confidential to the team.** Only the three note routes return them. The hub card
  does not change.
- **Removal is soft.** A removed note keeps its row with `deleted_at` and is never listed. The
  team's early thinking may matter later, and a row can be put back by hand.
- **The cap is 200 notes that are not removed, per hub.** Both writes lock the hub row, as the
  phase routes do, so two requests cannot take the 200th place together, and a note cannot be
  added while the owner moves the phase.
- **No live updates.** The repository has no WebSocket or Redis for hubs. The web will reload
  the list and offer a Refresh button.

We added for Tanny to review, because the plan did not say: the 280 and 200 limits, the
`NOTE_NOT_FOUND` code for a note that is unknown, removed or in another hub, and a page size of
50 by default, so a full board loads in four requests.

## Options we considered

- **A free canvas with dragging.** Positions, sizes and colours need a drawing model, conflict
  handling and a touch story for phones. The team needs to capture ideas, not lay out a wall.
- **Live co-editing.** It needs a push channel and merge rules that the API does not have, and
  short notes that nobody edits do not need them.
- **Reusing `hub_messages`.** Its limit of 10,000 characters and its edit and reply columns do
  not fit a sticky note, and notes would mix with chat.
- **No cap.** One member could fill a hub with thousands of notes, and the list would stop
  being something a team can read in one go.
- **Deleting rows.** Simpler, but nothing could be recovered.

## Consequences

- The web can build a board that lists, adds and removes notes, reloads on a Refresh button,
  and reads `can_delete` instead of working out who may remove what.
- Notes are plain text. A later tool that groups, edits or reacts to notes will need a new
  decision and new columns.
- If a team outgrows 200 notes, the cap is one constant (`MAX_NOTES`).
