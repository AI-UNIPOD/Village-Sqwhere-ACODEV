# The guided tour

## Context

The landing page promises a tour: "See the whole product in three minutes. A guided route
through a live demo account. No sign-up, and you can leave the route at any stop to look
around." Its button said "Coming soon". The read-only demo account and its made-up content are
now on `main` (`2026-11-13-read-only-demo.md`), so the tour can be built on them. Tanny chose on
13 November 2026 to build the demo first and the tour after.

## Decision

The tour is a route of six steps through the demo account's real screens: the village, the
feed, one conversation, then one idea from the moment it is shared to its hub. It adds no
screen of its own.

- **The steps are the village (`village`), the feed (`feed`), one question with its comments
  (`posts/view`), the idea in the composer (`ideas/compose`), the developers the matcher
  suggests (`ideas/matches`) and the team and hub (`hubs/view#team`)**, the last four on the
  demo account's own open idea and the hub it owns for it. The landing page's list of steps is
  kept by the landing page.
- **A panel under the demo line carries the route** (`app/tour/tour-panel.tsx`, shown by
  `AppFrame` to the demo account only). It has the step's count and name, two sentences, a
  six-part progress bar, Back, Next and "End the tour". It sticks to the top of the screen
  while the page scrolls. Its buttons are secondary ones: the screen keeps its one main button.
- **It is self-paced.** No timers, and nothing points at or covers parts of the screen.
- **Leaving the route is allowed.** On any other screen the panel shrinks to one line with
  "Back to the route". "End the tour" removes it and leaves the person in the demo, where the
  demo line offers "Take the tour" again.
- **The route's question, idea and hub are asked of the API once**, when the tour starts: the
  account's first open idea with a hub it owns, and from the newest questions in the feed
  (`GET /v1/posts?type=question&limit=20`) the first with at least 3 comments, else the first.
  The tour keeps ids, not seeded posts, because the feed holds hundreds. If there is no
  question or no such idea, or the request fails, the panel says the route could not be loaded
  and offers "Try again".
- **The step is kept in `sessionStorage`** (`app/tour/tour.ts`), so a reload and the language
  link keep the step. Signing out clears it. Without storage the tour lasts as long as the page.
- **Focus moves to the step's heading** when a step is reached with Next, Back or "Back to the
  route", so a keyboard or screen reader user hears where they are. A plain page load leaves
  focus alone.
- **The last step is the hub page at its team.** The team, the agreement and the four phases
  are one screen, so they are one step: the address names `#team` and the text says the phases
  are further down. The hub page scrolls to the part its address names once the hub has
  loaded, and again while its team and brief arrive and push the page down, until the person
  scrolls or a few seconds pass. The part lands just under the panel (`app/scroll.ts`). With
  reduced motion the scroll does not glide.
- **Motion:** the step's words arrive with a short fade and rise, and the progress part just
  reached fills from the left. With reduced motion the fade stays and nothing moves.
- **The last step ends with a link to sign in with GitHub.** It signs the demo out first: a demo
  session on the sign-in page would be sent straight back to the village.
- **"Start the tour" on the landing page** opens the demo as "Try the demo" does, with the tour
  on. The "Coming soon" button and its code are gone.

## Options we considered

- **A spotlight that dims the page and points at one control per step.** It needs to find each
  control on screens that load in parts, breaks when a screen changes, and traps the keyboard
  unless built with great care. A panel with two sentences says the same and lets the person
  use the real screen.
- **A video or a slideshow.** It would not be "a live demo account", and would go stale with
  every change to a screen.
- **Steps that play by themselves on a timer.** People read at different speeds, and moving
  content nobody asked for fails the motion rules.
- **A panel at the bottom of the screen.** The places bar is there on a phone, and several
  screens (the composers) already keep a row of buttons above it.

## Consequences

- The tour needs the demo: where the demo is switched off or not seeded, "Start the tour" says
  the demo is not available, as "Try the demo" does.
- The tour depends on the seeded demo account owning an open idea with a hub, and on the feed
  holding at least one question. If the seed changes that, the panel says the route could not
  be loaded.
- The demo is read-only, so pressing Approve at the fifth step is refused and the demo line says
  nothing was saved.
- A failed start is said by three notes on the landing page (hero, tour, footer), each a polite
  live region, so a screen reader may hear it more than once. This was already so for the two
  demo buttons.
- The French needs a native speaker's review, as the rest of the French copy does.

## Changed on 15 November 2026

The route grew from four stops to six steps. Every step now has a count ("Step n of 6"), the
old uncounted start being step 1, and the progress bar has six parts.

- **Why:** the lived-in demo gives the feed hundreds of posts and conversations, which make the
  feed and one conversation worth stopping at. The route now shows what developers share and
  how a reply works before it turns to one idea.
- **The new steps** are the feed and a conversation, a question picked at the start of the
  tour. A reply is refused in the demo like any change, and the step says nothing is saved.
- **The team and the hub are one step.** They already shared the hub page, so the former last
  two stops became one, scrolled to `#team`, with the phases named as further down.
- **The panel's size numbers are gone.** They were measured on four stops and the copy is
  new, so they are no longer vouched for. The panel is still kept small.
- **The time on the landing page's promise** ("three minutes") is no longer repeated in the
  panel's first step.
