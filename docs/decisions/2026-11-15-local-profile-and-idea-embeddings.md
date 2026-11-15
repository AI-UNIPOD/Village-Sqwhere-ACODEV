# Embed public idea text and developer skills locally

## Context

The match score reserves 30 points for meaning, and the database already stores 384-dimensional
idea vectors. Similar-idea search and the meaning score need vectors for both ideas and profiles.
Ideas also have a confidential `details` field, while developer profiles contain contact and
identity fields that are not part of matching.

## Decision

- Run `sentence-transformers/all-MiniLM-L6-v2` locally on CPU through the Hugging Face
  `sentence-transformers` package. The model produces normalized 384-dimensional vectors.
- Embed an idea's public title and summary only. Never embed its confidential details.
- Embed a developer's bio, verified active role names, technology names and sector names. Do
  not embed names, usernames, email, country or identity-provider data.
- Store vectors and the SHA-256 of the exact source text in PostgreSQL with pgvector. Use HNSW
  cosine indexes for ideas and profiles. Database triggers remove profile vectors when profile
  source fields change; the existing idea trigger removes idea vectors when title or summary
  changes.
- Let the existing worker poll for missing vectors. The API reports a target idea as pending
  until its vector exists. Match scores stay partial until both sides have vectors.
- Similar-idea search includes only open ideas visible in the caller's demo or real-data world.
  It returns public cards and cosine similarity, never a confidential brief.

## Consequences

- The first worker run downloads the model from Hugging Face and needs network access. Subsequent
  runs use the local model cache.
- Matching remains available while vectors are pending; the existing 70 points are scaled to
  100 until meaning is available.
- Editing a profile source or an idea title or summary makes its vector eligible for re-embedding.
- The model runs in the API worker process and uses CPU. A separate model-serving service is not
  required.
