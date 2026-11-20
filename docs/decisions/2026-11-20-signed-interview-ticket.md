# A signed interview ticket, so any API instance accepts it

## Context

The interview ticket lived in one API process's memory. The API runs on several Vercel
instances, so a ticket asked for on one instance was unknown to another, and the interview
socket closed with "Authentication required" at random. A ticket in a database table would
need a new script on the live database before the code could ship, and the code would fail
for everyone if the script were missed.

## Decision

- The ticket is a signed token (the same signing key as the access token, type
  `interview_ticket`, the person and the attempt inside, 60 seconds to live). Any instance
  checks it without shared state. No schema change.
- It is no longer one-use. The 60 seconds, the person and the attempt still limit it, and the
  attempt must be at its interview.
- The access token in the socket's URL (`?token=`) is removed from the interview route, as
  `2026-11-15-interview-ticket.md` planned. The hub chat socket still takes `?token=`.
- Chosen on 2026-11-20 because it cannot affect the running app: nothing to migrate, and
  the web already sends tickets.

## Options we considered

- A `ws_tickets` table with a hash and `DELETE ... RETURNING`, like the sign-in codes. Keeps
  one-use, but needs a script applied by hand before deploy.
- Keep tickets in memory and pin the interview to one instance. Not possible on Vercel.

## Consequences

A ticket seen in a log can be replayed for up to 60 seconds, for that person's own attempt
only. If that ever matters, add the table and mark tickets used.
