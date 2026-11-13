# What the feed shows

Name: `2026-11-13-post-feed-and-lists.md`

## Context

`GET /v1/feed` needs a rule for which posts it shows. Developers pick feed topics
(`user_feed_topics`, technology slugs) at onboarding, and posts carry up to five topics from
the same list. There are no follows yet. Many developers skip the topic question, and a post
can have no topics at all.

## Decision

Chosen on 2026-11-13 by the developer who owns the feed and posts API:

1. The feed shows posts that share at least one topic with your feed topics, plus every post
   you wrote.
2. With no feed topics chosen, the feed shows every post, so a new developer never opens an
   empty feed. The web app already knows from `GET /v1/me` whether topics are set, so it can
   invite the developer to pick some.
3. `GET /v1/posts` lists every visible post and filters by `type`, `topic` (repeatable
   technology slug) and `author` (username, any case). Multiple topics combine with OR. An
   unknown topic returns HTTP 422 with `UNKNOWN_TOPIC`. `type=hub_milestone` returns HTTP 422
   with `HUB_MILESTONE_NOT_SUPPORTED`. An unknown author gives an empty list, not an error.
   The profile page uses `?author=` instead of a separate `GET /v1/users/{username}/posts`.
4. Both lists use the offset pagination of `2026-11-11-posts-pagination-and-visibility.md`,
   newest first, and hide deleted and hub posts like every other read path.

## Options we considered

- Only matching posts, empty feed without topics: rejected, a new developer would see
  nothing and think the product is broken.
- Leaving your own posts out: rejected, a developer who posts without a topic would not find
  the post in their own feed.
- Ranking by likes or comments: not needed with few posts; newest first is easy to explain.
- A separate `GET /v1/users/{username}/posts`: rejected, it would repeat `?author=`.

## Consequences

- If feed topics change from technologies to idea domains (gap 3 in
  `2026-11-11-onboarding-page.md`), posts need the same kind of topic, or the feed matches
  nothing.
- Offset pagination can repeat a post when new posts arrive while someone scrolls. The web
  app should skip ids it already shows.
