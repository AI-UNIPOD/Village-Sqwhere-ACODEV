# The score on join requests

## Context

An owner sees a score, the matched roles and what they share with each developer in their idea's
matches, but a developer who asked to join showed only a name. The owner had to look the person
up to judge the request. The build plan (F2) planned the score there too. Tracker row 105 asks
for it.

## Decision

- The member card in `GET /v1/hubs/{hub_id}/members` gains `fit`, filled on pending requests
  for the owner only.
- `fit` is exactly the developer match card, built by the same function
  (`matched_developer` in `matches.py`, which calls `match_score`), so the score cannot drift
  from the match lists and the web can reuse its match card.
- A requester with no needed role still gets a fit, with a low score, so the owner sees why.

## Options we considered

- A score number only. Not chosen: the score's rule is that a number never shows without its
  reasons.
- A fit on every member card. Not chosen: once someone is in the team, the score has done its
  job, and members would see each other scored.

## Consequences

The members list reads a few more rows for an owner with pending requests (one query for the
requesters with their roles, technologies and sectors). The web side, showing the fit on the
request in English and French, is still to build.
