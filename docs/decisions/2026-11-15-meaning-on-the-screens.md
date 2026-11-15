# The meaning part, similar ideas and what is sent, on the screens

## Context

The match score has had four parts since 14 November 2026, and the meaning part was always
"Not compared yet" (`2026-11-14-match-score.md`). The API now counts it for a pair whose idea and
developer have both been compared by the model, and it adds a similar idea to each match and a
route for the ideas that read close to one idea (`2026-11-15-match-score-meaning.md`).

Comparing meaning sends text to Google's Gemini (`2026-11-15-embeddings-on-gemini.md`). Tanny
made it a condition on 14 November 2026 that people are told what is sent before a bio goes to
the model.

## Decision

**A compared match and one not compared sit in the same list and each says what is true of it.**

- A compared match (`meaning.points` is a number) shows "Meaning 14 of 30" like the other three
  parts, with one line saying what the part is: how close what the idea says is to what the
  developer's profile says. It has no "Partial score" line, and the screen reader hears no
  partial sentence.
- A match not compared yet is drawn exactly as before: "Meaning, Not compared yet", the partial
  line and the partial sentence. A list can hold both, because the API sends each row's own
  `score_version` and `partial`.
- The screens read `partial` and `breakdown.meaning.points` from the row and never work out for
  themselves whether a pair was compared.

**No similarity number is shown, anywhere.** The model's numbers sit close together (unrelated
ideas at 0.75 to 0.78, ideas on one subject at 0.81 to 0.83), so a figure such as 0.83 would read
as "83% alike", which it does not mean. The API returns none. The screens say "close to" and let
being in the list be the fact. The score's own meaning points are a different thing: they come
from a counted band and are shown out of 30 like every other part.

**A similar idea is one line with a link, and the title is plain text.**

- On "who matches my idea", the developer's card says "Has an idea close to yours: {title}",
  linking to that idea's page.
- On "For you", the idea's card says "Close to your idea: {title}", linking to the viewer's own
  idea in the composer, where a card of theirs already leads.
- An idea's page lists up to five ideas that read close under it, as links with the summary the
  list cards show. It is an extra, so it shows nothing when the list is empty or the read
  fails, and it is only asked for once the idea has been read, so nobody asks about an idea
  they may not see.

**Two notes say what is sent, each tied to its field as help text.**

- By the bio on the profile form: the bio, the verified roles, the technologies and the sectors
  go to Gemini, and the name, username and email never do.
- By the summary on the idea form: the title and the summary go to Gemini, and the private brief
  never does.
- Onboarding does not ask for a bio, but it asks for the stack on its own screen, and the
  technologies are sent. That screen carries the first sentence, as help text on the chips. It
  names the sectors too and comes before the sectors step, so that step carries no note.

The notes sit by the field, not in a banner or a link to a policy, because that is where a
person decides what to write. A screen reader reads them with the field's other help lines.

## Options we considered

- **Show the similarity as a percentage or a bar.** Rejected: the numbers mean little on their
  own, and "83%" would be read as a verdict.
- **Show the meaning part only when it is counted, and hide the row otherwise.** Rejected: a
  hidden row would hide that part of the score is missing. "Not compared yet" is honest.
- **Hide the partial line whenever `meaning.points` is a number.** The API already sends
  `partial: false` for a compared match, so the screens follow that one flag.
- **A banner or a page about what is sent.** Rejected for the forms: far from the field it
  describes, and easy to miss.
- **A note by the title as well.** Rejected: one note on the summary field covers both, since it
  names the title and the summary.

## Consequences

- Scores will change under a person's feet as more ideas and profiles are compared, which is
  why the uncompared state stays visible.
- A new field that is sent to the model needs its own note by its field.
- The notes and the similar sentences exist in English and French and need a native French
  review, like the rest of the French copy.
- The ideas route and the new fields were built to the API's specification while its code was
  still being finished. Where the merged API differs, the screens follow it.
