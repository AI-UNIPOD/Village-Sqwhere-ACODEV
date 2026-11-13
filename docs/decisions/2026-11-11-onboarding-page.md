# Onboarding page with static data first

## Context

After a developer's first GitHub sign-in, the app shows an onboarding page. It asks for the
main role, stack, country and idea topics. The design is ready. The web app does not call the
API yet, and the API lacks parts the design needs:

1. There is no onboarding completion field.
2. Users have no country field.
3. Feed topics reference technologies, not idea domains.
4. Lookup names are English only.
5. There is no preferred language.
6. Saving takes several calls, and it can half fail.
7. The GitHub name overwrites the developer's own name at each sign-in.

## Decision

Tanny chose, on 11 November 2026, to build the full design now, with static data:

- **Made-up demo profile.** The role and stack lists match the API slugs. The topic list is a
  draft of idea domains. Answers stay in the page. Nothing is saved, and the page calls no API.
  *Update, 12 November 2026:* the answers also stay in `sessionStorage` for the tab, so a reload
  or a dropped tab does not send the person back to step 1 (WCAG 3.3.7). They are read once on
  load, written on every change and checked on read: unknown values are dropped. If storage is
  blocked, the page works as before. They go when the tab closes, and still nothing reaches the API.
  *Update, 13 November 2026:* the done step now saves the role and the stack
  (`POST /v1/me/roles`, then `PUT /v1/me/technologies`). Both map to endpoints that exist, with
  no workaround, the calls can be sent again safely, and role verification needs a claimed role.
  The country and the topics still wait for the API (gaps 2 and 3) and stay in the tab.
- **One question per screen.** Role and stack are required. Country and topics are optional.
  The step sits in the address (`?step=`), so the browser back button moves between steps.
- **Welcome step.** It reuses `GatherHero` unchanged.
- **Feed topics are idea domains, not technologies.** This is the owner's choice. The list is
  still a draft.
- **Motion with no new dependency.** Steps change with React's `<ViewTransition>`, timed with
  `--dur-modal` and `--dur-modal-out` on `--ease-out`. With reduced motion, steps crossfade.

The design follows these sources: NN/g articles on onboarding and personalisation, the GOV.UK
pattern for question pages, the WAI-ARIA APG radio and button patterns, and WCAG 3.3.7
Redundant Entry.

## Options we considered

- **Wait for the API.** The page would stay unbuilt, and the design could not be checked in
  the app.
- **Call the API now.** The gaps would force workarounds: a completion flag that does not
  exist, a country stored nowhere, technologies used as topics, and a save that can half fail.
- **Add an animation library for the steps.** It adds weight for one transition.
  `<ViewTransition>` covers the need with no new dependency.

## Consequences

- The page can be reviewed in the running app and tested without the API.
- Connecting it needs gaps 1, 2 and 3 closed, plus one save endpoint (gap 6).
- Until the API serves French lookup names (gap 4), the web app keeps French labels by slug
  in its own files.
- The topic list stays a draft until the team agrees the idea domains.
