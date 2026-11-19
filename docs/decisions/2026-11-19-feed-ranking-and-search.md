# Rank the feed and search posts in SQL

## Context

The feed was strictly newest first, and posts could not be searched at all (the only search in
the API was the technology name autocomplete). Tanny asked for a feed that reads like a "For
you" stream: a mix ordered by recency, engagement and relevance, with search and sort, and the
demo behaving the same way. The copy must not claim personalisation the app does not do.

## Decision

Tanny approved this on 19 Nov 2026.

* **For you** (the feed's default order): for posts of the last 30 days,
  `(likes + 3 x comments + 1) x boost / (age in hours + 2) ^ 1.5`. The boost is 1.5 for a post
  on one of the viewer's feed topics or, when none are chosen, on a technology of their profile.
  Older posts follow, newest first. The feed topic filter is unchanged: chosen topics still limit
  what shows.
* **Sorts:** the feed takes `for_you`, `newest`, `active`. `GET /v1/posts` also takes `relevance`
  (with search words) and keeps newest first by default, so the profile and saved lists are
  unchanged. `active` is likes plus 3 times comments, then newest, over the last 7 days (every
  match when searching).
* **Search** (`q` on `GET /v1/posts`): Postgres full-text search with the `simple` configuration,
  so it works in English and French without stemming, on the title (weight A) and the text
  (weight B), folding case and the accents of French and Yoruba. `websearch_to_tsquery` gives
  `"phrases"`, `OR` and `-exclusion`. One word also matches the start of a topic name.
  Best match is the text rank, then likes plus 3 times comments, then the newer post.
* **No stored scores and no model.** Everything is computed per request from the counts the
  triggers already keep, so nothing new needs the worker, and the demo needs no `DEMO_ENABLED`
  change: its counts and dates are re-dated daily, and the ranking follows.
* The search index (`030-post-search.sql`) is optional: the query is the same with or without
  it, so the deploy order does not matter.

## Options we considered

* **Stemming (`english` or `french` configuration):** better for plurals, but a post's language
  is not stored, so one configuration would fit half the posts badly. Rejected for now.
* **Typo tolerance (`pg_trgm`):** useful, but it needs an extension and an index to be fast at
  scale. Revisit if search misses are reported.
* **An `unaccent` extension:** a fixed letter table avoids the extra extension and works on any
  host. A test keeps the table in the code equal to the one in the index script.
* **Stored scores updated by the worker:** faster at a large scale, but it adds a job and stale
  numbers. At a few thousand posts the query is cheap.
* **Ranking by reading history or clicks:** nothing like it is collected, and the copy says so.

## Consequences

* A like or comment can move a post between two page requests, so a long scroll can repeat or
  skip a post. The web already skips ids it shows.
* The weights (3, 1.5, 1.5, 30 days, 7 days) are constants in `app/services/feed_rank.py`.
  Revisit them with real usage.
* Search covers posts only, not people, ideas or hubs.
* Applying `030` on the live database is a one-off step for whoever runs the database.
