# Suggest people again after a no

## Context

Matching left out anyone with any membership row in an idea's hub, whatever its status
(`2026-11-13-role-based-idea-matching.md`). So a developer who withdrew a join request or turned
down an invitation lost that idea from their matches for good, and dropped out of the owner's
matches too. The hub page tells a developer who withdrew that they can ask again whenever they
like, and the join-request cool-down (48 hours, or 30 days after five declines) already limits
how often someone can ask.

## Decision

Matching leaves out only memberships that still bind: `requested`, `invited` and `active`. After
`declined`, `left` or `removed`, the idea and the person can be suggested again. Tanny chose this
on 2026-11-14.

## Options we considered

- Keep hiding everyone with a membership row, and change the hub page to point to Browse. Not
  chosen: a no to one invitation or request is not a no forever, and matching is the main way
  developers and ideas find each other.
- Hide ended memberships for a fixed time. Not chosen: the cool-down already does this when
  someone asks again, and a second timer would be one more rule to explain.

## Consequences

An owner may see someone they declined in their matches again, and may invite them again. Asking
to join still waits out any cool-down, which the hub card shows. Revisit if owners find repeat
suggestions unwelcome.
