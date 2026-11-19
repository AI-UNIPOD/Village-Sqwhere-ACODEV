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
- **One line under the header on every signed-in screen** tells the demo account that the
  people, ideas and posts are made up and nothing can be changed, with "Leave the demo" (sign
  out). It is not a banner that can be closed: the fact stays true on every screen.
- **A refused change is noticed in one place,** `apiFetch`, which every screen calls through.
  The line then says "That was not saved", and a screen reader hears it each time. No screen
  has to know about the demo.
- **Most screens that asked still show their own failure sentence** ("We couldn't save your
  changes..."), next to the demo line. Teaching each of about fifty handlers the demo's code
  was not worth it for the first version. The feed is the exception (see 15 November below).
- **Nothing is disabled up front.** Buttons and forms look as they do for a real developer, so
  the demo shows the real product; the refusal comes when a change is sent.
- **The tour is built on top of the demo** (`2026-11-13-guided-tour.md`).

Changed on 15 November 2026 (Tanny's decision, "honest writes"):

- **The demo line says what the demo is made of:** "You are in the demo. The people, ideas and
  posts here are made up, and nothing can be changed." It is still the only place that says
  anything is made up, and it shows on every screen the demo account can open, a single post's
  page included. A test lists the routes under a language and checks each draws its screen, its
  loading state and its error screen inside `AppFrame`, or is left out on purpose.
- **In the feed, a refused write says so next to the control that was pressed.** The new post,
  the comment box (comment, reply and edit), like and save on a card and on a post's page, and
  likes on comments now show "Nothing was saved. The demo cannot be changed." as a polite status
  line beside the control, in both languages. Before, the composer and the comment box showed
  "We couldn't save...", which is wrong for a change that can never succeed, and likes and saves
  went back with no word. The line goes when the text is edited, when the control is pressed
  again or when the person leaves, and it never says "made up". Nothing is disabled up front,
  and for any refused change, in the feed or elsewhere, the frame adds a second line under the
  demo line, "That was not saved...". It no longer replaces the demo line, which therefore stays
  on every screen. Any other failure keeps its usual sentence.

Changed on 2026-11-19:

- **Outside the feed, a refused write says the same sentence.** On the profile, the ideas, the
  hubs, onboarding and verification, a change the API refuses for the demo account now shows
  "Nothing was saved. The demo cannot be changed." where that screen shows its failure sentence,
  in the same alert. Before, most of them said "We couldn't save... check your connection and try
  again", which is wrong for a change that can never succeed. The hub's tabs, its phases and its
  owner's tools, deleting an idea and deleting the account said nothing of their own, and now say
  the sentence too. Onboarding's last step no longer offers "Try again" after it.
- **One helper for every screen.** `apps/web/app/demo-refusal.ts` tells the refusal from a
  failure and gives the sentence, which is the feed's, so there is one wording. Onboarding's save
  now keeps the API's code, which it used to drop. Any other failure keeps its usual sentence,
  nothing is disabled up front, and the frame's second line stays.
