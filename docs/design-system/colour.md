# Colour

Two bases, one orange, one AI colour and three status colours. Components never use raw
colours. They use **jobs** like `--text` or `--action`, and each job points to a
different colour in light (Paper) and dark (Ink). All values are in `tokens.json`.

## Palette

| Colour | Hex | Job | Contrast |
| --- | --- | --- | --- |
| Ink | `#0B0C10` | Dark base, text on Paper | 19.55:1 on Paper |
| Paper | `#FFFFFF` | Light base, text on Ink | 19.55:1 on Ink |
| Laterite | `#F0601F` | Brand and action | 3.28:1 on Paper, shapes only. 5.96:1 on Ink. Ink text on it 5.96:1 |
| Laterite-700 | `#B23F0C` | Orange text, links and the logo on Paper | 5.82:1 on Paper |
| Lagoon | `#3DBFDB` | The AI on Ink | 9.00:1 on Ink. 2.17:1 on Paper: never use on Paper |
| Lagoon-700 | `#0C6680` | The AI on Paper | 6.51:1 on Paper |
| Flag green | `#008751` | Nigeria's flag in the landing footer, with Paper for its white band. Never for UI | 4.58:1 on Paper, 4.27:1 on Ink |

4.5:1 is the bar for normal text, 3:1 for icons, borders and large text.

## Jobs

| Job | Used for | Paper | Ink |
| --- | --- | --- | --- |
| `--bg` | Page background | `#FFFFFF` | `#0B0C10` |
| `--surface` | Cards, fields | `#FFFFFF` | `#17191F` |
| `--surface-raised` | Menus, toasts, dialogs | `#FFFFFF` + shadow | `#20232B` |
| `--surface-sunken` | Hover fills, tracks, skeletons | `#F4F4F2` | `#17191F` |
| `--text` | Body text, icons, focus outline | `#0B0C10` | `#FFFFFF` |
| `--text-muted` | Meta lines, helper text | `#5B5E68` | `#A3A6B0` |
| `--line` | Dividers, card borders | `#E0E0DC` | `#262934` |
| `--line-strong` | Field and chip borders (3:1 or more) | `#878A93` | `#666A79` |
| `--action` | Main buttons, counts, switches | `#F0601F` | `#F0601F` |
| `--action-hover` | Main button on hover | `#DD581D` | `#F2733A` |
| `--on-action` | Text on the main button | `#0B0C10` | `#0B0C10` |
| `--link` | Text links | `#B23F0C` | `#F0601F` |
| `--logo` | The logo | `#B23F0C` | `#F0601F` |
| `--ai` | What the matcher is doing: its messages, toasts, the "Matcher at work" badge | `#0C6680` | `#3DBFDB` |
| `--success` | Success text and icons, the Green Tick label | `#157A3E` | `#34C26E` |
| `--warning` | Warning text and icons | `#8F5D00` | `#FFC53D` |
| `--error` | Error text, icons, invalid field borders | `#B4163C` | `#FF5C7A` |

Each status colour also has a `-fill` (bright, for solid shapes like the Green Tick
circle) and a `-tint` (hover fills and do / don't panels). Info has no hue of its own: it
uses the text colour.

## Rules

- **One orange.** Laterite is the brand and the main action. Do not use it for
  decoration, warnings or errors.
- **Lagoon means the AI is working.** Use it only for what the matcher or the hub
  assistant is doing. Never mark AI work with a sparkle, a star or a dot.
- **Colour is never the only signal.** With deuteranopia, success and error look almost
  the same khaki, and Laterite sits close to both. Every status carries an icon and a
  word.
- **Match scores** use their own steps: 80 and above in `--success`, 60 to 79 in
  `--text`, 40 to 59 in `--warning`, below 40 in `--error`. Each step also has a label:
  Strong, Possible, Weak, Poor.
- **Warm tints on the landing page.** Every other section sits on a band of 5% `--action`
  mixed into `--bg`, and the stages under product views mix 5% into `--surface-sunken`. A
  5% tint is warmth, not decoration: Laterite as a colour you can name still appears once
  per section. The closing band has a low Laterite glow behind its logo, and section titles
  end on a full stop in `--logo`. While the matcher's suggestions are its own, a soft Lagoon
  ring holds them.
- **Soft tints** for pills and messages are mixed from the job colour:
  `color-mix(in srgb, var(--success) 12%, transparent)` for pills (16% on Ink), 7% into
  `--surface` for messages (11% on Ink).
- Avatars without a photo use the neutral surface, never a random colour.
- **The Nigeria flag keeps its own colours.** `--flag-ng-green` and Paper, the same in both
  themes, with a `--line` hairline so the white band shows on Paper. Use it for the flag only.
