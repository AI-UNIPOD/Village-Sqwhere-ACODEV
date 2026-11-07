# Typography

Three families, each with one job.

| Family | Job | Weights |
| --- | --- | --- |
| **Unbounded** (`--display`) | Our own headlines, scores and the product name | 500, 700, 800 |
| **Onest** (`--ui`) | Interface and body text, every name, anything users type | 400, 500, 600, 700 |
| **JetBrains Mono** (`--mono`) | Code, commit stats, Cmd+K shortcuts | 400, 600 |

Load one variable file per family, Latin and Latin Extended only: about 120 KB on the
first page load.

## The names rule

People's names and anything a user types always use Onest. Unbounded does not draw Ƙ, Ƴ
or Ɗ, so "Ɗanladi Ƙabir" would fall back to another font. Onest draws every letter in
names like Ọláolúwa Adébáyọ̀, Chiamaka Ọ̀kọ̀nkwọ́ and Kwabena Ɔwusu correctly.

## Type scale

Use the tokens as `font: var(--type-body)`. Every line height is a multiple of 4px, so
text sits on the spacing grid. Headings grow from 900px wide; body text stays at 16px
everywhere so it reads well on a 360px phone.

| Token | Phone | From 900px | Family, weight | Use |
| --- | --- | --- | --- | --- |
| `--type-display-xl` | 36/40 | 56/60 | Unbounded 800, -0.02em | Landing hero, once per page |
| `--type-display-l` | 28/32 | 40/44 | Unbounded 800, -0.02em | Page titles |
| `--type-display-m` | 22/28 | 28/32 | Unbounded 700, -0.01em | Section headings, empty-state titles |
| `--type-score` | 32 | 40 | Unbounded 800, tabular figures | Match scores and big numbers |
| `--type-title` | 18/24 | 20/28 | Onest 600 | Card and modal titles, names on profiles |
| `--type-body-l` | 16/24 | 18/28 | Onest 400 | Lead paragraph under a page title |
| `--type-body` | 16/24 | 16/24 | Onest 400 | Default reading text |
| `--type-body-s` | 14/20 | 14/20 | Onest 400 | Meta lines, helper text, table cells |
| `--type-label` | 15/20 | 15/20 | Onest 600 | Buttons, tabs, field labels |
| `--type-caption` | 12/16 | 12/16 | Onest 500, +0.01em | Badges, counts, timestamps |
| `--type-code` | 14/20 | 14/20 | JetBrains Mono 400 | Code, commit stats |

Sizes are in pixels, size/line height.

## Rules

- `--type-body-s` is the smallest size for a sentence. `--type-caption` never holds a
  full sentence.
- Sentence case everywhere: "Send invite", not "Send Invite". No all-caps headings.
- Numbers that change or line up (scores, counts, timers) use
  `font-variant-numeric: tabular-nums`.
- Keep reading lines under 68 characters wide.
