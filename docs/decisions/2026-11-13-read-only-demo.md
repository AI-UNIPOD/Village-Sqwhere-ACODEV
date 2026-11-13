# A read-only demo account

Name: `2026-11-13-read-only-demo.md`

## Context

The landing page has a "Try the demo" button that says "Coming soon". Judges and visitors
should be able to look around Village Sqwhere without a GitHub account, and a guided tour will
sit on top of that later. Anyone can press the button, so whatever the demo account can do,
the whole world can do.

## Decision

Tanny decided on 13 November 2026 to build it as one shared account that can look at
everything and change nothing. The session that owns the feed and posts API designed it with
the web session, in three pull requests:

1. **Sign-in, switch and read-only rule (this record's first pull request).**
   - `users.is_demo` marks the account. A unique index allows only one demo account.
   - `POST /v1/auth/demo` signs in as it, with the same answer as `POST /v1/auth/token`.
     Refresh and sign-out work as normal.
   - It is off unless the API runs with `DEMO_ENABLED=true`. Off, or with no demo account in
     the database, the route answers `404 DEMO_UNAVAILABLE`. Switching it off also ends every
     demo session: its tokens answer `401 DEMO_UNAVAILABLE`, refresh included.
   - The demo account may only read. Every signed-in route gets its user from
     `get_current_user`, and that check refuses every method but `GET`, `HEAD` and `OPTIONS`
     with `403 DEMO_READ_ONLY`. The verification interview socket closes for it. A test walks
     every write route in the OpenAPI schema with a demo token, so a route added later is
     checked too.
2. **A two-sided wall.** Demo content is shown only to the demo account. The demo account sees
   only demo content, in every list and on single reads: a real id answers 404 for it. It is
   never matched, suggested or invited.
3. **Made-up content** from a seed script outside `infra/db/init/`, run by hand only where the
   demo is wanted. Production never gets fake rows. Times are relative to when it runs, so the
   feed reads "2 hours ago", and it can run again to refresh them.

## Options we considered

- **One new account per visitor:** rejected. Every visit would leave an account behind, and
  each one would need its own content to be worth opening.
- **A check in each write route:** rejected. A new route could forget it. One check in the
  shared dependency, plus a test over the whole schema, cannot be forgotten.
- **A `demo` claim in the token instead of a column:** rejected. A token handed out before the
  switch goes off would keep working until it expired.
- **Seed rows in `infra/db/init/`:** rejected. Those scripts run on every new database,
  production included.
- **A rate limit on `POST /v1/auth/demo`:** not added. Sign-in tokens are signed, not stored,
  so a demo sign-in costs one database read, like any public `GET`. No other public route has a
  limit, and behind a proxy a limit per address would limit everyone at once.

## Consequences

- The web app can build the button, the session and a demo banner as soon as part 1 is on
  `main`. Screens have something to show once part 3 is in.
- Part 2 adds an `is_demo` condition to every list and read of shared content. A new list
  must add it too.
- Tanny sets `DEMO_ENABLED=true` only where the demo should be on.
