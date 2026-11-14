# The profile page

## Context

Until now a developer could not see or change their main role, stack, name or bio after
onboarding, or hold a second role. The API already had every call needed (`/v1/me` and its
role and technology routes). The page is the developer's own: no route shows someone else.

## Decision

`/{lang}/profile` has four parts: You, Roles, Stack, Account.

Update, 2026-11-14: a Sectors part now sits between Stack and Account. It works like Stack: chips
from the onboarding list, a "Save sectors" button that is disabled until a chip changes, and
the whole list sent to `PUT /v1/me/sectors`.

- Roles and the stack change at once on a press (adding a role, making it main, removing it
  after a confirmation). The name and bio, and the stack, wait for a Save button. After a role
  change the page loads `GET /v1/me` again, so it always shows what the API holds. Name and
  bio use the profile the API answers with, and the stack uses the list it answers with.
- Adding a role always sends `is_primary: false`, and the chips are hidden for a developer with
  no role: their first role is chosen in onboarding, so a profile never has roles and no main
  one.
- Verification works on the main role only, so another role offers "Make it my main role"
  instead of a verify link, with a line of helper text saying why.
- Rows are shown with the main role first, then in the order of the role list. The API returns
  them in an order that changes with every edit, which made rows jump.
- "Save" is always pressable. With nothing changed it sends nothing and says "Saved", because
  what is on screen is what the API holds. "Save stack" is disabled until a chip changes, as the
  brief asks.
- Chips here are 44px high, not the design system's 36px: they are the only way to add a role,
  and a tap target is at least 44px.
- A developer with no role sees a main "Set up my profile" button beside Save. That is a second
  orange button, but it is the one thing that person has to do.

## Options we considered

- Adding a second role as a radio list with a confirm button: slower for something that is
  undone with Remove.
- Editing the answer in memory after a role change instead of loading again: it can drift from
  the API (for example the verification state).

## Consequences

The API cannot clear a bio to nothing with `null` (it ignores it), so an emptied bio is sent as
an empty string. A role with verification attempts can never be removed (the API refuses it
and the row says so).
