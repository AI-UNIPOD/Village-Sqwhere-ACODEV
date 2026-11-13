# A home for signed-in developers: the village

## Context

After sign-in and onboarding, the product had nowhere to go: the last onboarding screen ended
on a "Go to the village" button that said "Coming soon". Every screen still to build (role
verification, ideas, matches, hubs) needs a place to start from and a shared header. The API
already answers who the developer is (`GET /v1/me`: roles, verification, stack), and since
13 November onboarding saves the main role and the stack.

## Decision

Tanny gave the web frontend to one owner on 13 November 2026, who chose:

- **The home is `/{lang}/village`.** "Village" reads the same in English and French, and the
  onboarding copy already promises it.
- **It shows real state only.** A card with the developer's name, GitHub username, main role,
  verified or not, and stack, all from `GET /v1/me`. No counters, no feed, no sample data.
- **One list of four steps, each done, next or later:** set up your profile, earn your Green
  Tick, share an idea or join one, build in a hub. They are the landing page's four steps seen
  from the inside. The step to do now stands out as a card, and it is the only place a main
  button appears. A step gets its button when its screen exists: today that is profile setup.
- **Verifying comes before ideas in the list** because the matching design only suggests
  developers whose role is verified. Sharing an idea will not require a Green Tick, so both
  steps can be open at once later.
- **A developer who already has a role skips onboarding.** The bare onboarding address sends
  them to the village; a link to a step (`?step=role`, "Change my answers") still opens. The
  API has no completion flag yet (gap 1 in the onboarding record), so someone who pressed
  "Skip for now" sees the welcome again at their next sign-in.
- **One header for signed-in screens, `AppFrame`.** It is the onboarding header, made shared:
  the logo (home is the village once signed in), the language link for the same screen, and
  sign out. Below 480px the name next to the logo is hidden from sight, not from screen readers,
  so "Sign out" and "Déconnexion" stay on one line at 360px.
- **Initials, not photos, for the avatar,** as the design system says, and to keep the page
  light on slow connections.

The design follows NN/g on empty states (say the status, teach, link to the action that fills
it) and on progress (name the steps), and the pattern of one main action beside a short
checklist that completes from real events.

## Options we considered

- **A dashboard of cards** (ideas, matches, hubs, reviews), each empty with its own button: a
  new member would see four empty boxes and no order.
- **Sending everyone to the village and dropping the onboarding welcome:** loses the first
  moment that greets a developer by name, which is designed and tested.
- **A bottom tab bar now:** there is one destination. Navigation comes with the second and
  third screens, as a bottom bar on phones and links in the header on wide screens.
- **Showing ideas and hubs as "Coming soon" buttons:** a button that does nothing. A step
  without a button is a plan, not a dead end.

## Consequences

- Each new screen lights up its step: it adds a link and, where the API tells us, a state.
- The village loads `GET /v1/me` on every visit. That is one small request; cache it if more
  screens need it at once.
- "Change my answers" opens an empty form in a new tab, because onboarding does not yet read
  the saved role and stack back. Prefill it from `GET /v1/me` when the profile page is built.
- The status pill and the step list live in `app/village/`. Move them to a shared place when a
  second screen uses them.
