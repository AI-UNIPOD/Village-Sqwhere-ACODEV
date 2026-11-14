# A warmer landing page in both themes

## Context

On 14 November 2026 Tanny said the landing page felt bland and asked to refine the existing
palette, not replace it, so the page feels richer in light and dark. Nearly everything on the
page used the neutral jobs (`--text`, `--text-muted`, `--line`, `--surface-sunken`); Laterite
showed about three times on the whole page and Lagoon once. Every section sat on the same
background, cards sat on grey stages with little shadow, and on Ink the cool blue-grey cards
read as greyer still.

## Decision

Tanny saw before and after shots of every section in both themes and approved all seven
changes:

1. Matcher, Hub and Principles sit on a warm band: 5% `--action` mixed into `--bg`.
2. The stages under product views mix 5% `--action` into `--surface-sunken`.
3. Cards lift off their stage (`--shadow-2`) and, on Ink, carry a hairline of light along the
   top edge. The Green Tick sample card moves to `--surface-raised`, which also stops it
   vanishing into its stage on Ink.
4. While the matcher's suggestions are its own, a soft Lagoon ring holds its panel; once the
   owner acts it goes quiet, like the matcher's status line.
5. The Hub's selected phase is marked in Laterite (that section has no other orange).
6. The closing band has a low Laterite glow behind its logo.
7. Every section title ends on a full stop in `--logo`.

Tanny ruled that a 5% tint counts as warmth, not decoration, so the "one orange" rule holds:
Laterite as a colour you can name still appears once per section. `colour.md` says so. Every
value is mixed from existing jobs; `tokens.css` does not change.

Contrast, checked on the mixed colours: muted text on the band 6.19:1 (light) and 7.81:1
(dark), links 5.57:1 and 5.78:1, Lagoon text on the warm stage 5.61:1 and 7.66:1.

## Options we considered

- **A new palette:** Tanny asked to keep the family and the brand feel.
- **Grey bands** (`--surface-sunken`) instead of warm ones: rhythm without warmth, and the
  page would stay as cold as before.
- **More orange shapes** (icons, borders): breaks the one-orange rule and dilutes the main
  button.

## Consequences

- The landing page now has its own tints (`--landing-band`, `--landing-stage`, `--card-lift`
  on the page wrapper). If other pages want the same warmth, promote them to `tokens.css`.
- The earlier direction note "no gradients" has one exception: the closing band's glow.
- With two orange marks in some sections (a button and a title's full stop), watch that the
  full stops never compete with the main action.
