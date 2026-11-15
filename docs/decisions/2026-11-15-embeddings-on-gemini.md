# Embeddings of ideas and profiles, from Gemini

## Context

The match score has a "meaning" part worth 30 of 100 points that reads "not compared yet"
(`2026-11-14-match-score.md`). The schema had an `idea_embeddings` table made for a local
`all-MiniLM-L6-v2` model, 384 numbers wide. Nothing in the API could run that model, and the
product never wrote a row. Comparing meaning needs a vector for every idea and every developer,
kept fresh as the text changes. This pull request makes the vectors exist and stay fresh. It
adds no route and does not change the score; reading them is the next one.

## Decision

Tanny decided these on 14 November 2026.

- **A hosted, multilingual model from Google's Gemini API**, with the `GEMINI_API_KEY` the API
  already has. No local model, no new dependency, no new environment variable.
- **Only public text leaves the server.** For an idea: its title and summary. For a developer:
  their verified roles, technologies, sectors and bio. Never an idea's private brief
  (`ideas.details`), an email, a legal name, a display name or a username.
- **The bio may be sent**, and the profile form will say so (a separate web pull request).

How we build it (the build's own calls, inside those decisions):

- **Model `gemini-embedding-2`, 768 numbers, task "sentence similarity".** What the Gemini
  documentation said on 15 November 2026:
  - Embeddings guide (`gemini-api-guides/embeddings.md`): `gemini-embedding-2` is "the latest
    model", maps text in over 100 languages into one space, and became generally available on
    22 April 2026 (release notes). `gemini-embedding-001` stays for text only.
  - Model pages (`models/gemini-embedding-2`, `models/gemini-embedding-001`): input limit 8,192
    tokens for version 2 and 2,048 for version 001; output width "flexible, 128 to 3072,
    recommended 768, 1536, 3072".
  - Embedding several texts in one request: the guide's section "Embedding aggregation" shows
    `POST .../v1beta/models/gemini-embedding-2:batchEmbedContents` with one `Content` per text
    in `requests[]`, which "returns separate embeddings for each entry". Several parts in one
    `Content` would be merged into one vector, so each text gets its own request entry. The
    answer's `embeddings[]` is "in the same order as provided" (reference
    `models.batchEmbedContents`). The documents do not state a limit on how many entries one
    request may hold; the worker sends at most 20.
  - Width: `outputDimensionality` is a field of `embedContentConfig` on each entry (reference
    `EmbedContentConfig`). The guide ("Ensuring quality for smaller dimensions") says version 2
    renormalises truncated sizes such as 768 by itself, and that only `gemini-embedding-001`
    needs manual normalising. The client scales every vector to length 1 anyway, which is a
    no-op on a unit vector, so the stored data does not depend on that behaviour.
  - Task: the guide's "Migration from gemini-embedding-001" says `task_type` is not supported
    by version 2. The task goes in front of the text instead, and for comparing two texts the
    form is `task: sentence similarity | query: {content}`. The same prefix is used for ideas
    and profiles, so the two are comparable. The stored hash is of the text without the prefix,
    because the prefix is a constant of the model.
  - The embedding spaces of versions 001 and 2 are "incompatible", so the model is pinned.
  - Width 768: the guide's score table puts 768 numbers within 0.2 points of 1536 and 2048,
    and a smaller vector keeps the index small.
- **The model and the width are constants in code, not settings.** The database `CHECK` pins
  `model = 'gemini-embedding-2'` and `vector(768)`, so a change is a deliberate script, and a
  setting could only disagree with it.
- **`025-embeddings.sql`.** It removes `idea_embeddings` rows of another model before it
  changes the column, because a vector is a copy made from text and a missing row means "needs
  embedding". It builds `user_embeddings` in the same shape and rebuilds the HNSW cosine
  indexes. Numbers 021 to 024 belong to other open work.
- **Staleness is a trigger.** The existing idea trigger stays. A developer's vector is removed
  when `users.bio` changes, and when a row in `user_roles` (the role or `verified_at`),
  `user_technologies` or `user_sectors` is added, removed or changed. A change of `is_primary`
  does not alter the text, so it keeps the vector. A trigger cannot be forgotten by a new
  route, which is why it is not done in the API. Renaming a role, technology or sector
  does not remove vectors: those names change rarely and by script.
- **A worker, not the request path.** Embedding is a network call to a third party that can be
  slow or down. It must not delay saving an idea or a profile, or fail it. The worker already
  exists for slow steps, retries on its next run by itself, and a missing row is its work list.
  Each run embeds at most 20 ideas and 20 developers, so a large backlog cannot hold the
  loop, and one request carries each list.
- **Who is embedded.** An idea that is open and not deleted, the rule the match lists use. A
  developer with a verified role and a live account. Demo accounts are embedded like everyone
  else. Account deletion removes the developer's vector explicitly, because a profile with only
  a verified role would otherwise keep one that no trigger fires for.
- **A text that changes while Gemini answers.** The worker stores the hash of exactly what it
  sent. Before writing it reads the row again under a share lock and writes only if the text
  still hashes the same. Otherwise the row has no vector and the next run embeds it again. A
  change to a profile's technologies or sectors in the instant between that check and the
  commit is not locked out, and the stored hash then no longer matches the profile; the next
  change or run is the only repair, which we accept for a copy that can be made again.
- **A failure writes nothing.** It is logged without the text or the key, and the next run
  tries again. With no key the step does nothing and says so once in the log.

## Options we considered

- **A local model (`all-MiniLM-L6-v2`).** What the schema was made for. It needs a model file
  on the server and a Python runtime for it, which is a new dependency and a heavy one for a
  small host, and it is weaker in French. Tanny chose a hosted model.
- **`gemini-embedding-001`.** It works for text and lets a task type be named, but it is the
  older model, with a smaller input limit and manual normalising. Version 2 is generally
  available and is the latest model in the guide.
- **Embedding on save, in the request.** Simple, but a Gemini outage would fail or delay
  publishing an idea. Rejected for the reason above.
- **Sending names or the private brief for a better vector.** Not allowed by the owner's
  answers: the brief is confidential and a name says nothing about skills.
- **A setting for the model.** The database pins one model, so a setting could only break it.

## Consequences

- Every open idea and verified developer gets a vector within a few runs of the worker. Nothing
  reads them yet, so the score and every route answer as before.
- The bio leaves the server. The profile form must say so before this ships to real users.
- A real call to Gemini is still to be checked by hand: the request is in
  `app/services/embeddings.py` and the tests only fake the network.
- A text Gemini always rejects would keep failing at the front of its list every run. The log
  shows it each time. If that happens, the fix is a way to set such a row aside.
- Version 2 of the score can read `idea_embeddings` and `user_embeddings` with a cosine
  distance and the HNSW indexes that are already there.
