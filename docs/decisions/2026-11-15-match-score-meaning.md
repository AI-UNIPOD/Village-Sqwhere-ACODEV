# The meaning part of the match score, and similar ideas

## Context

The match score has a "meaning" part worth 30 of 100 points. Until now it read "not compared
yet", and the other 70 points were scaled to 100 (`2026-11-14-match-score.md`). The worker now
keeps a vector for every open idea and every verified developer
(`2026-11-15-embeddings-on-gemini.md`). This decision is about reading those vectors: how a
similarity becomes points, and what else the vectors are good for.

## Decision

The shape of the score is the one set on 14 November 2026 (`2026-11-14-match-score.md`). The
numbers below were chosen on 15 November 2026, from a measurement.

**What was measured.** One real request to the model on 15 November 2026, with the texts the
worker sends. Cosine similarity of unit vectors:

| Pair | Similarity |
| --- | --- |
| The same idea written in English and in French | 0.96 |
| Two different ideas | 0.75 to 0.83 |
| Two ideas that share a subject (a payout service and a payroll for traders, 0.82; a tontine with SMS reminders and a school gradebook with SMS summaries, 0.83) | 0.81 to 0.83 |
| Two unrelated ideas | 0.75 to 0.78 |
| An idea and a developer's profile | 0.71 to 0.82 |

For each of seven ideas, the profile that fits best was the highest of six. A Swahili
tokenizer and a Swahili NLP engineer read 0.82, a school gradebook and a frontend developer who
builds for schools 0.81, a tontine in Dakar and a mobile developer in Dakar 0.78, a payout
service and a payments backend engineer 0.76. Profiles that do not fit sat at 0.71 to 0.74. The
numbers are close together and the order is right.

**The score, version 2.**

- The meaning points are `round(30 * clamp((similarity - 0.70) / (0.82 - 0.70), 0, 1))`, a
  whole number from 0 to 30, where `similarity` is 1 minus the cosine distance of the idea's
  vector and the developer's vector. 0.70 and 0.82 are constants in `match_score.py`.
- When both vectors exist the score is the plain sum of the four parts out of 100, `partial` is
  false and `score_version` is 2.
- When either vector is missing nothing changes: version 1, the 70 points scaled to 100,
  `partial` true, `breakdown.meaning.points` null. A list can hold both kinds, and each row
  carries its own `score_version`.
- Both lists are ordered by the score shown. The steps (Strong from 80, Possible from 60, Weak
  from 40, Poor under 40) do not change.
- The SQL that orders the lists repeats the Python step for step on double precision numbers,
  and rounds half up with `floor(x + 0.5)` in both, so the two cannot differ by one point.

**Similar ideas.**

- Each match carries `similar_idea`, `{"id", "title"}` or null. On "who matches my idea" it is
  the developer's own open idea that reads closest to mine. On "For you" it is my own open idea
  that reads closest to the listed idea. Either way only when the similarity is at least 0.80.
  Drafts, closed ideas and deleted ideas never show.
- `GET /v1/ideas/{idea_id}/similar` gives up to 5 other open ideas at 0.80 or more, closest
  first, for an open idea the caller may read. An idea with no vector yet, or with nothing
  close, gives an empty list.
- No similarity number is returned anywhere. Being in the list is the fact.
- Both rules respect the demo wall, and nothing here writes or sends text anywhere.

## Options we considered

- **Read the similarity as a percentage.** Rejected. Unrelated ideas already read 0.75, so
  every pair would get about 22 of the 30 meaning points, and the best fit would get only 3
  more. The useful signal is in a band about 0.12 wide, so the score stretches that band.
- **A band from the data of the day, such as the lowest and highest in the current list.**
  Rejected. A number would then change when other rows appear, and a score must be the same
  every time it is asked for.
- **0.75 as the "reads close" line for ideas.** Unrelated ideas sat as high as 0.78, so it would
  name pairs that share nothing. 0.80 sits above them and below the related pairs (0.81 to
  0.83), and it is the same line for both uses.
- **Only version 2, and a zero where a vector is missing.** Rejected. A developer who was just
  embedded would look worse than one who was not, and every idea waiting for its vector would
  drop 30 points. The two versions live side by side and each row says which it is.
- **Showing the similarity beside "similar".** Rejected. 0.83 reads as "83% alike", and it does
  not mean that.

## Consequences

- Scores move for pairs that have both vectors. A developer verified in one role with nothing
  shared and a vector at the top of the band scores 60, where version 1 gave 43.
- A list mixes versions while vectors are still being made. The score on a card is still its
  own, counted from its own parts, and `partial` says whether the meaning part is in it.
- The constants come from a single measurement of a handful of texts. When there is real data,
  check three things: where real idea and profile pairs sit (whether 0.70 and 0.82 still hold
  the band), whether 0.80 names ideas people agree are alike, and whether the real order of
  matches follows what owners accept. Changing a constant moves every score, so it should come
  with a new `score_version`.
- Finding similar ideas reads every open idea's vector for each request. That is fine for the
  size of the platform today. If it grows, the HNSW index can serve the nearest ideas first.
