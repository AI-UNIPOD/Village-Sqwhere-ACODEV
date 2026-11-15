# Build tab on the hub page

## Context

The API now keeps a build tab for a hub: who builds which piece of the design sketch, the team's
repository and its latest commits (`GET /v1/hubs/{id}/build`, see `2026-11-15-hub-build-tab.md`).
This is the third phase tool on the web, after the brainstorm notes and the design sketch.

## Decision

The web frontend's owner chose, on 14 and 15 November 2026: the repository is a public GitHub
repository whose address the hub's owner pastes, and the demo bar in the page frame is the only
place that says the demo's content is made up. We settled the rest:

- **The buttons come from the API's flags.** `can_claim`, `can_release`, `can_set_repository` and
  `can_refresh` say what the viewer may do now, so the page never works it out from the phase or the
  role. A flag that is stale (the hub moved on while the page was open) is fixed by the refusal: the
  page loads the hub and the tab again.
- **Freeing a piece asks nothing, removing the repository asks first.** A freed piece can be taken
  again with one press. Removing the repository drops the commits shown, and the owner pastes the
  address again to get it back, so it sits behind a confirm dialog.
- **Links go to github.com only, and none in the demo.** The address and each sha are links that open
  in a new tab (`rel="noopener noreferrer"`) only when the address starts with `https://github.com/`.
  The demo's repository has a name GitHub cannot hold, so for the demo account the same text is not a
  link. The tab adds no sentence of its own about the demo.
- **One structure for the commits at both widths.** The commits are a real `<table>`. From 768px the
  columns show. Below it each row is stacked (the message, then who, when and the sha) and the header
  stays for assistive technology only. The elements carry their table roles, because some browsers drop
  a table's meaning when its display changes. Nothing is written twice for another width.
- **Commit messages and author names are plain text.** They come from GitHub, so they are never
  rendered as markup or links, and a long word wraps.
- **The address is checked in the page first.** The page applies the API's own rule (trailing slash and
  `.git` dropped, `https://github.com/<owner>/<repository>`, at most 200 characters) and shows the field
  error before anything is sent. A 422 from the API is the same field error.
- **Two refreshes, one button.** The API's "Refresh commits" asks GitHub and answers with the whole tab,
  claims included. So the tab is read when the section shows and when Try again is pressed after a
  failed load, and the one visible refresh is Refresh commits. A second "reload this tab" button would sit
  next to it and nobody could tell them apart. The cost: with no repository, or in an archived hub,
  claims made by others show on the next visit. A piece taken first is caught by the refusal, which
  reads the tab again.
- **One change at a time.** While one is on its way its button shows busy and the others do nothing, so
  a read never crosses a write.
- **Where the line sits.** The line that says what happened sits under the pieces, under the repository
  or under the commits' button, whichever the person pressed. When the button that was pressed goes away
  (claim, free, remove), the line takes the keyboard focus. The confirm dialog closes first, because a
  modal dialog does not let the focus go to the page.

## Options we considered

- **A "Reload this tab" button next to Refresh commits.** More to read, and two buttons that both refresh.
  The tab is small and each write corrects it.
- **Two lists for the commits (a table from 768px and a list below it).** The same content twice for
  assistive technology, or one copy hidden from it.
- **A confirm dialog for freeing a piece.** It adds a step to an action that is undone by pressing the
  other button.
- **Links for the demo account.** They would lead to a repository that does not exist.

## Consequences

- The tab shows what the API sends, so a change to who may do what needs no change in the page.
- The commits are as old as the last refresh, and the tab says when that was ("Checked 3 hours ago").
- Revisit the single refresh if teams ask to see each other's claims without a repository.
