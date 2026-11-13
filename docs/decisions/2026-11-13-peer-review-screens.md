# The peer review queue and case screens

## Context

A developer earns a Green Tick after an AI check of their repositories, a five-question AI
interview, and a decision by a peer who holds a Green Tick in the same role. The API for that last
step exists (`/v1/reviews/verifications`). The web app needed the two screens a reviewer uses:
the queue and one case.

## Decision

- **Evidence first, the AI last.** A case reads in this order: repositories, interview,
  repositories check, the AI's report, then the decision. The AI's score comes after the work, so
  it cannot anchor the reviewer. This follows how structured scorecards and pull request reviews
  are run. The queue shows no score for the same reason.
- **The score is a suggestion, not a result.** It is plain text in `--text` with no pass or fail
  word and no colour step, in a card marked with `--ai` and labelled "Written by the AI checker. A
  suggestion, not a decision." It shows one decimal as the API sends it (78.5), not a rounded value.
- **The reviewer judges the work, not the person.** The API sends no name and the screens add none.
- **Notes are required for both decisions, up to 2000 characters, and stay in the form until
  the reviewer confirms.** The applicant reads them, so a plain "no" teaches nothing. Nothing is
  stored on the device and nothing is sent before the confirm.
- **Both decisions confirm in a native dialog** that restates the consequence, because neither can
  be taken back. Focus starts on "Go back".
- **Everything inside `ai_result`, and the applicant's answers, is plain text.** Only addresses
  that start with `https://github.com/` become links; anything else stays text. Unknown flag codes
  are shown as they came, in mono.
- **Every part of `ai_result` may be missing.** A missing part is left out; a missing report
  says so in one line and the form still works.
- **A case that answers 404 (decided by someone else) or 422 (a mistyped id) is shown as no longer
  open**, the same screen as after a 404 on the decision.
- **"Waiting" counts from when the interview finished** (`completed_at`, else `created_at`).
  Minutes and hours are counted whole, days are rounded, so 47 hours reads "2 days".
- **"Attempt N of 3"** keeps the limit in the copy: the API does not send it.

## Options we considered

- **Showing the AI score in the queue** to help sort: rejected, it anchors the reviewer before
  they read anything.
- **Letting a pass go through without notes:** rejected, the applicant would learn nothing.
- **A pass or fail colour on the score:** rejected, it reads as a verdict from the AI.
- **A confirm step only for "Do not pass":** rejected, a pass is also final and gives a Green Tick.

## Consequences

- The queue and the case reload from the API on each visit; there is no cache.
- If the API starts to send the attempt limit, replace the "3" in the copy.
- Nothing links to `/{lang}/reviews` yet: the village home should add it for developers with a
  Green Tick.
- The French copy needs a native review before launch, like the other screens.
