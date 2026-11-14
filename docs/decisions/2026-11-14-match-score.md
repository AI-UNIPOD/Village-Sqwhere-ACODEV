# A match score decides the order

## Context

On 13 November 2026 matching was built without a score: developers were ordered by how many of
an idea's needed roles they are verified in, then by technologies shared with the idea's
author, then by earliest verification (`2026-11-13-role-based-idea-matching.md`), and the match
screens showed the reasons and no number (`2026-11-13-match-screens.md`).

The design system has had a "Match score" component from the start, with four steps. An audit
of the landing page on 14 November 2026 found it promised a score and a "fit" the product did
not have. Tanny's answer was to build what the page describes, and that the score is planned
and wanted. Until it ships, the landing demo shows a simulated one
(`2026-11-14-simulated-match-score-in-demo.md`).

## Decision

Tanny decided these on 14 November 2026.

- **Every match has a score out of 100**, made of four parts:

  | Part | Points | How it is counted |
  | --- | --- | --- |
  | Roles | 40 | 30 for one needed role the developer is verified in, 40 for two or more |
  | Technologies | 20 | 4 for each technology shared with the idea's author, up to 5 |
  | Sectors | 10 | 5 for each sector shared with the idea's author, up to 2 |
  | Meaning | 30 | How close the idea and the developer's profile read (version 2) |

- **The score decides the order.** The rules from 13 November only break ties: for developers,
  the earliest verification, then the id; for ideas, the newest publication, then the id.
- **Scores under 40 still show**, as "Poor match", always with their reasons. Nothing is hidden
  because of its score.
- **The steps are the design system's:** 80 and above Strong, 60 to 79 Possible, 40 to 59 Weak,
  below 40 Poor.

How we build it (the build's own calls, inside those decisions):

- **It is counted, not judged.** One function computes the score from stored facts each time a
  list is asked for, and both match lists use it. No AI model gives a verdict, and version 1
  reads no idea text.
- **A number never travels without its reasons.** The API returns the score with its parts
  (the points and what earned them), and the web shows them under the number.
- **Both lists use the same parts.** For developers who match my idea: the needed roles they
  are verified in, and the technologies and sectors they share with me. For ideas that need
  me: my verified roles the idea needs, and the technologies and sectors I share with its
  author.
- **Version 1 has no meaning part, and says so.** The 70 points that exist are scaled to 100
  and rounded to a whole number. The API marks the score `partial` with `score_version` 1, and
  the card says the score does not yet compare what the idea and the profile say. Examples:
  one role and nothing shared is 30 of 70, so 43 (Weak); one role and three technologies is 42
  of 70, so 60 (Possible); two roles, three technologies and one sector is 57 of 70, so 81
  (Strong).
- **Only verified roles count, as before.** A person is still suggested only when they are
  verified in at least one needed role, so the lowest score in version 1 is 43. "Poor match"
  can only appear once the meaning part exists.
- **The match screens stay neutral.** The score uses its steps' colours. The `--ai` colour is
  not used on the app's match screens, because no AI model takes part.

## Options we considered

- **No score,** as decided on 13 November. True to the data, but the landing page and the
  design system both describe one, and Tanny wants it.
- **Ask an AI model to score each match.** Rejected again: it would send confidential ideas to
  a third party, cost a call for every page of results, and nobody could say why a number is
  what it is.
- **Wait for embeddings and ship the whole score at once.** It would leave the page untrue for
  longer. A partial score that says it is partial is honest today.
- **Leave version 1 out of 70.** The best possible match would read 70, "Possible". Scaling
  keeps the steps meaningful, and the `partial` mark says what is missing.
- **Keep the old order and show the score beside it.** The list would then disagree with its
  own numbers.
- **Hide matches under 40.** Tanny chose to show them with their reasons.

## Consequences

- This replaces "no result has a score" in `2026-11-13-match-screens.md` and the ordering in
  `2026-11-13-role-based-idea-matching.md`. The rest of both records stands.
- The order changes. A developer verified in one needed role who shares five technologies and
  two sectors with the owner (60 of 70) now comes before one verified in two roles who shares
  nothing (40 of 70).
- The match responses gain `score`, `score_version`, `partial`, `breakdown` and
  `shared_sectors`. When the real score is on the match cards, the landing demo's simulated
  scores and its "simulated" line are replaced by the real wording.
- Version 2 adds the meaning part from embeddings of public text only (an idea's title and
  summary, never the brief). Scores will move when it arrives, which is why version 1 is marked
  partial.
- Sectors are the developer's and the author's own. Ideas carry none. If ideas get sectors
  later, the sectors part should compare with the idea instead.
- A developer is more visible with a score and a place on their card, so the "pause matching"
  setting planned before launch matters more.
