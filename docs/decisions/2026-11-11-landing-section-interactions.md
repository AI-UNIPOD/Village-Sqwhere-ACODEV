# Landing page: interactions below the hero

## Context

Below the hero, the landing page was still: no feedback when a section scrolled in, no sign
of which section you were reading, and the disabled "coming soon" buttons did nothing when
pressed, against the design system's rule never to remove feedback. Phones had no way to
jump to a section at all, because the header links only showed from 768px. Tanny asked for
the sections to feel interactive, after research by a UX specialist.

## Decision

Tanny approved, on 11 November 2026:

- **Reveals that play once.** Steps and tour stops rise `--space-4` and fade in the first time
  they scroll into view, over `--dur-reveal` (400ms) on `--ease-out`, one after another
  `--delay-stagger` (80ms) apart. Both are new tokens. Only items below the screen at load
  wait; headings and lead text never do, and without JavaScript nothing is hidden.
- **The header marks the section you are reading** (`aria-current="location"`), and links draw
  their underline in on hover and keyboard focus. A jump to a section glides, and the section
  you land on gets a dark top line.
- **Tour stops show their share of the three minutes** as a thin bar on each row.
- **Pressing a "coming soon" button announces its note** in a status region and makes the
  visible note stand out. No new copy.
- **Phones get the section links** in a second header row, 44px high. (Since 13 November the
  header is pinned as a pill once it scrolls away: `2026-11-13-landing-pill-header.md`.)
- **Reduced motion follows the design system** for these interactions: fades and colour
  changes stay, movement goes. The buttons copied from B3v keep changing at once, as before.

## Options we considered

- **Scroll-linked (scrubbed) animation** with `animation-timeline: view()`: has no duration, so
  no motion token fits, it leaves text half faded when you stop scrolling, and older Android
  browsers lack it.
- **A sticky header** to keep the section links in reach: it covers focused elements and costs
  reading space on phones (WCAG 2.4.11). The owner later asked for one anyway, and
  `2026-11-13-landing-pill-header.md` answers both objections with a compact pill.
- **An animation library:** more weight than two observers and some CSS.
- **Counters, parallax and scroll progress bars:** overdone, and they get in the way of reading.

## Consequences

- The page stays light: one small client component, two IntersectionObservers that disconnect
  after use, and transform and opacity transitions only.
- The phone header is taller (two rows), and the step lines and numbers end darker than in B3v
  once revealed.
- Section links now exist twice on phones and wide screens alike: in the header and the footer.
