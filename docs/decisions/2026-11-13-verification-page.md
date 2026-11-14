# The role verification page

## Context

The API can verify a claimed role in three stages (an AI check of public repositories, an AI
interview, then a peer's decision), with three attempts for each role. The web app had no
screen for it. Matching only suggests developers whose role is verified, so this page is how a
developer becomes someone an idea's owner can be shown.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **One page, `/{lang}/verification`, for the main role only.** It shows exactly one state: no
  role yet, a start form, an attempt in progress, or the Green Tick earned. Other roles wait
  for the profile page.
- **The attempt in progress is a three-step list** (repositories check, interview, peer
  review), each step done, now or later, in the look of the village's steps. Work the AI is
  doing uses the AI colour. Waiting on a person does not.
- **Waits say how long and that leaving is safe.** The page asks the API again every 5 seconds
  only while the AI is working, not while the tab is hidden, and once when the tab comes back.
  A peer review can take days, so it is not polled.
- **Consent before anything is read.** The form needs a ticked box that says public code is
  read by an AI checker and that interview answers are kept. Private repositories are never
  read. Changed on 2026-11-14: the box and the page now say what the checker really looks
  at (file names, languages, tests and recent commit messages, not the code itself), and that
  only public repositories can be checked.
- **Repositories go in one text box, one address per line,** checked in the browser by the
  API's own rule (`https://github.com/owner/repo`, 1 to 10, no duplicates), with the error
  naming the first bad line.
- **A failed attempt shows the reviewer's notes first,** then how many attempts are left, then
  the form. Earlier attempts stay listed with their outcome.
- **Stopping an attempt asks first** and says it counts as one of the three.
- **The API's English error text is never shown.** The page branches on error codes and says
  its own words in both languages.

## Options we considered

- **A page for every claimed role:** more to read for a developer who has one role, and the
  API's attempt limit is per role anyway. The profile page can add the others.
- **Polling during peer review:** a request every few seconds for days, for a change a person
  makes once.
- **Showing the AI's score to the developer while a peer is still deciding:** the AI suggests
  and a person decides, so a number shown early would read as a verdict.

## Consequences

- The interview is a separate screen (`/{lang}/verification/interview`), linked from the
  second step.
- The API ends an attempt for good when the interview's connection drops. The page warns
  before the interview starts. A way to resume would need an API change.
- The product brief asks for two peer reviewers. The API records one decision today.
