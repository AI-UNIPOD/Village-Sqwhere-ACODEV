# A feed post when a hub moves forward

## Context

The feed has had a `hub_milestone` post type since the start, but nothing wrote one, and the post
lists hid every post tied to a hub because hubs were not finished yet
(`2026-11-11-posts-pagination-and-visibility.md`). Hubs now have real phases. The build plan
(F4) proposed a feed post when a hub moves phase, and tracker row 108 asks for it. On
2026-11-15 Tanny chose an automatic post that shows only the hub's name and the new phase.

## Decision

- Confirming the team and every move forward add one `hub_milestone` post, in the same
  transaction as the move. The owner is its author. Moving back adds nothing.
- The post holds only the hub's name and the phase. The hub's name is already on its card, which
  every signed-in developer can read. The idea's title, summary and brief are never in it.
- The body is a fixed English sentence ("Farm Ledger Hub moved to Build."). The card adds
  `milestone: {hub_id, hub_name, phase}` so the web can say it in English or French. The phase is
  read from the phase move saved in the same transaction, which has the same `created_at`, so
  no new column is needed. `hub_name` is the hub's name now, so a rename shows.
- People still cannot create one through `POST /v1/posts`. The owner cannot edit it (`409
  MILESTONE_NOT_EDITABLE`) but can delete it. Likes, saves and comments work as on any post.
- The demo rule holds: a demo hub's milestones are seen only in the demo.

## Options we considered

- Let the owner choose whether to post. Not chosen by Tanny: a milestone is news for the
  village, and the owner can still delete it.
- Store the phase in the post's title. Not chosen: the web shows titles as text, so it would
  print "build" on older screens.
- A new column for the phase. Not chosen: the phase move already records it, in the same
  transaction.

## Consequences

The feed shows hubs moving. The web side, rendering a milestone card from `milestone` in both
languages, is still to build; until then the English body shows. Milestone posts written outside
a phase move (none today) would have `phase: null`.
