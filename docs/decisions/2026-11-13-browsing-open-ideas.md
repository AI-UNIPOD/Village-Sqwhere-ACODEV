# Browsing open ideas, with no "ask to join"

## Context

The API lists open ideas to signed-in developers and shows one idea's public card
(`GET /v1/ideas`, `GET /v1/ideas/{id}`). A developer with no idea of their own had no way to
see what others are building. The API has no request to join: the idea's owner invites, and
matching only suggests developers whose role is verified.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **`/{lang}/ideas` lists open ideas** and `/{lang}/ideas/view?id=` shows one. "Open ideas" and
  "Your ideas" are two tabs of one place.
- **The pages show the public part only:** title, summary, stage, roles needed, author. They
  never ask the API for a brief, and all of it is rendered as plain text.
- **One line of personal fit, and it is exactly true:** "Needs your role" appears when one of
  the idea's role slugs is one of the developer's own. If that role is not verified, the line
  says how to be suggested to the owner and links to verification. Nothing is scored or
  ranked in the browser.
- **No button that pretends.** The idea page explains how joining works in three lines, then
  offers the one step that helps this developer: edit (their own idea), set up a profile
  (no role), verify the role (a needed role, not verified), or nothing but a plain sentence
  (verified already, or the idea needs other roles).

## Options we considered

- **An "I'm interested" button that saves nothing:** a dead end that looks like a promise.
- **Sorting by fit in the browser:** only the first page is loaded, so the order would be
  wrong, and the matcher is the place for ranking.
- **Showing the author's other ideas or a profile page:** there is no public profile route yet.

## Consequences

- When the matcher's routes and invitations reach `main`, the fit line and the idea page are
  where "your matches" and "you are invited" belong.
- A developer's own open ideas appear in the list, marked "Yours", and open in the composer.
