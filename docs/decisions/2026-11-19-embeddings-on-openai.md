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
- The documentation does not say which languages the model covers. French is measured with the
  band below, not assumed.
