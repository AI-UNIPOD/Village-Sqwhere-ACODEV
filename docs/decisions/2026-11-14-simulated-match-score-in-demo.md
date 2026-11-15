Superseded on 15 November 2026: the real score shipped (#160, #171); the demo now draws it with the app's component.

# Simulated match scores in the landing matcher demo

## Context

The matcher ranks developers verified in the roles an idea needs, then by technologies in
common, and gives no score (`2026-11-13-role-based-idea-matching.md`,
`2026-11-13-match-screens.md`). An honesty audit of the landing page on 14 November 2026
flagged "Ordering by fit" and the design system's match score rule as describing nothing
real. Tanny answered that a match score is still planned, should show in the demo as
something simulated, and that the planned way matches show (the "Match score" component in
`docs/design-system/components.md`) should be put to use.

## Decision

- Each suggestion in the landing matcher demo shows a simulated score, drawn as the design
  system's match score: the number in `--type-score`, its step as a pill underneath (80 and
  above "Strong match" in `--success` with a tick, 60 to 79 "Possible match" in `--text`).
  Right after the matcher has run it counts up once over `--dur-moment` and a strong score
  swells a little; otherwise, and with reduced motion, it shows at once.
- One line under the suggestions says the scores are simulated and that match scores are a
  planned feature. Screen readers hear "Simulated score: 92, Strong match".
- The matcher's own status lines say what it does today: "Ordering by roles held, then shared
  technologies" instead of "Ordering by fit".
- The design system's match score rule stays: it describes the planned feature.

## Options we considered

- **No score at all,** as the match screens decided on 13 November: true to today, but Tanny
  wants the planned score visible in the demo.
- **A score with no label:** reads as a real result, which the product does not give yet.

## Consequences

- When the real score ships, the demo's scores and the "simulated" line must be replaced by
  the real ones, and the status lines updated with how it is computed. How the real score is
  counted: `2026-11-14-match-score.md`.
- The demo's order (role, then technologies) and the simulated scores agree: scores fall in the
  order the matcher gives.
