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
  The `--ai` colour is not used either, because nothing here is AI. Changed on 2026-11-14: a
  match score is being built and will decide the order (`2026-11-14-match-score.md`); the
  reasons stay on every card and the `--ai` colour stays off these screens.
- **A developer with no verified role is not shown an empty list.** Matching ignores roles that
  are only claimed, so the page explains that and leads to verification. A developer with no
  role at all is sent to set up their profile first. In both cases the page does not call the
  API, because it would answer an empty list.
- **The roles named on a card come from the API's `matched_roles`**, not from the developer's
  profile, and are shown by slug in the page's language, as the open ideas list does.

## The owner's side: developers who match an idea

- **Each developer card says why they matched, with no score.** "Verified in: <roles>" comes
  from `matched_roles`, and "<n> technologies in common with you" from `shared_technology_count`
  (shown only above zero). The technology tags are the developer's own list, without saying which
  are shared, because the API gives only the count. Changed on 2026-11-14: the API names the shared
  technologies and carries the developer's country, so the card names them, marks them in the tags
  and shows the country (`2026-11-14-profile-country.md`).
- **Inviting needs a hub first.** An invitation belongs to a hub (`POST /v1/hubs/{id}/invitations`),
  so an idea with no hub shows the developers with no invite buttons and one notice with
  "Create the hub". The hub is found by reading every page of `GET /v1/me/hubs`, as on Your
  ideas (at first only the first 20 were read).
- **Invite buttons are ghost buttons.** There are many on the page, so none is the main one. A
  sent invitation turns the button into the "Invited" pill used on the team list, with a status
  line for screen readers, and the card stays until the page is loaded again (the API then
  leaves that developer out, since they are connected to the hub). The refusal sentences are the
  team list's own (`inviteMessage` in `team.tsx`, now exported).
- **A full team is handled before asking.** The invitations route has no "team full" refusal, so
  the page uses the hub's active member count (five is the most) as the team list does, and
  shows the full-team note instead of the buttons.
- **A closed idea gets its own words.** The API refuses matches for any idea that is not open
  with `IDEA_NOT_OPEN`, but "Publish the idea" is wrong for a closed idea, which cannot be opened
  again. The page reads the idea's status to tell the two apart.
- **The idea, the hubs and the matches load together** and the page is keyed by the idea's id,
  so nothing loaded for one idea shows for the next.
- **Entry points:** "See who matches" on an open idea's card in Your ideas, and "Find developers
  who match this idea" under the invite form on the hub page, for the owner while there is room.
- **Motion:** lists do not animate in. Only the "Invited" pill, the result of the owner's own
  action, rises in with the entrance a new team row uses, and only fades with reduced motion.
