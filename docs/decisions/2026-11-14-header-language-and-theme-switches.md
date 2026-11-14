# One pair of language and theme switches in every header

## Context

The language and theme switches looked different on every kind of page. The landing, sign-in
and callback pages had two round floating buttons ("FR" at the top right, a moon at the bottom
right), copied from the approved landing page B3v
(`2026-11-10-landing-page-language-and-theme.md`). The signed-in screens had a plain
"Français" text link and a bare moon icon in the header. Tanny asked, on 14 November 2026, for
a better language button and theme toggle as the first part of the design pass, with the pages
lining up visually.

## Decision

Tanny asked for the change; the design follows research into how developer tools and design
galleries handle both controls:

- **The same two switches end every header,** language then theme, on the landing, sign-in,
  callback and signed-in pages. The floating buttons are gone, and so are the `--float-top` and
  `--float-gutter` tokens that kept room for them.
- **Language is a segmented EN and FR control.** The page's language sits on a dark thumb; the
  other is a plain link (still a full page load, as the 2026-11-10 record requires) named in
  its own language. On hover the thumb leans towards it; pressed, it slides across while the
  page loads. Both languages show at once, so it needs no tooltip and no menu. No flags: a flag
  names a country, and French is spoken in many.
- **Theme spreads from the button.** The new theme grows out of the button in a circle until
  it covers the screen, through a view transition, over `--dur-drawer`. With reduced motion,
  or in a browser without view transitions, it changes at once, as before.
- **Phones:** the logo, the name and both switches share the first row at 360px; the section
  links keep their own row. The pinned pill shows the links only on phones, and everything
  from 768px.

## Options we considered

- **Keep the floating buttons.** They sat over content, worked only on the public pages, and
  the theme button at the bottom right was far from the language button.
- **A globe icon with a menu.** One more tap, and a menu for two choices.
- **A light, dark and system cycle.** Useful for phones on battery saver, but a three-state
  button is harder to label clearly in two languages. The system setting is still followed
  until a visitor chooses.

## Consequences

- One component for language (`app/language-switch.tsx`) and one for theme
  (`ThemeButton` in `app/landing/theme-toggle.tsx`); the header styles place them.
- The view transition freezes the page for a frame while it starts; on a slow phone the
  circle may stutter. It is skipped with reduced motion.
- The hero's layout still keeps 60px clear at its sides, where the buttons used to sit.
