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

## Language and theme switches

Every header ends with the same two switches, in this order (`app/language-switch.tsx`,
`app/landing/theme-toggle.tsx`).

- **Language:** EN and FR side by side on a track, `--radius-full`, 1px `--line`, `--bg`
  fill, labels in `--type-mono-label`. The page's language sits on a `--text` thumb with
  `--bg` text; the other one is a plain link (a full page load) to the same screen in that
  language, at least `--tap-min` wide and 44px tall to a finger, named in its own language
  ("Passer en français"). On hover the thumb leans 12% towards it; pressed, the thumb slides
  across over `--dur-modal` while the page loads. With reduced motion the thumb does not
  travel. No flags: a flag names a country, and French is spoken in many.
- **Theme:** a 44px round icon button, the `--icon-toggle` moon on Paper (go dark) and sun on
  Ink (go light), turning into each other over `--dur-icon`. Hover fills with
  `--surface-sunken`, pressed scales to 0.97. The new theme arrives in a wave of square tiles
  from the centre of the visible screen, not from the button: tiles `--space-20` across
  (`--space-12` under 600px), each unfolding outward from its edge nearest the middle, over
  1.5 x `--dur-moment` (about 780 ms; one tile flips over 14% of that), the wave mixing 30%
  `--ease-strong` with a steady pace (a view transition: a diamond reveals the new page, a canvas
  draws the tiles still folding in the new `--bg`). The page behind must be `--bg` where the tiles
  meet it, or its section carries `data-tile-bg` and the tiles over it take its colour. A press while it runs is queued, never dropped: the running wave speeds up, the way back
  plays if the last press differs, and the label and icon show the last press at once. With reduced
  motion nothing travels: a crossfade over `--dur-modal`. Where view transitions or CSS `linear()`
  easings are missing it changes at once. Its label and tooltip say what a tap does
  ("Switch to dark mode").

The hero's motion button is a pill, not a round button: `--float-size` (36px) high,
`--radius-full`, 1px `--line-strong`, `--bg` fill, padding `--space-3` then `--space-4`, the
`--icon-play` pause or play symbol and its words in `--type-label`, `--space-2` apart. It sits
`--space-3` under the logo square: at its left edge beside the text, centred when they stack.
Anything that moves for more than five seconds has one. The visible words are its name and say
what a press does ("Pause animation", "Play animation"), with no pressed state. Keyboard focus
uses the focus outline.

It is always there once the page has loaded, also with reduced motion: the hero then starts
still and the button offers "Play animation". The choice is kept in `localStorage` under
`vs-motion` ("on" or "off") and wins over the system setting; with no choice the system
setting decides and is followed when it changes.

## Hero crowd

The hero is two boxes on one crowd of small words (`app/landing/gather-hero.tsx`): box 1 is the
text (headline, sentence, buttons), box 2 is the 32 by 32 square where country names walk into
the V and the real logo fades in (the only Laterite in the crowd, apart from the headline's
underline). The crowd runs behind both and between them: side by side there is a band of crowd
at least `--space-16` wide (`--space-20` with 20px cells) from the text's clear zone to the
square's, and stacked there are 160px of crowd rows between the text and the square (the
ghost idea's stage). `hero-layout.ts` computes it (`crowdBand`) and keeps the crowd out of the
boxes only.

The crowd keeps the old drift, tile and mask. Its words are skills and English and French
words, and 18 made-up first names drawn a little stronger, each with a made-up role (Backend,
Mobile, Security, Frontend, Design, Data, Product, Testing). The landing's cast keep theirs:
Hamza Backend, Thandiwe Mobile, Kidist Security. There is no "score" and no "matcher" word.

**Your idea gathers a team** (`hero-team.ts`, `hero-team-draw.ts`, words in
`hero-team-copy.ts`, English and French). Everything is canvas text, `aria-hidden`: nothing
here is needed to use the page.

- **The pointer is the idea.** Only with a fine, hovering pointer
  (`(hover: hover) and (pointer: fine)`). A chip, "Your idea" / "Votre idée" (`--text` on `--bg`,
  1px `--text` border, label type), hangs just below and to the right of the pointer's tip, like
  a name tag on a shared cursor, and moves with it one to one, no lag. Near the right edge it
  swaps to the left. It is not drawn over the text box or the square.
- **A pause gathers the team.** After the pointer rests for 250ms (within 4px), the builders
  who hold the roles an idea like this needs, the nearest Backend, Mobile and Security within
  160px, get a Lagoon (`--ai`) outline and role tag and the one Lagoon caption "Suggested by
  role" / "Proposé par rôle", and spring onto a small ring around the chip on `--ease-strong`.
  The ring takes the biggest radius (52, 44 or 36px) that fits, slid up or down off the chip by
  at most 28px when the clearing is tight; if none fits, or fewer than two builders are near,
  nothing gathers. It never reaches into the text box or the square.
