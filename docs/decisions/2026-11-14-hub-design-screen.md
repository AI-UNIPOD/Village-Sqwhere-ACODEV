# Design sketch on the hub page

## Context

The API now keeps a design sketch for a hub: pieces of the system and labelled links between
them (`GET /v1/hubs/{id}/design`, see `2026-11-14-hub-design-sketch.md` in the API's records). This
is the second phase tool on the web, after the brainstorm notes. This change only reads the
sketch. Adding, editing and deleting pieces and links come in the next pull request.

## Decision

The web frontend's owner chose, on 14 November 2026: pieces and labelled links, drawn by the
page as boxes and arrows, a stacked list on phones, with no dragging, no saved positions and no
live co-editing. We settled the rest:

- **The list is the content, the drawing is an extra.** Every piece is a card with its name, its
  summary and its links in words ("To Payouts API: approves a batch", "From Mobile app: returns
  the status"). That works for a screen reader and at every width. The drawing is one SVG with
  `aria-hidden="true"`, shown only from 768px wide, and not rendered at all below that.
- **The page lays the drawing out itself, from the links.** `design-layout.ts` is a pure function
  with unit tests. A piece nothing points to sits in the first column, and a piece sits one column
  right of every piece that points to it. A link that would close a circle is not counted, and the
  piece made first stays on the left. Nothing is saved, so the same sketch always draws the same.
- **An arrow that crosses a column passes through an empty line in it,** so it never goes over a
  box. The labels are cut by counting characters, because the text is measured nowhere.
- **No drawing library.** The layout is one small function for at most 30 pieces and 60 links, and a
  library would be a new dependency to keep up to date for a drawing nobody can edit yet.
- **No live updates.** The sketch is read when the section shows and on Refresh, as for the notes.
- **Same sections and rules as the notes:** only active members see it, once the hub has reached
  design, and in build, review and an archived hub it stays to read. When the API says the hub
  changed, the page loads the hub again and the section follows it.

## Options we considered

- **A drawing library (a graph or diagram package).** It brings dragging, zoom and layout
  features nobody asked for, and its own accessibility to check.
- **Drawing only, without the list.** A picture is not readable by assistive technology and does
  not fit a phone.
- **Saved positions.** The owner ruled them out for now. They need columns in the API and merge
  rules for two people moving a box.

## Consequences

- The drawing shrinks to the page column (40rem), so a sketch of four or more columns has small
  text. The list holds everything, and the drawing is for the overall shape.
- When a team edits the sketch (the next pull request), the section keeps the same list and
  drawing and adds the forms around them.
- Revisit this when the sketch grows past its caps or when teams ask to place boxes by hand.
