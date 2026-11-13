# Developers can ask to join a hub

Name: `2026-11-13-hub-join-requests.md`

## Context

`2026-11-13-hub-invitations.md` made joining owner-led: the owner invites, and there were no
join requests. A developer who finds an open idea they want to build had no way to say so. The
schema already has the `requested` membership status, and the endpoint tracker lists asking to
join, approving and declining (rows 42, 44 and 45). That record also noted that a later
request could become an invitation, so the signing step would stay the same.

## Decision

Tanny asked on 13 November 2026 for join requests to be built. The session that owns the feed
and posts API chose the following:

1. **A developer asks with `POST /v1/hubs/{hub_id}/join-requests`.** Open idea cards gain
   `hub_id`, so the idea page knows where to ask. The hub must be active and its idea open, and
   the team must have room. Someone who declined, left, was removed or was turned down may ask
   again.
2. **Approving turns the request into an invitation.** The developer then reads the hub's
   agreement and signs through `POST /v1/hubs/{hub_id}/invitation/accept`, like anyone
   invited. Nobody joins without signing, and joining has one path. Inviting someone who has
   a pending request approves it too.
3. **Declining sets `declined`,** the status the schema already uses for a request or an
   invitation that did not go through. The owner can still invite the person later.
4. **The owner sees pending requests** in `GET /v1/hubs/{hub_id}/members`, next to invitations.
   The developer sees theirs in `GET /v1/me/hubs?status=requested`.
5. **The rules are the same as for invitations.** Every change locks the hub row. A full team
   refuses a request and an approval with `TEAM_FULL`, and an approval refused this way stays
   pending. An archived hub takes no requests or approvals but can still decline.

### Update, 13 November 2026: a wait after a decline

An owner could be asked again straight after saying no, as often as the developer liked. Tanny
decided the developer waits first, counted per developer and hub:

- After each decline, 48 hours. After the fifth decline in a row, 30 days, and the count starts
  again, so the next decline after that wait is 48 hours again. Five in a row is any five, with
  no time window.
- Approval or joining clears the count.
- Asking too soon answers `409 REQUEST_COOLING_DOWN` with `can_ask_again_at`, so the screen can
  show the date. The owner can still invite the developer at any time.
- The two numbers live on the membership row (`infra/db/init/012-join-request-cooldown.sql`).

## Options we considered

- **Sign the agreement when asking, and join on approval:** rejected. The owner might approve
  weeks later, and the developer would be bound without a last look. It would also be a second
  way to join.
- **Delete a declined request:** rejected. The developer would see no answer at all.
- **Requests on the idea instead of the hub:** rejected. Only a hub has a team to join, and an
  idea without a hub has nobody to approve yet.
- **Let a developer withdraw their own request:** not built yet. Nobody asked for it; the owner
  can decline.
- **Count declines across all hubs, or within a time window:** rejected by Tanny. The wait is
  between one developer and one owner, and any five in a row count.

## Consequences

- The web app can offer "Ask to join" on an open idea that has a hub, and show requests to the
  owner on the team page.
- Requests for ideas without a hub are not possible: the owner creates the hub first.
- When the demo's wall lands (`2026-11-13-read-only-demo.md`), requests between demo and real
  accounts must be refused like every other crossing.