- **The timeline, from the pause:** 0 to 0.5s suggestion and gather together; 0.5s the labels
  turn to ink, "Invitation sent" / "Invitation envoyée" (the Security builder "Asks to join" /
  "Demande à rejoindre"), 60ms apart; 0.9s, 1.1s and 1.3s the three sign 200ms apart, each with a
  `--success` check, "Signed" / "Signé" and a ring segment drawn over 300ms on `--ease-out`.
  The ring is closed at 1.6s. Labels stay as long as the pointer stays. Moving the pointer more
  than 18px, leaving the hero or going over a box lets them go home over `--dur-modal`.
- **Lagoon only at the suggested moment.** Success green only for "Signed" and its ring segment.
  No score, no percentage, no presence dots, nothing reads the idea's text.
- **Without a pointer** (phones, touch, a pointer idle for 4s) a ghost idea, the same chip
  dashed and fainter, wanders slowly (46px a second at most) to a clear spot away from both
  boxes, rests 250ms and tells the same story, holds the closed ring 0.9s, lets go and goes
  elsewhere. Stacked, it works in the band between the text and the square, and the walking
  names do not start there.
- **Still frame.** With reduced motion, the motion button off, no JavaScript or a failure,
  nothing moves: one gathered ring in a clear spot, the ghost idea at rest in the middle of
  three names that all read "Signed", the ring closed in `--success`. On a hovering pointer the
  chip still follows it and outlines the nearby builders who hold the needed roles, without
  movement, except over the ring itself.
- **Performance.** The words are drawn to the tile once per layout; the chip, twin words and
  team are drawn on their own layer, repainted only while one of them is there; the device
  pixel ratio is capped at 2. Everything stops off screen and in a hidden tab, and follows the
  motion button (see above). The English or French twin of a crowd word still shows under the
  pointer, as before; resting on a word no longer holds the drift.

## Hero headline

The hero's h1 is edited into shape once, when the page opens, by the landing page's made-up
cast (`app/landing/hero-headline.tsx`, `headline-edit.ts`, words in `hero-headline-copy.ts`).
It reads "Builders across Africa, one platform". Hamza (Casablanca) selects "platform", the
highlight sweeping right to left over 650ms on `--ease-strong`, rests 250ms and types "place",
55ms a character. Thandiwe (Johannesburg) selects "place" and types "square". Ọmọlará (Lagos)
types the full stop. One `--action` underline then draws under "one square" over
`--dur-moment` on `--ease-out`, bar after bar when the words sit on two lines, while the names
fade out together. It takes about six seconds. The French reads "Toute l'Afrique, une seule
plateforme": Hamza types "place", Kidist (Addis-Abeba) types the full stop, and the underline
goes under "une seule place".

- **Carets and names are neutral.** A bar in `--text`, 0.075em wide, and an inverted pill
  (`--text` fill, `--bg` text, `--type-caption`) reading "Hamza · Casablanca" on top of it. The
  selection is `--text` at 12% (`color-mix`). No colour says who is who. Laterite is used once,
  for the underline.
- **No "live" marker.** The people are made up, so a name never says typing or online, the
  names are cities and not presence, and they all leave at the end.
- **Plays once per page view,** when the hero is on screen and motion is on (see the motion
  button above). Pausing stops it at the finished headline and it does not start again.
- **The layout never moves.** The real headline stays in the flow, as the heading's name and
  as what the hero measures; while the layer plays it is only made transparent. The layer is
  `aria-hidden`, draws over the real lines with the same font, size and alignment, and only the
  last line changes, so the heading keeps its height and line count at every width. A draft
  word that needs more than the text box and its padding again is skipped, and the animation
  starts from the first word that fits.
- **Still frame.** With reduced motion, the motion button off, no JavaScript, or any failure,
  the finished headline stands with its underline (a background on the underlined words, so it
  needs no script) and there are no carets.
- The underline bars and the carets move with `transform` and `opacity` only.

## Pinned header

Once the landing header has scrolled out of view, the same header is pinned as a pill near the
top, until the visitor is back at the top. It is `--pill-height` high, `--pill-top` from the
top, `--radius-full`, 1px `--line`, `--shadow-float`, and `--surface` at 85% over a
`--blur-bar` blur (solid `--surface` where the blur is missing or with reduced transparency).
From 768px it is centred and holds the logo, the name, the links and the two switches. Below
768px it is centred and holds the links only, in `--type-body-s` at weight 600. Below 360px there is no pill.
It rises `--space-2` and fades in over `--dur-modal` on `--ease-out`, and fades out over
`--dur-modal-out`; with reduced motion it only fades. While it is pinned, jumps and keyboard
focus land below it (`scroll-padding-top`).

## Places bar and the app header

