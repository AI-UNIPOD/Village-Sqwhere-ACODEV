# Getting around the signed-in screens

## Context

The signed-in screens (village, ideas, hubs, peer reviews, profile) could only be reached
through links on the village home. Every screen also asked the API for the profile again and
showed a loading skeleton while it waited, so moving around felt like starting over each time.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **One list of places, placed twice.** On a phone it is a bar floating above the bottom of
  the screen, an icon over each name, within reach of a thumb. From 768px it is a row of links
  in the header. It is one `<nav>` either way; the stylesheet moves it. Six places now exist
  and fit at 360px: village, feed, ideas, hubs, reviews, profile.
- **Reviews show only to a developer who holds a Green Tick,** because nobody else can review.
- **The place you are in is marked** with `aria-current="page"`, darker text and, on wide
  screens, a short line under the link. On a phone it has a filled icon and an indicator (see
  "Changed on 15 November 2026").
  Screens that belong to no place (verification, onboarding) mark none.
- **The profile is kept for the visit** (`app/session/me.ts`). The first screen loads it; later
  screens show it at once and refresh it behind. A sign-in or sign-out loads a new page, which
  empties it.
- **The frame asks for the profile when it has none** (added 13 November 2026). Nine screens
  never ask for it themselves (Your hubs, a hub, joining a hub, a new hub, Your ideas, the idea
  composer, an idea's matches, a review case, the interview). Opened by their address or reloaded, they left
  the frame without it: a verified developer lost the Reviews place, and the demo account lost
  its line. The frame and the screen inside it share one request, so a page that opens still
  asks once. If that request fails, the frame only shows less.
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
- **A side rail on wide screens:** many more links would justify it. Six fit the header.
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

## Changed on 15 November 2026

The owner chose "Direction A, floating pill bar" after the navigation review of 15 November.
The flat bar, the short line on its top edge and the five-place limit above were true until then.

### Decision

- **The places bar floats.** On a phone it is inset `--gutter` on both sides and `--space-2`
  above the bottom edge (plus the safe area), 60px high, `--radius-l` (see the indicator
  below; it was `--radius-full` until 2026-11-16), 1px `--line`,
  `--shadow-float`, and `--surface` at 85% over a `--blur-bar` blur (solid `--surface` where the
  blur is missing or with reduced transparency). Each place is a 24px icon over a one-line name
  in `--type-caption`, always visible.
- **Filled icon plus a sliding indicator.** The current place shows a filled icon
  (`app/place-icons.tsx`), `--text` colour, weight 600, and a 56 by 32 pill behind the icon in a
  soft tint of `--text` (8%), which works in light and dark. The indicator is the one
  `<ViewTransition name="place-mark">`, so it slides to the place just opened across screens.
  With reduced motion it does not slide. A press scales 0.97 over `--dur-press`; with reduced
  motion only the colour changes. Changed on 2026-11-16: Tanny chose "full height, small
  inset". The indicator now fills its place behind the icon and the name, `--space-1` inside
  the bar above and below, like the chosen part of a segmented control; the 56 by 32 pill left
  the name outside the highlight. The slide, the tint and reduced motion are as before.
  The same day Tanny chose a rounded square over the fully rounded shape, and of the ways to fit
  one into the bar, the bar as a rounded rectangle: the bar is `--radius-l` and the indicator
  `--radius-m`, so the corners of the first and last place run alongside the bar's. Square
  corners inside a fully rounded bar touched its edge, and moving the end places inward left
  the French "Espaces" almost no room at 360px. The header's pill keeps `--radius-full`.
- **The header becomes a pill on scroll,** on every screen except a live interview, like the
  landing page. `useFramePin` (`app/frame-pin.tsx`) watches a slot that keeps the header's
  height with one IntersectionObserver and sets `data-pinned`. The pill rises `--space-2` and
  fades in over `--dur-modal`, and fades out over `--dur-modal-out`; with reduced motion it only
  fades. On a phone it holds the logo, the language switch and the theme switch (the places are
  in the bar); from 768px it holds the logo, the places and the switches. Below 360px there is
  no pill. The pill's surface is a pseudo-element of the header: a blur or a transform on the
  header itself would make it the containing block of the fixed bar, which lives inside it.
- **The guided tour's bar sticks just below the pill** while the pill is pinned, and at the top
  of the screen otherwise. `app/scroll.ts` leaves room for the pill when it scrolls a part into
  view.
- **Nothing is hidden by the bar or the pill.** The document has `scroll-padding-top` while the
  pill is pinned and `scroll-padding-bottom` for the bar (WCAG 2.4.11). `--app-bottom` is now the
  bar's height plus its gap plus the safe area, so the composers' and the interview's sticky rows
  still sit above it.

### Why

Apple's tab bars float and recommend filled icons for the current tab and visible labels.
Material 3 puts an indicator pill behind the icon. Nielsen Norman Group wants labels always
visible. The landing page already pins its header as a pill, so the signed-in screens now match.

### Options considered

- **An attached bar with an indicator, hidden on scroll down:** keeps today's shape, but it looks
  unlike the header pill, and a bar that hides can make people lose their place.
- **A floating bar where only the current place shows its name:** rejected, because the names
  would be hidden on five of six places.

### Consequences

- The bar uses about 76px of height: 60px, its `--space-2` gap, and `--space-2` of room below the
  content, plus the safe area.
- While scrolling, the pill covers 56px at the top (`--pill-top` plus `--pill-height`), so the
  document sets `scroll-padding-top`.
- Filled icons need a cut-out colour (`--icon-cut`, the tint over the bar) for the lines on the
  newspaper and the tick on the shield.
- The pill needs `:has()` on the document and `IntersectionObserver`. Without them the header
  stays at the top, as before.
