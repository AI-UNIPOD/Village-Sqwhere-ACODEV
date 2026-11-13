# Spacing and layout

## Spacing scale

Base unit 4px. Each token is `--space-N`, and N x 4 gives the pixels. There are no
in-between values: if a design shows 6, 10 or 14px, round it to the nearest step.

| Token | px | Use |
| --- | --- | --- |
| `--space-1` | 4 | Icon to label inside chips and badges; a score to its label |
| `--space-2` | 8 | Icon to text in buttons; stacked meta lines; a label to its field |
| `--space-3` | 12 | Between related controls (button groups, chip rows); side padding in inputs |
| `--space-4` | 16 | Phone page margins; card padding on phones; default gap in lists and forms |
| `--space-5` | 20 | Between groups of form fields; card grid gap on phones |
| `--space-6` | 24 | Card padding and grid gap on tablet and desktop; tablet page margins |
| `--space-8` | 32 | Between groups inside a section; desktop page margins |
| `--space-10` | 40 | A section heading to its content, on wide screens |
| `--space-12` | 48 | Between sections on phones |
| `--space-16` | 64 | Between sections on desktop; below the header; the hero text box to the logo square (beside it or above it), until the square's cells reach 20px |
| `--space-20` | 80 | Above and below the hero, desktop only; the hero text box to the logo square beside it, from 20px cells |

**Touch targets:** anything you tap is at least 44px high (`--tap-min`), whatever its
padding.

## Page layout

Design for 360px first, then widen.

| Token | Phone | From 768px | From 1100px |
| --- | --- | --- | --- |
| `--gutter` (page margin) | 16 | 24 | 32 |
| `--pad-card` | 16 | 24 | 24 |
| `--grid-gap` | 20 | 24 | 24 |
| `--section` (between sections) | 48 | 48 | 64 |

Content is at most 1180px wide (`--content-max`), centred. Headings grow from 900px (see
`typography.md`). The hero is the one exception: on big screens it breaks out to a frame of
`clamp(--content-max, --hero-frame-share, --hero-frame-max)`, which is 72% of the width up to
1760px (1180px up to about 1640px wide, 1382px at 1920, 1760px from 2445). Its text and square
sit in that frame, and the header uses the same width, so its logo lines up with the headline.
The hero's logo square grows with it, up to 20px cells, and its headline up to 80px. The crowd
of words behind it always runs the full width of the screen.

**Page rhythm, top to bottom:** header, then `--space-16` below it; hero; `--section`
between sections; `--space-8` (phone) or `--space-10` (wide) from a section heading to
its content; cards in a grid with `--grid-gap`.

## Landing page layout

The landing page keeps a few values that are not on the 4px scale. Use them only there.

| Token | Phone | From 768px | Use |
| --- | --- | --- | --- |
| `--nav-height` | 56 | 72 | Page header height |
| `--nav-gap` | 12 | 20 up to 32 | Gap between header items |
| `--nav-logo-size` | 24 | 28 up to 36 | Logo in the header |
| `--brand-gap` | 10 | 10 | Logo to wordmark |
| `--underline-offset` | 5 | 5 | Distance of a link underline from its text |
| `--icon-toggle` | 18 | 18 | Sun and moon icon on the theme button |
| `--icon-play` | 14 | 14 | Pause and play symbols on the hero's pause button |
| `--tour-button-gap` | 28 | 28 | Space above the "Start the tour" button |
| `--float-size` | 36 | 36 | Round floating buttons (language, theme). A 44px tap area surrounds each one |
| `--float-top` | 10 | 18 | Distance of the language button from the top |
| `--float-gutter` | 64 | 68 | Right space the header keeps clear of the floating buttons |
| `--section-block` | 56 | 80 | Space above and below a landing section |
| `--hero-min-height` | 600 | 600 | Shortest the hero gets |

The hero also scales its buttons and gaps with the screen: `--hero-button-height` (44 up to
54), `--hero-button-pad`, `--hero-button-font`, `--hero-sub-gap`, `--hero-cta-gap` and
`--hero-cta-top`. Below 1324px the page content keeps 60px clear on its right for the
floating buttons.

## Corner radius

Small parts get small corners and big surfaces get big ones, so nested corners look even.

| Token | px | Use |
| --- | --- | --- |
| `--radius-xs` | 4 | Checkboxes, keyboard keys, tooltips |
| `--radius-s` | 8 | Buttons, inputs, menu items, segmented filters |
| `--radius-m` | 12 | Menus, toasts, messages, popovers |
| `--radius-l` | 16 | Cards, dialogs, panels |
| `--radius-full` | 999 | Chips, pills, badges, avatars, switches |

## Surfaces and depth

Four levels. On Paper, height comes from soft shadows. On Ink shadows barely show, so
height comes from lighter surfaces instead.

| Level | What | Surface | Edge |
| --- | --- | --- | --- |
| 0 | Page | `--bg` | none |
| 1 | Cards, fields | `--surface` | 1px `--line` |
| 2 | Menus, toasts, popovers | `--surface-raised` | `--shadow-2` |
| 3 | Dialogs, Cmd+K palette | `--surface-raised` | `--shadow-3`, over `--scrim` |

A card can lift to `--shadow-1` on hover or focus. Nothing else moves between levels.

## Focus

A 2px outline in `--focus`, 2px away from the element: Ink on Paper, white on Ink, so it
is at least 17:1 everywhere. Use `:focus-visible`, so it shows for keyboard users and
never on mouse clicks. Never remove it without a replacement.