On a phone the signed-in places float above the bottom of the screen: inset `--gutter`,
`--space-2` above the bottom edge, 60px high, `--radius-l`, 1px `--line`, `--shadow-float`,
and `--surface` at 85% over a `--blur-bar` blur (solid with reduced transparency). Each place is
a 24px icon over a one-line name in `--type-caption`, at least `--tap-min` wide. The current place
has a filled icon, `--text`, weight 600, and a highlight in `--text` at 8% that fills its place
behind the icon and the name, `--space-1` inside the bar above and below (a rounded square,
`--radius-m`, like the chosen part of a segmented control), and slides to the place just opened
(no slide with reduced motion). The header's pill keeps `--radius-full`. From 768px the places are
links in the header with a line under the current one.

On every signed-in screen except a live interview the header turns into the pinned pill, as the
landing's does (see Pinned header). On a phone the pill holds the logo and the two switches; from
768px it holds the logo, the places and the switches. The guided tour's bar sticks just below it.
Decision: `docs/decisions/2026-11-13-app-navigation.md`.

## Icons

Lucide, outline, 24px grid, 1.75px stroke, rounded ends. Sizes: 16px in chips and small
buttons, 20px by default, 24px in navigation and empty states. Icons take the colour of
their text. The places bar shows the current place's icon filled. No sparkles, stars or dots for AI.

## Third-party marks

A button that signs in with another service shows that service's mark before the label,
sized and spaced like a button icon (16px, `--space-2` from the text). The mark takes the
button's text colour, so on a primary button it is `--on-action`, never the vendor's brand
colour. It carries no shadow, gradient or motion, and it never outranks our own logo on the
screen. The shape only needs to read clearly at that size; it does not have to match the
vendor's files exactly. Today the only one is the GitHub mark on "Continue with GitHub".

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
  `--type-body-s` at weight 500. Its tap area is 44px: it reaches 4px past the chip above and
  below, so rows of chips need a gap of 8px or more. Selected: `--text` fill, `--bg` text. Removable chips
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

A score never shows without its reasons: the parts that earned the points are listed under it.
How it is counted: `docs/decisions/2026-11-14-match-score.md`.

The component is used on the match cards of both lists (`app/ideas/match-score.tsx`) and by the
landing page's matcher demo, which draws it with the same parts and the partial note. The demo's
scores are counted with the real formula from made-up data, never typed in
(`app/landing/sections/matcher-demo-score.ts`).

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

A tooltip takes the small corner from Corner radius (`--radius-xs`), not `--radius-m`. It says
what the button does in the same words as its `aria-label`, so screen readers skip it. A mouse
gets it after `--delay-spinner`, the keyboard at once, a finger never, and the next one opens
without waiting while another has just closed. Esc closes it. In code: `Tooltip` in
`apps/web/app/tooltip.tsx`.

## Dialogs

Native `<dialog>`, max 480px wide, `--surface-raised`, `--radius-l`, `--shadow-3`, over
`--scrim`. In over `--dur-modal` from 96% scale and 8px low, out over
`--dur-modal-out`. Esc closes. Destructive actions always confirm here.

The reduced-motion notice is a dialog that does not move at all, not even the fade other
dialogs keep (`ReducedMotionNotice`). A device that asks for reduced motion sees it once per
visitor: "Turn animations on" or "Keep them toned down", Esc counting as the second. Both are
remembered in `localStorage` (`vs-motion-notice`). Turning animations on is remembered under
`vs-motion-site`: every `prefers-reduced-motion` rule in the style sheets and every script that
asks for the setting then treats the device as asking for no reduction (`app/site-motion.ts`),
and the page reloads so each screen starts with its motion. The notice goes away by itself if
the device setting is turned off while it is open.

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
| Content rises into place as it scrolls into view, once | 400ms (`--dur-reveal`), 200ms fade only with reduced motion | `--ease-out` |
| Items in a row or list arrive one after another | `--delay-stagger` (80ms) between items | as the item's own motion |
| A link's underline draws in on hover or keyboard focus | 160ms (`--dur-press`) | `--ease-out` |
| Landing hero background words scroll right to left, forever | `--space-8` every `--dur-drift` (2s), about 16px a second | `--ease-linear`, for continuous motion only |
| Landing hero: your idea gathers a team, from the pause to the ring closed | 1.6s: gather 0.5s (`--ease-strong`), invitations at 0.5s, signatures 200ms apart (`--ease-out`), home over `--dur-modal` | see Hero crowd |
| Landing hero headline is edited into shape, once | about 6s: sweep 650ms (`--ease-strong`), 55ms a character, underline `--dur-moment` (`--ease-out`) | see Hero headline |

Reveals never hide headings or lead text, never hide anything without JavaScript, and
leave content already on screen alone. An item counts as in view once 15% of it shows
above the bottom 8% of the screen. Those two numbers are set in code, not tokens.

The scroll is the only motion that never ends, so it stops with the hero's motion button, off screen, in a hidden tab and with reduced motion (unless
the visitor plays it). It loops without a seam, and the text, the square and the button stay
clear while it passes.

Animate `transform` and `opacity` only. With reduced motion, keep fades and colour
changes and remove movement. Never remove feedback.
