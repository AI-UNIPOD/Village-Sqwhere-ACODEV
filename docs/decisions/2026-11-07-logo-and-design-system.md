# Logo and design system

## Context

The web app still had the Next.js starter look, and every screen we build next needs the
same colours, type, spacing and components. Over seven brand rounds in November 2026 we
agreed a palette, three type families, a spacing scale, components, motion and a voice,
but they lived in preview pages outside the repository. The logo was still undecided.

## Decision

Tanny chose the logo on 7 November 2026: the palaver tree drawn as a V (round four),
in Laterite-700 `#B23F0C` on Paper and Laterite `#F0601F` on Ink. The shape is unchanged
from round four.

Everything agreed in the brand rounds becomes version 1 of the design system in
`docs/design-system/`: tokens in `tokens.json` and `tokens.css`, the logo files, and docs
for logo, colour, typography, spacing and layout, components, and voice and tone.

Three logo rules are new in this decision, because no round set them: clear space of a
quarter of the logo's size, a 16px minimum (the size round four drew the mark to land on
whole pixels), and no lockup with the name until one is drawn.

## Options we considered

- **Palaver tree, squared (round seven, option 6).** Keeps the "squared" idea, but the
  tree shrinks to make room for the square and loses detail at 16px.
- **V to the power of a square (round seven, option 4).** Reads best at 16px, but drops
  the palaver tree and its meaning.
- **The granary hut, compound, roofline (round three).** The granary reads as a "home"
  button at favicon size; the compound and roofline blur or look like other icons.
- **A design system package in `packages/`.** Only `apps/web` uses it, through one CSS
  import, so a workspace package would be extra setup with nothing gained yet.

## Consequences

- Screens can be built straight from the tokens, in both themes, without new colour or
  spacing decisions.
- `apps/web` imports `tokens.css` straight from `docs/design-system/`, loads the fonts with
  `next/font`, uses the logo as the tab icon, and the home page is drawn from the tokens.
- Tests in `apps/web` check that `tokens.json` and `tokens.css` agree, that the `Logo`
  component and `icon.svg` match the logo files, and that no app stylesheet uses a raw
  colour.
- The lockup of the mark with the name, and real photography with signed releases, are
  still to do.
