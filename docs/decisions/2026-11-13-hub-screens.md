# Creating a hub: read, then sign, on one page

## Context

The API creates a hub from an open idea in one request: the owner names it, sets its terms
and signs the current agreement, and all three are saved together (`POST /v1/hubs`). Terms
can never change afterwards, and the signature is recorded with the hash of the exact text.
The web app needed the screen for it, a page for one hub and a list of your hubs. Inviting
members and the four phases' tools have no API on `main` yet.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **One page in the order a person decides:** the hub's name, the terms, the agreement, the
  signature. Each part that cannot be undone says so before its fields.
- **The agreement is shown as the server sends it:** its own title and version, and its text
  in a region that scrolls beside the signature. A small function turns its Markdown headings,
  lists and paragraphs into elements and shows everything else as plain characters. No
  Markdown library, and nothing from the text can run as markup.
- **Placeholder text is called out.** While the published agreement's title contains "TEST", a
  warning above it says it is not a legal agreement. Changed on 2026-11-15: the warning is
  removed (`2026-11-15-one-demo-line-no-other-labels.md`).
- **Three things are needed to sign:** a ticked "I have read" box, a typed legal name, and a
  confirm dialog that says back the hub's name, the ownership choice and the name signed.
- **The request carries the text that was shown:** the template id and hash loaded with the
  page. If the API answers that the agreement changed, the page loads the new text, clears
  the "I have read" box, keeps everything else typed, and asks again. It never signs a text
  the person did not see.
- **Notes are required for "owner majority" and "custom"** and optional for an equal split,
  because those two choices mean nothing without them.
- **The hub page says what exists:** the idea, the owner, how many of five members, the terms
  as signed, the agreement version and the four phases, all "not started". No invite button
  and no phase tools until their routes exist.
- **An open idea's card links to its hub** ("Create the hub", or "Open the hub" when it has
  one), found by matching the developer's hubs to their ideas.

## Options we considered

- **Signing in a second step after creating the hub:** the API saves the hub, the signature
  and the membership together or not at all, and a hub without a signed owner must not exist.
- **Requiring a scroll to the end of the agreement before the box can be ticked:** it blocks
  keyboard and screen reader users who read another way, and proves nothing. The tick and the
  typed name are the record.
- **A Markdown library for the agreement:** more weight, and a way for text in the database to
  become markup on a signing page.

## Consequences

- The real agreement must be published as version 2 before launch. The warning disappears
  once its title no longer contains "TEST".
- The page needs the idea's owner and an open idea. Every refusal the API can give has its own
  screen and a way on.
- The ideas page first read only the first 20 hubs to find an idea's hub. It now reads every
  page of them (`loadHubsByIdea`), since the API cannot look a hub up by its idea.
- Invitations, the member list, the confidential brief for members and the phases arrive with
  the hub membership routes.
