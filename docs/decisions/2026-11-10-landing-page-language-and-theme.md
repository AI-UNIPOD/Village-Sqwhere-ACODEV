# Landing page: language in the URL, theme in the browser

## Context

The landing page was designed in a separate lab (variant B3v, "Thirty-two words") with the
language and theme kept in `localStorage`, and a language button that swapped the text with
a script. It had no route per language, and its three main buttons (try the demo, start the
tour, sign in) went nowhere because those features are not built yet. Bringing it into
`apps/web` meant choosing how the product switches language and theme, and what to do with
buttons that have no destination. `docs/PROGRESS.md` already listed English and French
switching as something to build before the first real screens.

## Decision

Tanny chose, on 10 November 2026:

- **The language is in the URL.** The site lives at `/en` and `/fr`, built with
  `app/[lang]`. The bare `/` redirects by the browser's `Accept-Language` header (`proxy.ts`,
  English if nothing matches). Both pages are prerendered. Every string sits in
  `app/landing/copy.ts`, typed so English and French cannot drift apart.
- **The language switch is a normal link,** so it loads a full page. A client-side
  navigation between `/en` and `/fr` kept the old page hidden in the document and made React
  drop the theme set on `<html>`, so a visitor who chose dark mode lost it.
- **The theme is in the browser.** A small script in the layout applies a saved choice
  from `localStorage` before first paint. With no saved choice, `tokens.css` follows the
  system setting, and the toggle follows system changes until a choice is saved.
- **Buttons with no destination stay visible and say so.** "Try the demo", "Start the tour"
  and "Sign in" use the disabled style from `components.md`, stay focusable, do nothing and
  read "Coming soon" to screen readers. They become real links when the demo, tour and
  sign-in screens exist.
- **The page matches the approved landing page exactly, so the design system grew.** The
  approved page (variant B3v) uses sizes and spacing that had no token: a headline that
  scales with the screen, a header that scales with the screen, round 36px floating buttons
  and a few off-grid values. Tanny approved adding 29 tokens (type, hero, layout, one shadow,
  one duration) to `tokens.json`, `tokens.css` and the design-system docs, instead of
  rounding to the nearest existing value. The page itself uses tokens only.
- **Where the page differs from the approved one on purpose:** the demo, tour and sign-in
  buttons use the disabled style and a "Coming soon" line that sits outside the layout flow,
  so spacing is unchanged. Header links keep a 44px tap height (their text sits in the same
  place). Dark-mode hover uses the real `--surface-sunken` token, the press scale is 0.97 as in
  `components.md`, and the language switch reloads the page because the languages are routes.
  The hero's pause button keeps B3v's 36px circle but gets the same invisible ring as the
  floating buttons, so its tap area is 44px.
- **The hero is animated as in the approved page.** A crowd of small words fills the hero, and
  the 54 African countries (English one loop, French the next) walk into the logo's V, the
  real logo fades in, and they walk back out. It stops off screen and in a hidden tab, has a
  pause button, and stands still with reduced motion. If the browser cannot draw, the hero
  keeps its still frame: the square and the logo.
- **The hero's background words scroll, an addition to B3v.** Tanny asked for them to move
  right to left forever, like a ticker, never back: `--space-8` every `--dur-drift` (2s,
  about 16px a second) on `--ease-linear`, both new tokens. The crowd repeats every hero width,
  so the loop has no seam. While scrolling, the crowd fills the hero evenly and a fixed mask
  with soft edges keeps the text, the square and the button clear; still, it is laid out
  around them as in B3v. The headline, sentence and buttons stay still. The scroll holds
  while the pointer rests on a word, and stops with the pause button, off screen and with
  reduced motion.
- **The browser tab icon is the Laterite mark on a clear background,** as on the approved
  page, an exception Tanny chose to the `on-paper` rule in `logo.md` (recorded there).
- **The French copy is not yet checked by a native speaker.** It avoids a space before a
  colon or question mark. It needs that review before launch, as `voice-and-tone.md` asks.
- **For the animated hero (next pull request):** Tanny approves the letter V that the
  prototype draws for under half a second before the real logo fades in. `logo.md` forbids
  redrawing the logo or setting it in a font, so this is a knowing exception, and the real
  logo itself is only ever faded in through the `Logo` component.

## Options we considered

- **`localStorage` for the language too, as in the prototype.** Closest to the lab version,
  but French visitors would see English first and then a swap, and there would be no
  shareable French address.
- **A cookie read on the server for language and theme.** No flash, but it makes pages render
  on every request instead of being static.
- **An i18n library such as `next-intl`.** More than two languages and one page need. The
  Next.js docs show the same routing with a dictionary file and no dependency.
- **Dead `#` links for the demo, tour and sign-in, or links to routes that do not exist.**
  Both leave visitors with a button that does nothing or a 404.

## Consequences

- Both languages have their own address, which helps sharing and search later.
- Every new page goes under `app/[lang]` and every new string needs English and French in
  `copy.ts`. A test fails if the two differ in shape or break the voice rules.
- Changing language reloads the page. That is fast for a static page, but revisit it if the
  app grows client state that should survive the switch.
- Browsers may offer to translate a French page. The product name is not marked to stay
  untranslated yet.
- The three "Coming soon" buttons must be wired up, and the notes under them removed, when
  the demo account, the tour and sign-in screens are built.
