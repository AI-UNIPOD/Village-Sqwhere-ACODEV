# The village's steps follow the developer's ideas and hubs

## Context

The village lists four steps from a profile to a team. The first two were marked from the
profile, but the last two never reached "Done": a developer with an open idea, a hub they own
and another they joined was still told "Share an idea, or join one" (Open) and "Build together
in a hub" (Next). The shared demo account is that developer, so the first screen of the demo
contradicted every other screen.

## Decision

We chose:

- **The idea step is done** with an idea that is open or closed (not a draft), or with a hub
  the developer is an active member of. Joining someone's idea is the other way through the step.
- **The hub step is done** with a hub the developer is an active member of, as owner or member,
  in any phase. An archived hub counts: the developer did build together, and ending the hub
  does not undo that. `GET /v1/me/hubs` lists only active memberships, archived hubs included,
  so one request with no filter answers it.
- **A done step keeps a quiet link** ("Your ideas", "Your hubs"). A waiting invitation stays the
  main button of the screen even when the hub step is done, because someone is waiting for an
  answer. Verifying then shows as an open step, as it already did.
- **The steps stay a skeleton until all the reads settle** (ideas, hubs and invitations), so no
  step shows as Next and then moves to Done under the pointer. Profile and verification do not
  depend on the reads but wait with the others: one list that appears once is calmer than two
  that change at different times.
- **A read that fails counts as "nothing known"**: its step says what it said before the
  change. A step never claims something the API did not confirm. There is no retry button,
  because the rest of the village works without the reads.
- **Ideas are read page by page** until one that is not a draft turns up, because drafts can
  fill the first page. Hubs need only the first page: any hub in it means done.
- **No special case for the demo account.** It reads the same lists as anyone, and reads are
  never refused in the demo.
- **The step texts stay as they were.** Each sentence describes the step for anyone, in the
  third person, so none becomes untrue when the step is done.

## Options we considered

- **Mark steps from `GET /v1/me`.** It carries no ideas or hubs, and adding counts there is an
  API change this fix does not need.
- **Show each step as soon as its own read answers.** Steps would change one at a time and the
  main button could move while a pointer is on it.
- **Count only active hubs.** A developer whose only hub is archived would be told to build in
  a hub again, though they did.

## Consequences

- The village makes three small requests on each visit and each time it is shown again, and
  follows their answers, so a step is never stale after an idea is shared or a hub is joined.
- A developer with many drafts costs a few more requests to the ideas list, until a published
  idea is found.
