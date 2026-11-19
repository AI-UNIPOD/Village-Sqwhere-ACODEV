# A visitor can turn animations on over their device setting

## Context

Every screen follows the device's reduced-motion setting, in 28 style sheets (media queries) and
nine scripts. A visitor whose device asks for it, often by default, had no way to see the
animations and was not told that the site moves less. Tanny asked for a one-time notice with a
button that turns motion on for the whole site.

## Decision

A notice (`app/reduced-motion-notice.tsx`) appears once when the device asks for reduced motion.
"Turn animations on" stores `vs-motion-site` in `localStorage` and reloads. After that:

- scripts ask `reducesMotion()` (`app/site-motion.ts`) instead of reading the media query;
- the browser switches the `prefers-reduced-motion` media rules in the loaded style sheets off,
  so the files' own full-motion rules apply. This also covers a style sheet that arrives later.

Without the choice nothing changes: the device setting still decides.

## Options we considered

- **Rewrite the 28 style sheets** to depend on an attribute on the page. Cleaner at run time, but
  it touches most screens in one pull request. The media rules are switched in the browser instead.
- **Reuse `vs-motion`**, the hero's choice. Its "Play animation" button would then turn on the
  whole site without saying so, so the site choice has its own key.
- **Hero only.** Honest and small, but the hero already has its own button, so the notice would add nothing.

## Consequences

- One place decides, so a new script or style rule for reduced motion keeps working: scripts must
  call `reducesMotion()`, and style rules stay ordinary `@media (prefers-reduced-motion: ...)` rules.
- The first paint of a page can show the toned-down state for a moment before the style sheets are switched.
- There is no way back in the interface yet: the choice is undone by clearing the site's data.
  A switch on the profile screen is the follow-up.
