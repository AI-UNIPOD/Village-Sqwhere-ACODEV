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
