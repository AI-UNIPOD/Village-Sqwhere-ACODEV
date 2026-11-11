# Components

Built only from the tokens. Every interactive part has hover, pressed, keyboard focus
(`:focus-visible`, see `spacing-and-layout.md`), disabled and, where it can wait, loading
states. Anything you tap is at least 44px high.

## Buttons

| Kind | Look | Use |
| --- | --- | --- |
| Primary | `--action` fill, `--on-action` text | The one main action on a screen: "Send invite" |
| Secondary | Clear, 1px `--line-strong` border, `--text` | Other actions: "View profile" |
| Ghost | Clear, no border, `--text` | Low-priority actions: "Not now" |
| Danger | Clear, 1px `--error` border, `--error` text | Leaving or deleting: "Leave hub", always with a confirm dialog |
| AI | Clear, 1px `--ai` border, `--ai` text | Asking the hub assistant |

- Size: 44px high, padding `--space-3` `--space-5`, `--radius-s`, `--type-label`. Small
  is 36px, for dense desktop views only.
- Icon to text: `--space-2`, icon 16px. Button groups: `--space-3` apart.
- Hover: primary to `--action-hover`; others fill with `--surface-sunken`.
- Pressed: scales to 0.97 over `--dur-press`.
- Disabled: `--surface-sunken` fill, `--text-muted` text.
- Loading: keep the label, show a spinner only after `--delay-spinner` (400ms), so fast
  actions never flash it. Then confirm with a toast.
- One primary button per view.

## Icon buttons

44 by 44px with a 20px icon, `--radius-s`, a tooltip on hover and keyboard focus, and an
`aria-label`. A toggle (like "Save") fills its icon in `--link` when on.

## Floating buttons

Language and theme sit on the landing page as round buttons that stay on screen: the
language button at the top right, the theme button near the bottom right, both 16px from the
right edge. `--float-size` (36px) wide, `--radius-full`, 1px `--line-strong`, `--bg` fill,
`--shadow-float`, label in `--type-mono-label`. A ring around each widens the tap area to
44px. Hover fills with `--surface-sunken`, pressed scales to 0.97 over `--dur-press`. The
theme button shows a moon on Paper and a sun on Ink, turning into each other over
`--dur-icon`, and its label says what a tap does ("Switch to dark mode").

The hero's pause button uses the same round shape, under the logo square, with a
`--icon-play` pause or play symbol. Anything that moves for more than five seconds has one,
labelled with what it does ("Pause animation"), and it is hidden when the visitor asks for
reduced motion, because nothing moves then.

## Icons

Lucide, outline, 24px grid, 1.75px stroke, rounded ends. Sizes: 16px in chips and small
buttons, 20px by default, 24px in navigation and empty states. Icons take the colour of
their text. No sparkles, stars or dots for AI.

## Fields

- Label above the field, `--type-label`, `--space-2` from the field.
- Field: 44px high, `--surface`, 1px `--line-strong` border, `--radius-s`, side padding
  `--space-3`, text `--type-body`. Text areas start at 96px.
- Hover and focus: border turns `--text`; focus adds the focus outline.
- Helper text below in `--type-body-s`, `--text-muted`. Groups of fields: `--space-5`
  apart.
- **Checking:** stay quiet while someone types the first time. Check when they leave the
  field. Once an error shows, clear it the moment the value is fixed.
- **Errors:** border `--error`, an error icon and a message that says what to do: "Enter a
  full email address, like ada@example.com." Set `aria-invalid` and link the message
  with `aria-describedby`.
- A likely typo gets a one-tap fix: "Did you mean ada@gmail.com?"

## Chips and filters

- **Chip** (filters, skills): 36px high, `--radius-full`, 1px `--line-strong`,
  `--type-body-s` at weight 500. Selected: `--text` fill, `--bg` text. Removable chips
  have a 28px x button.
- **Segmented filter** (All, Accepted, Pending): a `--surface-sunken` track with 2px
  padding, buttons that share the row and wrap onto a new line when there is no room.
  Never scroll or clip them. The selected one sits on `--surface-raised` with
  `--shadow-1`.

## Status pills

Show the state of a thing: an invite, a match, an NDA.

- 24px high, padding 0 10px, `--radius-full`, `--type-caption` at weight 500.
- A soft tint of the status colour, no border: 12% on Paper, 16% on Ink.
- Every pill has an icon, never a dot: a tick for Accepted, a three-quarter ring for
  Pending, a warning sign for Expiring, a cross for Declined, a people icon for a match.
