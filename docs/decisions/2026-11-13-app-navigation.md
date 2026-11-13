# Getting around the signed-in screens

## Context

The signed-in screens (village, ideas, hubs, peer reviews, profile) could only be reached
through links on the village home. Every screen also asked the API for the profile again and
showed a loading skeleton while it waited, so moving around felt like starting over each time.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **One list of places, placed twice.** On a phone it is a bar along the bottom of the screen,
  an icon over each name, within reach of a thumb. From 768px it is a row of links in the
  header. It is one `<nav>` either way; the stylesheet moves it. Five places at most, which is
  what a bottom bar holds: village, ideas, hubs, reviews, profile.
- **Reviews show only to a developer who holds a Green Tick,** because nobody else can review.
- **The place you are in is marked** with `aria-current="page"`, darker text and a short line.
  Screens that belong to no place (verification, onboarding) mark none.
- **The profile is kept for the visit** (`app/session/me.ts`). The first screen loads it; later
  screens show it at once and refresh it behind. A sign-in or sign-out loads a new page, which
  empties it.
- **Moving between screens is a quick crossfade** (120ms out, 180ms in), with React's
  `<ViewTransition>`: this happens many times a day, so nothing travels. The one thing that
  moves is the mark, which slides to the place just opened. With reduced motion the mark does
  not slide.
- **The header keeps the language link and gains the theme switch.** Signing out moves to the
  profile page, where account things are. Onboarding keeps a plain header with sign out
  (`bare`), because there is nowhere to go yet, and a live interview keeps its locked one.
- **Sticky rows sit above the bar.** The frame sets `--app-bottom` to the bar's height on
  phones, and the composer's and the interview's bottom rows use it.

## Options we considered

- **A menu button on phones:** hides the places behind a tap. Visible navigation is found and
  used more than hidden navigation.
- **A side rail on wide screens:** more than five links would justify it. Five fit the header.
- **A shared layout that renders the frame once:** the frame needs the screen's address, its
  locked state and its language link from each screen, and pages already render it. Keeping
  the profile between screens removed the flash without moving every page.
- **A slide between screens:** movement on something done many times a day gets in the way.

## Consequences

- A new place means one line in `PLACES` and one word in `app/app-frame-copy.ts`.
- A screen that changes the profile should call `loadMe()` afterwards: every screen showing
  the profile then updates.
- Tests get a fresh profile each time (`vitest.setup.ts` empties the kept one).
- The Hubs place shows no count of waiting invitations. That needs one more request per
  screen, or a count from the API.
