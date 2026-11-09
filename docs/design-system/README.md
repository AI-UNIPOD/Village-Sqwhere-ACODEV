# Village Sqwhere design system

The rules for how Village Sqwhere looks, moves and speaks. People and coding agents follow
the same rules. If something you need is not here, ask before you invent it, and add the
answer here in the same pull request.

## What is in this folder

| File | What it holds |
| --- | --- |
| `tokens.json` | Every value, machine-readable: colours for light and dark, type, spacing, radius, elevation, motion, logo rules |
| `tokens.css` | The same values as CSS variables, ready to import |
| `logo/` | The logo as SVG files |
| `logo.md` | Logo variants, clear space, minimum size, misuse |
| `colour.md` | The palette, the jobs each colour does, contrast |
| `typography.md` | Families, the type scale, the names rule |
| `spacing-and-layout.md` | Spacing scale, page rhythm, breakpoints, radius, elevation |
| `components.md` | Buttons, fields, chips, pills, cards, messages, toasts, dialogs and more |
| `voice-and-tone.md` | How we write, in English and French |

`tokens.json` is the source of truth. `tokens.css` must carry the same values. If you
change one, change the other in the same commit. Tests in `apps/web` fail if the two
drift, if the logo paths change, or if an app stylesheet uses a raw colour.

## How to use it in code

1. `apps/web` already imports `tokens.css` in `app/globals.css` and loads the three fonts
   with `next/font` in `app/layout.tsx` (Latin and Latin Extended). Do not import them
   again.
2. Use the `Logo` component from `apps/web/app/logo.tsx` for the logo, never a copy of the
   paths. The browser tab icon is `apps/web/app/icon.svg`, the `on-paper` file.
3. Style components with the semantic variables only: `var(--bg)`, `var(--text)`,
   `var(--action)`, `var(--space-4)`, `var(--radius-s)`, `font: var(--type-body)`.
4. Never write a hex value, a pixel gap or a font size in a component. If the value you
   need is missing, it is a design question, not a code one.
5. Light (Paper) is the default. Dark (Ink) follows the system setting, or set
   `data-theme="dark"` or `data-theme="light"` on `<html>` to force one.

```css
.invite-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  padding: var(--pad-card);
  font: var(--type-body);
  color: var(--text);
}
```

## Rules for agents

- Read this file, then the doc for the part you are building, before writing UI code.
- Take values from `tokens.json` or `tokens.css`. Do not guess a colour from a screenshot.
- Every component has hover, pressed, keyboard focus, disabled, loading and error states
  where they apply. `components.md` lists them.
- Every user-facing string exists in English and French. French is often longer, so
  leave room for it.
- Never mark AI work with a sparkle, a star or a dot. The AI is shown in Lagoon (`--ai`)
  with a plain icon.
- Check your screen at 360px wide and in both themes before calling it done.

## Where the decisions came from

The palette, type families, spacing, components, motion and voice were agreed over seven
brand rounds in November 2026. The logo, "Palaver tree, V", was chosen on 7 November. The
reasons are in `docs/decisions/2026-11-07-logo-and-design-system.md`.
