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
| `--space-16` | 64 | Between sections on desktop; below the header |
| `--space-20` | 80 | Above and below the hero, desktop only |

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
`typography.md`).

**Page rhythm, top to bottom:** header, then `--space-16` below it; hero; `--section`
between sections; `--space-8` (phone) or `--space-10` (wide) from a section heading to
its content; cards in a grid with `--grid-gap`.

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
