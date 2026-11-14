# The hero headline is edited into shape, once

## Context

On 14 November 2026 Tanny asked for a hero headline that shows several people working on one
idea, after the Liveblocks home page, where a named collaborator selects a word and types a
better one. The first preview round gave three options. Tanny approved option A, "Edited into
shape". The Liveblocks teardown found that its version loops forever, gives each person a
colour, and shows the visitor's own selection as a collaborator.

The headline is also the page's h1 and the text the hero measures to place the 32 by 32
square, so it must keep its height and line count while it plays.

## Decision

Tanny chose preview A. The headline first reads "Builders across Africa, one platform". Hamza
selects "platform" and types "place", Thandiwe selects "place" and types "square", Ọmọlará
types the full stop, and one Laterite underline draws under "one square". The French is
"Toute l'Afrique, une seule plateforme", with Hamza and Kidist, ending on "une seule place."

- **Neutral carets and names.** One bar and one inverted pill in the text colour, a selection
  at 12% of the text colour. A colour for each person would add four colours to a page whose
  colour roles are fixed, and Laterite is kept for the one underline.
- **It plays once per page view,** when the hero is on screen and motion is on. A loop would be
  a second endless movement beside the scrolling crowd, and the headline is what people read
  first, so it ends on the real sentence and stays still. Pause stops it at the final headline.
- **Honesty.** The people are the landing page's made-up cast, which the footer already says.
  The names show a city, never "typing", "online" or any live marker, and they all leave
  together at the end. Nothing here claims the product shows real people working live.
- **A layer over the real headline.** The real h1 text stays in the flow and is the heading's
  accessible name; while the show plays it is transparent. A layer (`aria-hidden`) repeats its
  measured lines with the same font and alignment and changes only the last line, so the
  height, the line count and the square never move. The server HTML holds the real headline,
  with its underline as a CSS background, so search engines, no JavaScript and reduced motion
  all get the finished headline.
- **Fit rule.** The draft word may use the text box and its padding again on each side. If
  "platform" or "plateforme" needs more at some width, that beat is skipped and the show starts
  from the first word that fits, rather than moving the layout. At the widths we checked
  (360 to 1920 pixels) every beat fits.

## Options we considered

- **Fixed lines like the preview** ("Builders", "across Africa,", "one square."): the hero is
  laid out as two lines from 600px, and changing it would move the square. Not chosen.
- **Replacing the h1's text word by word:** the heading would re-wrap and change height as the
  words changed, and its name would be wrong while it plays. Not chosen.
- **A colour for each person, as Liveblocks does:** rejected for the colour rule above.
- **Looping, or replaying on hover:** rejected: it plays once.

## Consequences

The headline carries one more client component and about 300 lines of code, with no new
dependency. It uses the Web Animations API for the sweep, the fades and the underline bars, and
timers for typing, and every one is cancelled when the page is left, the visitor pauses, or the
heading changes size mid-show (then it finishes at the real headline). The English and French
draft words and the cast are in `app/landing/hero-headline-copy.ts`; the French needs a native
review, like the rest of the French. If the headline changes, change its draft, its steps and
its underlined words together: a test fails when they do not add up.
