# A lived-in demo: a community of 1,000 or more

Name: `2026-11-15-lived-in-demo.md`

## Context

The read-only demo (`2026-11-13-read-only-demo.md`) had 7 people, 12 posts and 8 comments. A
judge scrolling the feed saw a village of seven, not a community of developers across Africa.
The demo has to read as real (`2026-11-15-demo-world-reads-as-real.md`), and the demo bar's one
line is the only label that says the content is made up
(`2026-11-15-one-demo-line-no-other-labels.md`).

Tanny approved this plan on 15 November 2026 and read a sample of the writing before the full
set was written.

## Decision

- **Two tiers.** About 150 full members (the original 7 and 143 more) write almost all the
  posts and comments. About 1,000 lighter members have a name, a country, a city in their short
  bio, two to four skills and no photo; they like posts and comments and never write.
- **A heavy tail.** A few full members post a lot (the busiest has about 90 posts) and every
  full member has at least five. About 1,500 posts across all seven post types and about 6,000
  comments. Six posts in ten have 0 to 3 comments, about one in ten has 10 or more, and replies
  go at most three levels deep.
- **Two languages, with local flavour.** About two posts in three are in English and one in
  three in French, by each author's country. A few posts by people in Nigeria, Ghana and
  Cameroon carry a phrase or two of everyday Pidgin. Money is named in the speaker's own
  currency (naira, cedis, KSh, rand, FCFA). Cities are spread across the continent and avoid
  the usual clichés.
- **Frozen fixtures, no generator at reset time.** The names, bios and every text were written
  once, offline, then checked by a script and read by Tanny, and are stored in
  `apps/api/app/demo_fixtures/` (`members.json` and `posts_NN.json`). The seed only loads them
  (`apps/api/app/demo_world.py`). There is no Faker and no model call when the demo is reset,
  and so no version to pin. Names come from hand-written lists per community (Faker has no
  Senegal or Côte d'Ivoire locale and its Yoruba names carry no tone marks and add titles such
  as Chief). The fixtures are data, and a test reads them: no stand-in word, no dash, no link,
  no currency from the wrong country, the right narrow no-break space in French.
- **Handles that no real developer can hold.** Every handle contains an underscore, which GitHub
  never allows. The 143 new full members' names were also searched on GitHub before shipping
  (see the pull request).
- **About 160 posts carry a picture, and each picture matches its post.** Code review requests
  show their code, architecture challenges their options as a diagram, research notes a chart
  with the post's own numbers, release posts and some questions the terminal output. A few posts
  have two. They were drawn once by a script from specs written to agree with each post, in the
  post's language, and stored as 173 small WebP files in `demo_fixtures/images` (about 3.5 MB).
  The seed stores them like uploads, bytes in `post_attachments`, so the feed's own code shows
  them. Nothing on a picture says it is made up. The script is not in the repository, as with
  the names.
- **Counts are true counts.** Nothing stores a made-up number. A post's likes, a comment's likes
  and replies, and a post's comments are the database's own counters, kept by triggers from
  the rows the seed writes, and a test compares each against a COUNT. Who likes what comes from
  a hash of the post and the member, so every run builds the same world and nobody likes their
  own post.
- **The embeddings worker skips the demo.** Changed on 19 November 2026: the demo's vectors are
  measured once and frozen in the repository, and the worker embeds the demo too
  (`2026-11-19-demo-frozen-vectors.md`). As first decided: without a filter it would send the new full members
  and the demo's ideas to Gemini. `workers/embeddings.py` now leaves out `users.is_demo` and
  ideas written by demo accounts, so the demo costs nothing and shows the score without its
  meaning part (version 1).
- **Verified members stay out of the tour's way.** The new full members who are verified hold
  only roles the demo visitor's ideas do not need (backend, AI and ML, MLOps, embedded,
  security, UI and UX), so the matcher on the tour keeps its story: the same three people, in the
  same order.
- **No per-profile labels.** A person in the demo is not tagged "sample" or "made up". The demo
  bar says it once on every screen; repeating it on a thousand profiles would break the demo
  and say nothing new.
- **A rerun writes the feed again.** A post cannot change its own time, so a run deletes the
  new members' posts and writes them again with the same ids, dated back from the moment it
  runs. The members, roles, skills and sectors stay.
- **The worker re-dates it daily.** The worker that already runs all the time on Vercel
  (`vercel.json`, the `worker` daemon) checks once a pass, with one query, whether the newest demo
  post is more than 22 hours old, and if so runs the seed's rerun (`redate_if_stale`). It never
  makes a demo that is not there and never runs where `DEMO_ENABLED` is not true. A failed run is
  logged and tried again an hour later, and never stops the verification and embedding steps.
  The rewrite takes about fifteen seconds and happens in one transaction, so a visitor sees the
  old feed until the new one is complete.

## Options we considered

- **Generate the text at reset time with a model or Faker.** Different every run, so nobody
  could have read it, it would cost on every reset, and it would fail when a service is down.
- **Template-built posts.** Cheap, but a feed of a thousand posts built from a dozen templates
  reads as machine-made within a minute of scrolling.
- **Vercel Cron calling an endpoint.** It would need a new variable (a secret for the route) and a
  public route that rewrites the database, which is what a read-only demo must not offer. The
  daemon is already running, so it needs no paid feature and no new variable.
- **GitHub Actions on a schedule.** Actions are off for this repository.
- **Embed the demo too.** About 200 one-time embeddings, and the tour's matcher would show the
  meaning part. Tanny chose not to send made-up profiles to a provider. Chosen after all on
  19 November 2026 (`2026-11-19-demo-frozen-vectors.md`).
- **A follow feature for the light members.** There is none in the product, so the lighter
  members like, save and read.
- **A city column.** Profiles hold a country only. A city belongs in the bio for now, and a
  `users.city` column is its own change.

## Consequences

- The demo's database grows by about 1,150 users, 1,500 posts, 6,000 comments, 22,000 likes and
  3.5 MB of pictures. The daily re-date writes the pictures again with the posts, so Neon sees
  about 3.5 MB of churn a day.
- A rerun takes seconds, not milliseconds, because every post is written again. The worker
  needs `DEMO_ENABLED=true` in its own environment, as the API does; without it the feed ages.
- A new post type, topic or language needs new text written and read before it is in the demo.
- The light members' bios repeat shapes ("Backend developer in Kisumu."). They are short on
  purpose, and the full members' bios are all different.
- If profiles gain a city column, the bios' cities become data and the seed moves them.
