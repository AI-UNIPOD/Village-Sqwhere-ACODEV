# The theme turns in a wave of tiles from the centre

## Context

On 14 November 2026 Tanny chose a soft-edged circle for the theme switch
(`2026-11-14-soft-theme-reveal.md`) and then asked for something with more of a story: an idea of
blocks that unfold outward from the middle of the screen. We compared four effects side by side in
a preview (the circle that ships, ink and eraser, tiles, and a folding sheet). Tanny picked the
tiles, starting from the centre of the screen, and asked for them to be slower than the other
moments so each block's fold can be seen.

## Decision

Tanny chose the tiles. The theme now changes like this:

- **Tiles unfold outward from the middle.** The page is cut into squares (`--space-20` across,
  `--space-12` under 600px), one centred on the screen. Each square unfolds like a card hinged on
  its edge nearest the middle. A wave of rings of tiles runs to the corners; each tile flips over
  14% of the run, so only about four rings fold at once.
- **The origin is the centre of the visible screen, not the button.** The pace is 1.5 x
  `--dur-moment` (about 780 ms), the wave mixing 30% `--ease-strong` with a steady pace, because
  `--ease-strong` alone sends the front across most of the screen at once and no tiles can be seen.
- **How it is built.** One view transition. The new page is revealed by a `clip-path` diamond whose
  size is a registered custom property, animated on the new snapshot with a CSS `linear()` easing
  made from the wave's own formula. A canvas with its own view transition name draws the tiles that
  are not yet inside the diamond, in the new `--bg` mixed with `--text` for the half still folding.
  The canvas is `aria-hidden`, ignores the pointer, draws at a pixel ratio of at most 2 and is
  removed when the transition ends. The code is `app/landing/theme-toggle.tsx` (the press, the queue
  and the transition) and `app/landing/theme-tiles.ts` (the plan and the drawing, with no page
  access, so it is tested).
- **Quick presses are queued, never dropped.** The running wave speeds up (playback rate 4), then
  the way back plays if the last press differs from the theme now showing. Only the last press counts,
  so three quick presses end opposite to where they began with at most two waves. The label and icon
  show the last press at once. While a view transition runs Chrome sends every mouse or touch press to
  the page instead of the button, so the script takes clicks on the page that land on a switch. Key
  presses reach the button as usual.
- **Reduced motion keeps today's behaviour.** With the system setting nothing travels: the short
  crossfade over `--dur-modal` that already shipped. Without view transitions, or without CSS
  `linear()` easings, the theme changes at once.
- **The hero repaints at once.** Its crowd of words now draws as soon as the theme changes, not on
  the next frame, because the transition takes its picture of the new page before that frame and
  would otherwise show the old colours.

## Options we considered

- **The soft circle that shipped.** Works, but Tanny wanted something with more of a story.
- **Ink and eraser, and a folding sheet.** Both were in the preview next to the tiles and Tanny did
  not choose them. The sheet is the nearest to folding paper: an edge opens from a line through the
  middle.
- **Folding real page content like paper.** Not built. Tiles are flat rectangles on one canvas, so
  the cost is bounded: at most about 320 shapes a frame at 1920 x 1080 and 180 on a phone.
- **The button as the origin.** The preview offered it for the tiles; Tanny chose the centre.

## Consequences

- The tiles are drawn in `--bg`, so the page behind them should be `--bg` where they meet it. `html`
  and `body` are. The tinted bands further down the landing page (`--landing-band`) differ slightly,
  so a faint edge can show where the wave crosses one.
- The canvas draws every frame for about 780 ms. Measured in headless Chrome: 60 frames a second with
  the longest frame 33 ms (the first), and the drawing under 3 ms. Check it on a low-end phone.
- Colour mixes use `color-mix()` in the canvas. Where the browser lacks it the folding half is drawn
  in plain `--bg`.
- A second press during the wave takes up to about 200 ms to finish the running one before the way
  back starts.
