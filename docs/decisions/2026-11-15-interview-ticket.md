# A one-use ticket for the interview socket

## Context

The verification interview runs over a WebSocket, and a browser cannot add an
`Authorization` header to one. So the web put the access token in the socket's URL
(`?token=`). URLs end up in server, proxy and browser logs, and an access token there works for
fifteen minutes on every route. Tracker row 109 asks for a short-lived ticket instead.

## Decision

- `POST /v1/me/verifications/{session_id}/interview-ticket` (Bearer token) answers a random
  ticket that works once, for about 60 seconds, only for that person and that attempt, and only
  while the attempt is at its interview.
- The socket takes `?ticket=`. A ticket found in a log is already used or expired, and opens
  nothing else.
- Tickets live in the API's memory, like the sign-in codes in `auth.py`, because the API runs
  as one process (`2026-11-07-sign-in-without-dev-login.md`). A restart drops them; the page
  asks for a new one.
- `?token=` keeps working for now, so nothing breaks before the web change merges. A later pull
  request removes it.

## Options we considered

- Send the token as the first message on the socket. Not chosen: the interview already starts
  sending on connect, and a ticket keeps the check before the socket is accepted.
- A ticket stored in the database. Not chosen: it would be one more table for something that
  lives a minute, and sign-in state is already in memory.

Update, 2026-11-20: tickets are now signed and the `token` query parameter is gone
(`2026-11-20-signed-interview-ticket.md`).

## Consequences

The web makes one more request before each interview. Once the web change is merged, the
`token` query parameter should be removed.
