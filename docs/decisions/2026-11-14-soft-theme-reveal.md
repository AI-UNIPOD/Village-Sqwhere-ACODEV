# A soft theme reveal, and a fade with reduced motion

## Context

Since #137 the theme button spread the new theme in a hard-edged circle over 400 ms, and with
reduced motion the theme flipped at once. On 14 November 2026 Tanny asked for a switch that
"feels deliberate rather than an instant flip". Tanny's own Windows had animation effects off,
which Chrome reads as reduced motion, so Tanny only ever saw the instant flip. Checking the
built site also showed the circle never played for anyone: the built CSS writes `400ms` as
`.4s`, the script read it with `parseFloat` as 0.4 milliseconds, and the reveal was over in
one frame.

## Decision

Tanny compared the shipped switch with a soft-edged version in a preview and chose it
("option A"):

- The circle grows from the button with a soft edge: a radial mask on the view transition's new
  snapshot, whose radius is a registered custom property (`--theme-reach`) animated over
  `--dur-moment` on `--ease-drawer`. The edge feathers over 40% of the radius, at most two
  `--space-20`.
- With reduced motion nothing travels: the browser's own crossfade over `--dur-modal`. Fading
  opacity is allowed under reduced motion; an instant flip is not needed.
- Without view transitions the theme still changes at once.
- Durations are read with their unit (`parseSeconds`), so `.52s` is 520 ms; a test covers it.

## Options we considered

- **Keep the hard circle:** works, but reads as a wipe more than a change of light.
- **A crossfade for everyone:** calm, but loses the link between the button and the change.

## Consequences

- The mask animates on the main thread for half a second; check it on a low-end phone.
- `globals.css` holds the mask and the fade rules next to the existing spread rule.
