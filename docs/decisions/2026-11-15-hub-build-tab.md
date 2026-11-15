# Build tab: who builds which piece, and the latest commits of the team's repository

Name: `2026-11-15-hub-build-tab.md`

## Context

The hub has four phases (`2026-11-14-hub-phases.md`), and each one gets a tool for the team.
Brainstorm notes came first (`2026-11-14-hub-brainstorm-notes.md`) and the design sketch second
(`2026-11-14-hub-design-sketch.md`). Build is third: the team has listed the pieces of the
system, so it needs to say who builds which piece, and to see its code moving.

## Decision

Tanny decided, on 14 November 2026, that the team's repository is a public GitHub repository
whose address the hub's owner pastes. The platform does not create repositories and needs no new
secret.

The rules of the tools are the build plan's, as for notes and the sketch: active members only,
reading once the tool's phase has started (`build`) and in the later phase (`review`), and the
read-only demo reads the content the seed wrote.

We added for Tanny to review, because the plan did not say:

- **A piece has at most one holder, and a member may hold several.** Claiming a piece you
  already hold changes nothing, so a request sent twice is safe. A piece held by someone else
  is refused with `PIECE_CLAIMED`.
- **The holder or the hub's owner frees a piece.** Freeing a piece nobody holds is also fine.
- **A claim of someone who left or was removed reads as free.** The API reads the membership
  status when it answers, so the leave and remove routes did not change. Anyone active may then
  claim the piece. The old claim stays in the row until someone claims the piece again.
- **Claiming, freeing and setting the repository work only in build,** while the hub is active.
  In review they are closed (`PHASE_CLOSED`).
- **Any active member may refresh the commits, at most once a minute per hub.** A refresh also
  works in review, because the team keeps committing fixes while it reviews. The wait protects
  the server's GitHub allowance, which every hub shares.
- **The commits are a replaced copy of the latest 20** of the default branch, kept in
  `hub_commits`. Each has its `sha`, the first line of its message (cut to 200 characters), the
  author's name as the commit records it (cut to 100) and its commit date. Setting, changing or
  clearing the repository deletes the copy, and the rows are really deleted: they are public
  data that GitHub gives again, unlike notes and pieces, which are removed softly. Setting the
  address the hub already has changes nothing, so it is no way round the wait.
- **No new secret.** The refresh uses the optional `GITHUB_API_TOKEN` the API already has for
  checking repositories in verification. Without it, GitHub allows about 60 requests an hour
  from the server.
- **Commit text is untrusted.** Messages and author names are stored as plain text without null
  characters, cut as above, and never interpreted. The web must show them as text.
- **Setting the address does not call GitHub.** A wrong address shows up at the first refresh as
  `REPOSITORY_UNAVAILABLE`, and the stored commits stay as they were when GitHub cannot be read.
- **A refresh does not hold the hub row lock while it waits for GitHub,** which has 10 seconds to
  answer. It checks, fetches, then locks and checks again before it writes. If the owner changed
  the address in between, the commits are dropped with `REPOSITORY_CHANGED`.
- **The commit date is the date GitHub lists for the commit,** which is the one it orders the list
  by, not the older date a rebased commit keeps as its author date.
- **A repository address is at most 200 characters,** so the owner cannot store a long text.

## Options we considered

- **The platform creating the repository.** It needs a GitHub app or a token with write access
  and a place to hold it, and the team loses the choice of where its code lives. Pasting an
  address needs nothing.
- **A webhook from GitHub.** The commits would arrive at once, but each team would have to set a
  webhook up, the API would need a public endpoint and a shared secret, and a missed delivery
  would leave the list wrong with no way to fix it. A refresh button is enough for a list of 20.
- **Reading private repositories.** It would need each owner to give the platform a token, which
  is a secret to store and protect, for a first version that does not need it. The repository
  must be public.

## Consequences

- The web can show a piece with its holder and a button read from `can_claim` and `can_release`,
  and a commits list with a Refresh button read from `can_refresh`, without working out the rules.
- Everyone on the platform shares one GitHub allowance. Without `GITHUB_API_TOKEN` about 60
  refreshes an hour are available to all hubs together, and a refresh then fails with
  `REPOSITORY_UNAVAILABLE`. Setting the token raises the allowance and needs no code change.
- The copy is only as fresh as the last refresh, and nothing refreshes it by itself.
- Pull requests, branches, diffs and private repositories are not shown. Adding them needs a new
  decision.
- The review checklist and finishing a hub come in later pull requests.
