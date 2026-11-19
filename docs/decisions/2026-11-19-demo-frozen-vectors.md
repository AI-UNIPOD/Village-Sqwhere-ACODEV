# The demo's match scores, from vectors measured once

## Context

The match score has a meaning part worth 30 of 100 points, read from vectors of each idea and
each developer (`2026-11-15-match-score-meaning.md`, `2026-11-19-embeddings-on-openai.md`). Since
`2026-11-15-lived-in-demo.md` the embeddings worker left the demo out, so every score in the
demo was partial: the visitor's idea showed 83, 67 and 43 with "Meaning: Not compared yet", and
no idea ever read close to another. The part of the matcher that feels most like AI was the one
part a visitor could not see.

## Decision

Tanny decided on 19 November 2026 that the demo must give a real feel of the matching, with both
a frozen result and the live one. This reverses the choice in `2026-11-15-lived-in-demo.md` not
to send the demo's made-up profiles to a provider.

- **Frozen.** The demo's 77 texts that the worker embeds (the visitor, the seven developers and
  the 64 full members verified in a role, and the six open ideas) were measured once with
  OpenAI's `text-embedding-3-small`. The vectors are kept in
  `apps/api/app/demo_fixtures/vectors.json`, each with the SHA-256 of the exact text it was made
  from: 768 numbers as little-endian float32 (what pgvector keeps) in base64, one vector a line,
  322 KB. The seed writes them last, after every bio, list and idea, because a trigger removes a
  vector when its text changes. It writes a vector only to a row that has none and whose text
  still has that hash, and only when the file's model is the one the code reads. So the demo
  shows full scores where there is no OpenAI key and while OpenAI is down, and a second run
  changes nothing.
- **Live.** The worker no longer leaves the demo out. A demo row the seed left without a vector,
  because its text changed since the file was made, gets one on the next run where a key is set.
- **Making the file again.** `python -m app.demo_vectors`, against a newly seeded database with
  `OPENAI_API_KEY` set, after a change to a demo bio, stack, sector or verified role, or to an
  idea's title or summary. It keeps the vectors of texts that did not change, sends the others
  in one request, and prints no key and no vector. Two tests fail until it has been run: one for
  the seed's own texts, one for the community's.
- **The demo's texts were tuned with the real numbers.** On the visitor's idea, "Naira payouts
  that never pay twice":

  | Developer | Score | Roles | Technologies | Sectors | Meaning |
  |---|---|---|---|---|---|
  | Aminata Ndiaye | 82 | 40 | 16 | 10 | 16 |
  | Tendai Moyo | 69 | 30 | 12 | 10 | 17 |
  | Uwase Mutoni | 43 | 30 | 4 | 5 | 4 |

  For you shows 68, 62 and 48. To get there, Aminata's bio now names payment apps for
  co-operatives and tontines, Tendai's names payment services and audit logs, and Uwase's names
  co-operatives; Aminata gained Docker and PostgreSQL, Uwase Node.js, Tendai and Uwase the
  agritech sector. These were also the changes of a branch never merged that tuned the demo for
  Gemini on 15 November.
- **One idea reads close to the visitor's.** Tendai's new open idea, "Burial society payouts
  that never go out twice" (a payout service for burial societies in Harare), reads 0.666 from
  the visitor's idea, above the 0.60 line. Tendai's card says he has an idea close to the
  visitor's, and the idea's page lists it as similar. With this model only near copies of an
  idea pass 0.60, so it is a close cousin on purpose.
- **Every text is made up**, as the whole demo is. No real person's data was sent.

## Options we considered

- **Keep the demo partial.** Honest, but the matcher's meaning part never shows, and "Not
  compared yet" reads like a part that is switched off.
- **The live worker only.** Simplest, but a deployment with no key, or OpenAI down, would show
  the partial score again.
- **Frozen only, the worker still leaving the demo out.** A demo text changed later would stay
  partial forever without anyone noticing. With both, it only waits for the worker.
- **Freeze only the rows the visitor sees.** The file would be smaller, but a community member
  who appears on a screen later would be partial. All 77 fit in 322 KB.

## Consequences

- The demo's texts were sent to OpenAI once to make the file, and are sent again by the worker
  wherever a demo text changes and a key is set.
- A change to a demo bio, list or idea needs the file made again, or two tests fail.
- One other pair of demo ideas reads above 0.60: the Tontine and the school gradebook, both in
  French and both built around SMS (0.636). It counts as one subject, as the table in
  `2026-11-19-embeddings-on-openai.md` does.
- The score on a join request is still counted without the meaning part, as for everyone.