- Two-part labels use a middle dot with the value bold: "Expires · 3 days".

## Avatars

Initials in Onest on `--surface-sunken`, never a random colour. Sizes: 24px in lists,
32px in stacks, 44px on cards, 64px on profiles. Initials are centred both ways. A green
online dot sits bottom right.

## Cards

`--surface`, 1px `--line`, `--radius-l`, padding `--pad-card`, inside gap `--space-4`.
Avatar to name `--space-3`, name to city `--space-1`. A clickable card lifts to
`--shadow-1` on hover and focus.

## Match score

`--type-score` with its label underneath as a pill. Colour by step: 80 and above
`--success` "Strong match" with a tick; 60 to 79 `--text` "Possible match"; 40 to 59
`--warning` "Weak match" with a warning icon; below 40 `--error` "Poor match" with an
error icon. When a match lands it counts up once over `--dur-moment`, and a strong match
gets a small bulge. With reduced motion it appears without counting.

## Messages

Inline notes inside a page or hub: what happened and what to do.

- Grid: a 32px round icon tile, the text, then a dismiss button.
- Background: the status colour mixed 7% into `--surface` (11% on Ink). No border.
- Title `--type-label`, body `--type-body-s` in `--text-muted`, actions `--space-3`
  below.
- Kinds: success, warning, error, info, AI (`--ai`), and pending (`--text-muted`, with a
  turning ring while work is running).

## Toasts

Short confirmations after an action. Bottom right, at most three, gone after 6 seconds or
on dismiss. `--surface-raised`, `--shadow-2`, `--radius-m`, a 28px tinted round icon
tile, no coloured edge. Errors use `role="alert"`, everything else `role="status"`.

## Menus, popovers and tooltips

`--surface-raised`, 1px `--line`, `--radius-m`, `--shadow-2`. They grow from their
trigger over `--dur-menu` and leave in 120ms. Menu items are 40px high. Arrow keys move,
Esc closes, and focus returns to the trigger.

## Dialogs

Native `<dialog>`, max 480px wide, `--surface-raised`, `--radius-l`, `--shadow-3`, over
`--scrim`. In over `--dur-modal` from 96% scale and 8px low, out over
`--dur-modal-out`. Esc closes. Destructive actions always confirm here.

## Drawers and sheets

A drawer slides in from its edge over `--dur-drawer` with `--ease-drawer`, no fade. A
bottom sheet rises over `--dur-sheet` with no overshoot. The page dims with each, and each
leaves faster than it came.

## Cmd+K palette

Opens with Ctrl+K or Cmd+K from anywhere, instantly: no animation, because it is used all
day. Same surface as a dialog.

## Waiting, empty and error states

Every screen has all four.

- **Loading:** skeleton blocks in `--surface-sunken`, `--radius-s`. A spinner appears
  only after 400ms. On a slow connection, say so: "Matching is taking longer".
- **Empty:** a 24px icon, a title in `--type-display-m`, one sentence that says how to
  fill it, and one primary button: "No matches yet. Add two skills to your profile and
  we'll start looking for people who fit."
- **Error:** what happened, what was kept, what to do: "We couldn't send your invite. The
  connection dropped. Your message is saved, so try again when you're back online."

## Motion

| What | Duration | Easing |
| --- | --- | --- |
| Cmd+K, shortcuts, list navigation | instant | none |
| Press, toggle, hover | 160ms | ease, buttons scale to 0.97 |
| Menus, tooltips, popovers | 180ms in, 120ms out | `--ease-out` |
| Dialogs | 220ms in, 150ms out | `--ease-out` |
| Drawers | 400ms in, 260ms out | `--ease-drawer` |
| Sheets | 500ms in, 320ms out | `--ease-drawer` |
| A match lands, a Green Tick is earned | 520ms, once per screen | `--ease-strong` |
| Landing hero background words scroll right to left, forever | `--space-8` every `--dur-drift` (2s), about 16px a second | `--ease-linear`, for continuous motion only |

The scroll is the only motion that never ends, so it stops while the pointer rests on a
word, with the hero's pause button, off screen, in a hidden tab and with reduced motion. It
loops without a seam, and the text, the square and the button stay clear while it passes.

Animate `transform` and `opacity` only. With reduced motion, keep fades and colour
changes and remove movement. Never remove feedback.
