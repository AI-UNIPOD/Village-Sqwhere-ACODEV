# Live hub chat

## Context

Hub chat (`2026-11-14-hub-chat.md`) had no live updates: a member saw new messages only by
loading the chat again. Tracker row 111 asks for push. The API runs as one process with
in-memory state and no pub-sub, which is why the first chat record chose a Refresh button. On
2026-11-15 Tanny chose real push over a WebSocket anyway, accepting the one-process limit.

## Decision

- `WS /v1/hubs/{hub_id}/messages/live`. The access token comes in the first frame, never in the
  URL, because URLs end up in logs (the same reason as tracker row 109 for the interview).
- Only an active member of the hub may stay connected, the same rule as reading the chat. The
  demo account may listen in a demo hub, since it only reads.
- After each saved change, the routes publish `message.created`, `message.edited` or
  `message.deleted` to that hub's listeners. Each listener gets the same card the routes return,
  built for them.
- Listeners are kept in memory in this process, keyed by hub. Membership is checked again before
  each event, so someone who leaves or is removed is dropped and hears nothing more. A team is at
  most five people, so this is a handful of small reads.
- Nothing is replayed: after a drop, the page reconnects and loads the chat again.

## Options we considered

- Keep the Refresh button. Not chosen by Tanny.
- Ask every few seconds for messages after the newest one. Not chosen: it is simpler to run on
  many processes, but Tanny chose push.
- A pub-sub (for example Postgres LISTEN/NOTIFY or Redis) now. Not chosen: one process runs
  today, and the relay can move behind a pub-sub later without changing the socket's messages.

## Consequences

With more than one API process, a member connected to one process would not hear a message
posted through another. Before scaling out, the relay needs a pub-sub between processes. The web
side, listening on the hub page and reconnecting after a drop, is still to build.
