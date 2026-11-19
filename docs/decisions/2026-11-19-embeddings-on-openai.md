# Embeddings from OpenAI instead of Gemini

## Context

The vectors the match score and similar ideas read came from Google's `gemini-embedding-2`
(`2026-11-15-embeddings-on-gemini.md`). On 19 November 2026 Tanny asked to leave Gemini out of
the matching, because Tanny expects it to go down, and to use OpenAI and Claude with the
cheapest models that work.

Two facts shaped the answer:

- Claude cannot make vectors. Anthropic's embeddings guide says "Anthropic does not offer its
  own embedding model" and points to other providers.
- Vectors from two models cannot be compared, so one model has to make every vector. Two
  providers cannot share that work the way they can share a text request.

## Decision

Tanny decided on 19 November 2026: the vectors come from OpenAI, and OpenAI and Claude share
the text requests of the matching (a later pull request).

How we build it (the build's own calls, inside that decision):

- **Model `text-embedding-3-small`, 768 numbers.** What OpenAI's documentation said on
  19 November 2026:
  - Pricing page: `text-embedding-3-small` costs $0.02 per million tokens, the cheapest of its
    three embedding models (`text-embedding-ada-002` $0.10, `text-embedding-3-large` $0.13).
  - Embeddings guide: the default length is 1536 for this model, and "using the `dimensions`
    parameter when creating the embedding is the suggested approach" to get a shorter one.
    "OpenAI embeddings are normalized to length 1."
  - API reference, `POST https://api.openai.com/v1/embeddings`: `input` may be an array of at
    most 2048 texts, each of at most 8192 tokens, with at most 300,000 tokens in one request.
    `dimensions` is supported "in `text-embedding-3` and later models". Each vector in `data`
    carries an `index`; the page does not promise the order of `data`, so the client sorts by
    `index` and refuses an answer that is not one vector per text.
- **768 numbers, as before.** The column, the indexes and the triggers stay as they are, and
  only the model's name changes in the database. The client still scales every vector to
  length 1, so the stored data does not depend on what the provider does to a shortened one.
- **No task prefix.** Gemini's model took its task in front of the text. This one has no such
  field, so the text is sent as it is, and the stored hash is still of that text.
- **`OPENAI_API_KEY`**, a new environment variable. Without it the step does nothing and the
  log says so once. `GEMINI_API_KEY` is no longer read for the vectors.
- **`028-embeddings-on-openai.sql`** removes every vector of another model from both tables and
  pins `model = 'text-embedding-3-small'`. The worker makes the rows again. `025` now lets the
  new model's rows be, so running every script again in order keeps the vectors.
- **The worker writes the model's name itself**, not the column's default, so a database whose
  default is stale refuses the row instead of labelling it wrongly.
- **The screens name OpenAI** where they say what is sent to compare by meaning.
- **The band of the meaning points, measured again.** One request on 19 November 2026 with the
  texts the product sends, for the demo's five ideas and seven developers, and a second one
  with six more made-up ideas in English and French:

  | Pair | Similarity |
  |---|---|
  | An idea and a developer whose profile fits it | 0.34 to 0.46 |
  | An idea and a developer whose profile does not fit | 0.17 to 0.30 |
  | The same idea written in English and in French | 0.61 to 0.77 |
  | Two ideas with one subject (a savings circle and a gradebook, both by SMS, both in French) | 0.64 |
  | Two unrelated ideas | 0.18 to 0.55 |

  The meaning points are now `round(30 * clamp((similarity - 0.15) / (0.45 - 0.15), 0, 1))`:
  a profile that does not fit gets 2 to 15 points and one that fits 19 to 30. Two ideas read
  close from 0.60, above every unrelated pair we measured. Gemini's numbers (0.70 to 0.82, and
  0.80) would have given every pair no points at all.
- **`text-embedding-3-large` was tried on the same texts and is not used.** It gave the same
  picture, with unrelated ideas in one language as high as 0.55, so the dearer model buys no
  cleaner line.
- **Nothing else changes**: what is sent, who is embedded, the worker, the triggers, and what a
  failure does are as `2026-11-15-embeddings-on-gemini.md` describes them.

## Options we considered

- **Voyage AI**, the provider Anthropic's guide describes. A third provider and a third key,
  where Tanny asked for OpenAI and Claude.
- **`text-embedding-3-large`.** Six and a half times the price, with no measured need.
- **The model's full 1536 numbers.** A change of column and index and twice the storage. The
  score reads a band of similarity that is measured on the vectors we store, so a shorter
  vector costs nothing we can see.
- **Two providers for the vectors, one as a fallback.** Their vectors cannot be compared, so a
  fallback would silently break the score for every pair that mixes them.
- **Letting a chat model judge the meaning.** Both providers could do it, but the score is
  counted, never judged (`2026-11-14-match-score.md`), and similar ideas need vectors.

## Consequences

- Every stored vector is removed once, when `028` runs. Until the worker has made them again,
  20 ideas and 20 developers a run, a pair without both vectors shows the partial score.
- While OpenAI is down, new and changed texts wait for a vector. Scores from stored vectors
  keep working, because a request never calls the provider.
- A deployment needs `OPENAI_API_KEY` on the worker before the meaning part appears at all.
- English and French share the space less tightly than with Gemini: the same idea in the two
  languages read 0.61 to 0.77 here and 0.96 there, and two unrelated ideas in one language read
  up to 0.55. So "reads close" now names near copies of an idea and little else, a related idea
  in the other language can be missed, and a pair in two languages scores a little lower than
  the same pair in one. We accept that for now; the line can move when there is real data.
- A profile with no bio, only its lists, read 0.08 to 0.30 against an idea when the landing
  session measured nine of them. The band gives such a profile 0 to 15 meaning points.
