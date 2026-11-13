# Landing page: the header becomes a pill while scrolling

## Context

The owner asked: "On scroll the nav becomes a sticky transparent pill bar, and it stays there as
we continue to scroll down to the footer." The record of 11 November
(`2026-11-11-landing-section-interactions.md`) had rejected a sticky header for two reasons: a
fixed bar can cover the element that has keyboard focus (WCAG 2.4.11 Focus Not Obscured), and it
costs reading space on phones. This change keeps the owner's request and answers both reasons.

## Decision

The owner decided on 13 November 2026:

- **At the top nothing changes.** The header is in the page, as before.
- **Once the header has scrolled out of view, the same header is pinned** as a compact floating
  pill near the top, and it stays until the visitor scrolls back to the top, where it turns back
  into the header. One element and one `<nav>`: the links are never duplicated.
- **HeaderPin** (`apps/web/app/landing/header-pin.tsx`) watches the header's slot with one
  IntersectionObserver (no scroll listener) and sets `data-pinned` on the header. The slot keeps
  the header's height while it is out of the page, so nothing jumps. The hero keeps measuring the
  slot, which is the height of the header in the page.
- **From 768px** the pill is centred, `--pill-height` high (56px), with the logo, the name and
  the three links in one row, clear of the language button on both sides.
- **Below 768px** the pill sits beside the language button and shows the three links only: the
  logo and name would not fit next to the French links. At 360px the French links are 245px of
  text and the pill has 282px inside its border, so the gap and the end padding are `--space-2`.
- **Below 360px there is no pill.** The header scrolls away as it did before.
- **Surface:** `--surface` at 85% over a `--blur-bar` blur, solid where `backdrop-filter` is
  missing and with reduced transparency. Motion is opacity and transform only: it rises
  `--space-2` and fades in over `--dur-modal`, and fades out over `--dur-modal-out`. With reduced
  motion it fades in without moving.
- New tokens: `--pill-height`, `--pill-top`, `--blur-bar`.

## Options we considered

- **A full-width sticky bar:** the header (72px, and 102px on phones where it has two rows)
  stays on screen the whole page. A pill is shorter and narrower and shows what is behind it.
- **A second, duplicated pill element:** two sets of links for screen readers and two things to
  keep in step. The same element changes shape instead.
- **Hiding on scroll down and showing on scroll up:** needs a scroll listener, and the links
  are not in reach when the visitor wants them.
- **A hamburger menu on phones:** hides two links behind a tap, for a page with three links.
- **CSS scroll-driven animations:** not supported by older Android browsers, and the pill needs
  a state (pinned, leaving), not a position-linked effect.

## Consequences

- **Focus not obscured:** the header stays first in the DOM, so Tab order is unchanged. While
  the pill is pinned, the document has `scroll-padding-top` of the pill's top, height and
  `--space-2`, so keyboard focus and jumps to a section land below it. The sections' own
  `scroll-margin-top` is dropped while pinned so the two do not add up, and kept at the top so
  a jump made before the pill appears lands in the same place.
- **Reading space on phones:** the pill is 48px high, translucent and narrower than the screen,
  and the old two-row header was 102px high. On phones the pill takes less room than that header
  did, and it shows only the links.
- **Phones show links only** while pinned, and the logo and name come back with the header.
- **Below 360px there is no pill.** Those screens are rare and the row does not fit.
- The pill needs `:has()` on the document for the scroll padding, and `IntersectionObserver`.
  Without it the header simply stays at the top, which is the behaviour before this change.
- The sign-in and callback pages use the same header styles and are not changed: HeaderPin runs
  on the landing page only.
