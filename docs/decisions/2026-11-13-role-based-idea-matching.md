# Role-based idea matching first

## Context

The core flow needs matching: an idea owner looks for teammates, and a developer looks for
ideas they can help build. Ideas already store the roles they need, and developers prove their
roles through verification. The `idea_embeddings` table is fixed to the local
`all-MiniLM-L6-v2` model, but nothing in the API or worker can run that model yet. The PRD
notes say AI matches similar ideas and people; they do not set a scoring formula.

## Decision

Tanny delegated these calls to the product owner on 13 November 2026.

- Matching is deterministic for now. `GET /v1/me/ideas/{idea_id}/matches` ranks developers by
  the number of the idea's needed roles they are verified in, then by technologies shared with
  the idea's author, then by earliest verification. `GET /v1/me/matches` ranks open ideas by the
  number of the developer's verified roles they need, then by newest publication.
- Only verified roles match. A match recommends a person for a role, and verification is the
  platform's trust signal. Self-claimed roles do not count, and neither do inactive roles.
- A result says why it matched: the matched roles and, for developers, the shared technology
  count. People can then judge the order instead of trusting a black box.
- People already connected to an idea's hub, in any membership status, are not suggested
  again, and that idea is left out of their own matches.
- Matching never loads an idea's `details`. The code defers the column and makes it raise if
  read, and no model sees any idea text.
- There is no opt-out setting yet. A developer enters matching by verifying a role. A candidate
  card shows only username, display name, avatar, the verified badge, matched roles and
  technologies: no email, names or bio.

## Options we considered

- Wait for embeddings. Not chosen: the model needs a new dependency and a hosting decision,
  and the team composition signal (roles) already exists and is reliable.
- Send idea text to Groq or Gemini to score matches. Not chosen: it would send confidential
  ideas to a third party and cost a call for every page of results.
- Count self-claimed roles. Not chosen: anyone can claim any role, so the order could be gamed.
- Add an opt-out flag now. Not chosen for this change: it needs a schema change, and
  verification is already an explicit step into collaboration.

## Consequences

- Matching works today with no new dependency or environment variable.
- Ideas that need no roles have no developer matches. The owner should add roles needed.
- Semantic similarity from `idea_embeddings` can join later as one more ordering signal on
  title and summary only.
- Before launch, add a "pause matching" setting so a developer can stay verified without being
  suggested.
