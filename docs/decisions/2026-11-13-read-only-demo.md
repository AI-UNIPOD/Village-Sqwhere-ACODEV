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
   - `users.is_demo` marks every account in the demo: the shared account people sign in as,
     and the made-up developers whose content it shows. All of them are read-only, and nobody
     can sign in as the made-up ones.
   - The shared account has a fixed id (`DEMO_ACCOUNT_ID` in `auth.py`) that the seed script
     uses, so the API never has to guess which demo account to sign in as.
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
2. **A two-sided wall.** Demo content is shown only to demo accounts, and demo accounts see
   only demo content, in every list and on single reads: an id from the other side answers 404.
   A demo account is never matched, suggested or invited, and a real developer cannot ask to
   join a demo hub. One rule, `same_world` in `apps/api/app/api/deps.py`, decides it from the
   user behind each row: a post's or idea's author, a hub's owner, a reviewed attempt's
   applicant.
3. **Made-up content** from `apps/api/app/demo_seed.py` (`python -m app.demo_seed`), run by hand
   only where the demo is wanted, never from `infra/db/init/`. Production never gets fake rows.
   Times count back from when it runs, so the feed reads "2 hours ago". Running it again
   rewrites the posts and comments with fresh times. The people, ideas and hubs stay, because
   hubs and signatures cannot be deleted or rewritten.

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

## On the web

Added when the web side was built, on 13 November 2026:

- **"Try the demo" is a real button on the landing page,** in the hero and the footer. The line
  under it says what the demo is ("No sign-up. Look at everything, change nothing."), then how
  opening it is going. A 404 from the route says the demo is not available here.
- **One line under the header on every signed-in screen** tells the demo account that nothing
  it changes is saved, with "Leave the demo" (sign out). It is not a banner that can be closed:
  the fact stays true on every screen.
- **A refused change is noticed in one place,** `apiFetch`, which every screen calls through.
  The line then says "That was not saved", and a screen reader hears it each time. No screen
  has to know about the demo.
- **The screen that asked still shows its own failure sentence** ("We couldn't save your
  changes..."), next to the demo line. Teaching each of about fifty handlers the demo's code
  was not worth it for the first version. Likes are the exception, because they are pressed
  often: a refused like goes back with no "try again".
- **Nothing is disabled up front.** Buttons and forms look as they do for a real developer, so
  the demo shows the real product; the refusal comes when a change is sent.
- **The tour still says "Coming soon".** It is built on top of the demo, after the seed.
