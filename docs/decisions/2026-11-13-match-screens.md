# Match screens: ideas that need you, and developers who match your idea

## Context

The API answers two matching questions (see `2026-11-13-role-based-idea-matching.md`): which open
ideas need one of my verified roles, and which developers are verified in a role my idea needs.
Matching is deterministic: verified roles first, then technologies shared with the idea's
author. The web app had no screen for either answer.

## Decision

Tanny delegated these calls to the product owner on 13 November 2026.

- **"For you" is a third tab, between "Open ideas" and "Your ideas"** (`/{lang}/ideas/for-you`).
  It is the same list as open ideas, narrowed to the ones that need a role the developer is
  verified in, so it belongs with the other two lists instead of in the main navigation, which
  stays at five places. The cards are the open ideas' own card, drawn by the same component.
- **Every result says why it matched, and no result has a score.** A card says "Needs your
  verified role: Backend and Systems Engineer". The API gives no score or percentage, and the
  order is a count of roles then a tie-break, so a number would be made up. The line lets people
  judge the order themselves. The match score component in `components.md` (a number with
  "Strong match" and "Poor match" steps) is not used: it assumes a score the API does not have.
  The `--ai` colour is not used either, because nothing here is AI.
- **A developer with no verified role is not shown an empty list.** Matching ignores roles that
  are only claimed, so the page explains that and leads to verification. A developer with no
  role at all is sent to set up their profile first. In both cases the page does not call the
  API, because it would answer an empty list.
- **The roles named on a card come from the API's `matched_roles`**, not from the developer's
  profile, and are shown by slug in the page's language, as the open ideas list does.
