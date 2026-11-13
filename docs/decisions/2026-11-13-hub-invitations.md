# Owner-led hub invitations

## Context

A hub is where a team builds an idea under a signed agreement. `POST /v1/hubs` creates it with
the owner as its only member, and `GET /v1/hubs/{hub_id}` shows its card to any signed-in
user. The schema already has membership statuses (`requested`, `invited`, `active`,
`declined`, `left`, `removed`) and requires a signature before a member is `active`. The API
needed rules for how other people join and what they may see.

## Decision

Tanny delegated these calls to the product owner on 13 November 2026.

- **The owner invites, by username, anyone with an account.** The owner approves the team, and
  matching only suggests people. A teammate met outside the platform is just as valid, and the
  agreement protects the idea either way.
- **No join requests yet.** The core flow is owner-led. A developer finds ideas through
  matching, but a request needs a hub, while a match is on an idea. An "I'm interested" signal
  is a later product decision.
- **An invitee joins only by signing the hub's own agreement version**, the one the hub was
  created on, even when a newer version is published. `GET /v1/hubs/{hub_id}/agreement` shows
  that text with the hub terms. Accepting saves the signature and the active membership in one
  commit. A person invited back after leaving keeps their earlier signature of the same text,
  because the database stores one per hub, person and version.
- **Declining is kept**, and the owner may invite the same person again. So may someone who
  left or was removed. It is the owner's call.
- **The owner can withdraw a pending invitation.** The row is deleted, because an unsigned
  invitation is not evidence of anything, and the `removed` status would wrongly say the
  person had been a member.
- **Invitations depend on the hub, not the idea.** Closing an idea stops discovery, often
  because the team is complete; the owner can still invite. An archived hub takes no
  invitations and no acceptances, but an invitee can still decline.
- **Only active members see inside the hub.** `GET /v1/hubs/{hub_id}/idea` returns the
  confidential brief and `GET /v1/hubs/{hub_id}/members` the team. The owner also sees invited
  and declined people, to follow up. Nobody sees people who left or were removed.
- Every membership change locks the hub row first, so an invitation cannot be withdrawn while
  it is being accepted, and the same person cannot be invited twice at once.

## Options we considered

- Invite only people from the match list. Not chosen: matching is a suggestion, and it would
  stop an owner inviting a known collaborator who has not verified a role yet.
- Mark a withdrawn invitation `removed`. Not chosen: it would read as a removed member.
- Let any signed-in user read the brief once invited. Not chosen: the brief is confidential
  until the person has signed.
- Always sign the newest agreement. Not chosen: members of one hub would then be bound by
  different texts.

## Consequences

- An invited person finds invitations through `GET /v1/me/hubs?status=invited` (#67).
- Leaving a hub, removing a member, editing and archiving are still to build.
- If join requests come later, the owner's invite can turn a `requested` row into `invited`,
  so the accept step stays the same.
