# The hub's team, its private brief and joining by signature

## Context

The API now lets a hub's owner invite developers, lets an invited developer read the hub's own
agreement and either sign it to join or decline, and shows the team and the idea's confidential
brief only to members who have signed. The web app needed the screens for all of it.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **The hub page changes with who is looking.** An active member sees the real team ("N of 5
  members", counting only active people) and the brief. The owner also sees invited and declined
  people and an invite form. An invited developer sees an invitation card and no team or brief.
  A developer who declined sees one line. Everyone else sees what they saw before. The team and
  the brief are never requested for someone who is not active, so the page does not depend on the
  API refusing them.
- **A failure to load the team or the brief stays inside its section**, with "Try again". The rest
  of the hub page keeps working.
- **The invite form is the owner's main button.** A leading `@` is removed before sending, because
  people paste usernames from GitHub. Each refusal code has its own sentence under the field and
  the typed text stays.
- **Withdrawing an invitation and declining one ask first.** Both end something, and the person
  cannot undo it without the other side acting again.
- **The new row and the success messages are the only motion.** A new row rises in after the
  owner's own action. The message after creating a hub or joining one, and the brief after it, arrive
  once with the "moment" timing.
- **Joining is one page that makes a person read first.** It shows the hub's own terms and its
  own agreement (`GET /v1/hubs/{id}/agreement`, never the current one, which can be a newer
  version), then the "I have read" box, the typed legal name and a dialog that says back the hub,
  the ownership choice and the name. The request carries the template id and hash that were shown.
  If the API says the agreement changed, the page loads the hub's agreement again, clears the box,
  keeps the name and asks again. It never signs a text the person did not see.
- **The agreement block is shared with the create-hub page.** The two pages sign the same way, so
  the text, the box and the name field live in `agreement-block.tsx`.
- **Every refusal has its own way on.** No pending invitation and an archived hub each get a short
  screen with one link to the hub. An active member goes straight to the hub. A hub that does not
  exist gets the existing "We couldn't find this hub" screen.
- **Your hubs lists invitations first.** A failure of that request hides the section, because the
  list of hubs matters more than the invitations.

## Options we considered

- **Showing the team to everyone and hiding only the brief:** the API makes the team private to
  signed members, and showing it would invite requests that can only fail.
- **Optimistic removal of a withdrawn invitation before the answer:** the person may have signed
  in the meantime, and the row would then be wrong. The row goes when the API says it is gone, and
  the list is read again when the API says there was nothing to withdraw.

## Consequences

- Five active members hide the invite form. Pending invitations are not counted, so an owner can
  send more invitations than there are places left.
- The hub page reads the team and the brief with their own requests, so a slow brief never holds
  back the team.

## Asking to join

The API now lets a developer ask to join a hub and the owner approve or decline
(`2026-11-13-hub-join-requests.md`). The web frontend's owner chose, on 13 November 2026:

- **Asking lives on the open idea's page.** That is where a developer decides they want in, and
  the idea card already carries `hub_id`. The page's one main button is "Ask to join", with one
  line before it: the owner sees your profile and answers, and if they approve you read the
  agreement and sign. The three-step "how joining works" list is gone, because it said the owner
  invites and nobody can ask. The lists ("Open ideas", "For you") have no button: the idea's page
  is the one place to ask.
- **The page learns where the developer stands from the hub card** (`GET /v1/hubs/{hub_id}`,
  `viewer.membership_status`), not from `GET /v1/me/hubs?status=requested`. The list only knows
  requests; the card also says invited, member and archived, so the same page can say "You asked
  to join", lead to "Read and sign" or to the hub, and it reads the same on every visit. The owner
  of the idea is never asked about: they have their own links.
- **Each "already" refusal shows the state the developer is really in.** `ALREADY_REQUESTED`,
  `ALREADY_INVITED` and `ALREADY_MEMBER` change the page to that state instead of only
  apologising. `IDEA_CLOSED` and `HUB_ARCHIVED` take the button away, because asking again cannot
  work; `TEAM_FULL` and any other failure keep it, because they can pass.
- **Approval leads to the existing signing page.** The API turns an approved request into an
  invitation, so the developer sees the invitation like any other: "Read and sign" on the idea's
  page, the invitation card on the hub's page and the invitations list on Your hubs. There is no
  second way to sign.
- **The owner answers in the team section.** Requests are listed first, with an "Asked to join"
  pill and "Approve" and "Decline", each named for the person. Decline asks first, as withdrawing
  does, because the person cannot undo it. After either answer the row is replaced by the member
  card the API returns: "Invited" with "Withdraw", or "Declined" with "Invite again".
  `TEAM_FULL` leaves the request in place and says the team is full; `REQUEST_NOT_FOUND` reads the
  list again and says the request is no longer waiting. A line a screen reader hears says what
  happened.
- **The developer's pending requests are a section on Your hubs,** "Waiting for the owner", from
  `GET /v1/me/hubs?status=requested`, each leading to the hub page, which a requester can open
  (the hub card is public to signed-in people). A failure of that request hides the section, as it
  does for invitations.
- **The hub page and the idea page do not say who declined.** The API gives the same status,
  `declined`, whether the developer declined an invitation or the owner declined their request, so
  the hub page says the person is not in the hub and names both possibilities. Asking again is
  allowed, so the idea page offers the button again.
- **After a decline the developer waits, and the page says until when** (added 13 November 2026).
  The API refuses a request made too soon with 409 `REQUEST_COOLING_DOWN` and the date the wait
  ends: 48 hours after a decline, 30 days after the fifth in a row. The sentence with that date,
  written in the page's language, takes the place of the button, because another press would only
  be refused. If the date cannot be read, the sentence says "later". The hub card carries the
  same date (`viewer.can_ask_again_at`, set only while the wait is ahead), so a page opened
  during the wait shows the sentence at once and never offers the button. The refused press
  stays as the fallback for a card read before the decline.

- **A developer can take a waiting request back** (added 13 November 2026, at Tanny's request to
  the API's owner). "Withdraw my request" sits under "You asked to join" on the idea's page and
  on the hub's page, which is where "Waiting for the owner" on Your hubs leads. It asks no
  confirmation: nothing is lost, and the API starts no wait, so "Ask to join" is back at once.
  One line says the request was withdrawn and takes focus, because the button is gone. The API
  marks a withdrawn request `declined`; the hub's page does not then say that someone declined.
  If the owner answered first (404 `REQUEST_NOT_FOUND`), the page reads the hub's card again and
  shows where the developer stands, with a line saying the owner had already answered.

### What the API could not tell the web

- **Requests waiting for an owner.** Nothing cheap says that requests wait: the hub card carries
  no count of them, and the only list is `GET /v1/hubs/{hub_id}/members` per hub. The village and
  the places bar therefore do not mark waiting requests the way they mark invitations, and Your
  hubs shows no "N people asked to join". Reading every hub's members to find out would be one
  request per hub on every screen. A `pending_request_count` on the hub card for its owner, or the
  same for `GET /v1/me/hubs`, would let the web add that line and the dot.
- **Who declined.** A `declined` membership does not say whether the owner or the developer
  declined (see above).

### Consequences

- A developer with no role or an unverified role can ask too: the API does not require either. The
  line about fit ("Needs your role", with the way to verify) stays in the roles block, but it no
  longer takes the place of the main button.
