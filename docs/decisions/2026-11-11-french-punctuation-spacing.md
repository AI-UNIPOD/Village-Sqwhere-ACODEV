# French punctuation: a narrow no-break space, and a non-breaking hyphen in e-mail

## Context

Correct French puts a space before `?`, `!`, `;` and `:`, and inside « ». Our French copy
had no space before `?` and `:` in the onboarding screens, and an ordinary space in the
sign-in screen. An ordinary space lets a line break before the mark, so on a 360px phone a
lone `?` can wrap onto its own line. The onboarding copy test required the opposite
(no space before `:` or `?`), and the « » quotes used a plain no-break space.

"e-mail" can also break at its hyphen, leaving "e-" on one line and "mail" on the next.

## Decision

Tanny decided on 2026-11-11:

- French text uses a narrow no-break space (U+202F) before `?`, `!`, `;` and `:`, and
  inside « ». The space never breaks, and it is the width French typography asks for.
- "e-mail" in French uses a non-breaking hyphen (U+2011).
- Times such as 0:30 and URLs are not punctuation and stay as they are.
- `apps/web/app/french-typography.test.ts` checks all French copy for these rules. It
  replaces the old onboarding and landing checks that forbade a space before `:` and `?`.
- In code the characters are written as `\u202f` and `\u2011` escapes, so a reviewer can see
  them.

## Options we considered

- **No space before the mark.** What the onboarding test required. Simple, but wrong in
  French, and a `?` can still wrap alone when the browser breaks at the wrong place.
- **An ordinary no-break space (U+00A0).** Stops the wrap, but it is a full-width space and
  looks too wide before a `?`. French typography uses the narrower one.
- **Leave "e-mail" with a plain hyphen.** Correct to read, but it can split across two
  lines on a phone.

## Consequences

- A `?` or `:` never starts a line on a phone, and French reads correctly.
- A word and its mark are one unbreakable unit, so a very long word before a mark wraps as a
  whole. Check long French labels at 360px.
- The fonts need a glyph for U+202F and U+2011, or the browser falls back to another font
  for those two characters. Check the rendering when the fonts change.
- Every new French string must follow the rule. The test fails if one does not.
