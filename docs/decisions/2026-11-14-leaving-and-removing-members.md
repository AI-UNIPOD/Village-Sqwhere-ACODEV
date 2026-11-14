# Leaving a hub and removing a member

## Context

The schema has had `left` and `removed` membership states and a `left_at` column since the
start, but no route set them. Once an owner confirms a team, people need a way out, and an
owner needs a way to take someone off a team that is not working. Tanny asked on 2026-11-14 for
the remaining tracker rows to be built (rows 46 and 50), and the build session released them
(they were F3 in the build plan).

## Decision

- `POST /v1/hubs/{hub_id}/membership/leave`: an active member leaves. The owner cannot leave,
  because the hub belongs to the idea's author (`hubs_idea_owner_fk`).
- `POST /v1/hubs/{hub_id}/members/{user_id}/remove`: the owner removes an active member. The
  owner cannot remove themselves.
- Both keep the membership row, the signature and everything the person wrote. The agreement
  still covers what they saw, and a note keeps its author. Access ends at once, because every
  hub tool checks for an active membership.
- A member may leave an archived hub, but an archived hub's team cannot be changed by its owner.
- Removal starts no wait before asking again. If a removed person asks, the owner declines, and
  the usual join-request wait starts then.
- Someone who left or was removed can be invited again. They are bound by the signature they
  already gave, so they sign nothing new for the same agreement version.

## Options we considered

- Delete the row on leaving, as a withdrawn invitation is deleted. Not chosen: an active member
  signed the agreement and saw the confidential brief, so the record must stay.
- A wait after removal. Not chosen: the owner already controls who comes back by declining,
  and a second wait would be one more rule to explain.
- Let the owner hand the hub to someone else and then leave. Not chosen: the hub's owner must
  be the idea's author in the schema, so it needs a schema change and a product decision.

## Consequences

A team can shrink after it is confirmed; nothing stops the work at one member. Matching may
suggest someone who left or was removed for the same idea again (#141). The web side is still
to build.
