# The demo draws no link to GitHub from a username

## Context

A developer's village, profile and public page link their username to
`https://github.com/<username>`. That is right for a real account: the username is the GitHub
login the developer signed in with.

The demo's people are written by the seed, and their usernames hold an underscore on purpose
(`aminata_ndiaye`), which a GitHub login never has, so that no real developer can ever own one
of those names. The same choice made every "See them on GitHub" button in the demo open a page
that does not exist. A sweep of the demo on 15 November 2026 found seven such links.

Tanny decided on 15 November 2026 that everything in the demo must read like the real product
(`2026-11-15-one-demo-line-no-other-labels.md`).

## Decision

For the demo account, a username is plain text: no link on the village card or the profile, and
no "See them on GitHub" button on a person's page. The demo account only ever sees the demo's
own people (the wall in the API), and they are the only people it sees, so the page asks one
thing: is the viewer the demo account (`is_demo` on `/v1/me`).

The same change replaces `https://example.com` in the feed's "start the link with https" error
with an address shaped like the ones the other forms give as an example.

## Options we considered

- **Give the demo's people real-looking logins without an underscore.** Then a link could open
  a real stranger's GitHub profile under a made-up person's name.
- **Have the API send a GitHub address, or none, for each person.** More honest in the long run
  (a developer may sign in with Bitbucket one day), but it changes three responses for a need
  the viewer's own flag already answers.

## Consequences

- A visitor in the demo cannot follow a person to GitHub. Nothing on the page says why; the
  demo bar already says the people are made up.
- When sign-in with another provider arrives, the link must come from the person's linked
  account, not from the username, and this rule goes with it.
