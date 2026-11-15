# The demo's people are chosen for a range of scores, with and without the meaning part

## Context

The demo shows three developers on the visitor's idea and two ideas on "For you", chosen so the
scores spread over the steps: one strong match, one possible, one weak. They were chosen while
the score had three parts scaled to 100 (83, 67 and 43).

Since `2026-11-15-match-score-meaning.md` a match whose idea and developer have both been
embedded gets the fourth part, counted from how close the two read, and the score becomes the
plain sum of the four. Measured on 15 November 2026 with the real model, the demo's people read
at 0.72 to 0.73 against the visitor's idea, worth 5 to 8 of the 30 points: the three scores
would have become 64, 55 and 35, with no strong match left.

Tanny's rule that day: everything in the demo reads like the real product. A demo whose best
match is "possible" does not show what the matcher is for.

## Decision

The people's stacks, sectors and bios, and one idea's summary, are changed so the range holds
both ways. Measured against the visitor's idea "Naira payouts that never pay twice":

| Who | What changed | Without the meaning part | Similarity | With it |
|---|---|---|---|---|
| Aminata | Docker and PostgreSQL in her stack; a bio that says she builds mobile payments for co-operatives and tontines | 94, strong | 0.775, 19 points | 85, strong |
| Tendai | Agritech among his sectors; a bio that says he keeps payment services running | 74, possible | 0.765, 16 points | 68, possible |
| Uwase | Node.js in her stack; Agritech among her sectors | 56, weak | 0.721, 5 points | 44, weak |

On "For you", the visitor's profile against each idea:

| Idea | What changed | Without | Similarity | With |
|---|---|---|---|---|
| Tendai's uptime watch for mobile money agents | a summary that says what the service does | 74, possible | 0.759, 15 points | 67, possible |
| Uwase's gradebook for schools in Kigali | nothing | 56, weak | 0.748, 12 points | 51, weak |

A rerun of the seed brings an older demo to the same state: bios are written on every run,
missing technologies and sectors are added, and the idea keeps its row and gets the new summary
(which drops its vector, so the worker embeds it again).

## Options we considered

- **Leave the people as they were.** True to the first choice, but the demo would show 64, 55
  and 35 once compared.
- **Write vectors for the demo by hand, to force the numbers.** The demo would then show scores
  the model never gave.
- **Keep the demo's people out of the embedding.** The demo's cards would keep saying "Meaning:
  Not compared yet" on a site where everyone else is compared.

## Consequences

- The numbers with the meaning part are what the model gave on one day. A newer model, or a
  change to the band in the score, can move them by a few points; each has four points or more
  to spare before it changes step.
- Without vectors the tests pin 94, 74 and 56. With vectors nothing is pinned, because no test
  calls the model.
- Aminata's and Tendai's bios now say what they build. Their posts and hub chats must stay in
  step with that.
