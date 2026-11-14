# A longer landing page that lets visitors try the matcher

## Context

On 14 November 2026 Tanny said the landing page "feels very short", had no motion past the
hero, and that the tour and demo buttons were "pretty much the same thing". The page had the
hero, four steps and a tour section. Tanny asked for a page with more information, more
interaction and more of an experience, inspired by developer tool sites (Infisical, GitLab,
GitHub and others) and design galleries, and for "Join the village" to be the main action.

Research (dev tool pages, 21st.dev, Evil Martians' study of 100 dev tool landing pages, African
product sites) pointed the same way: show the product doing its one job, explain with real
product views instead of icons, prove trust with how verification works, and keep the claims
true.

## Decision

Tanny asked for the change and the direction; the sections are:

1. **Hero:** two buttons only, "Join the village" and "Try the demo". The tour button is gone;
   the line under the demo button says a short tour is inside (it starts from the demo's bar).
2. **Watch the matcher find a team** (`#matcher`): the visitor picks one of three made-up ideas,
   the matcher's steps run in Lagoon, three verified developers are suggested with the
   technologies they share with the owner, and "Invite the three to the hub" shows each one
   sign, then the team formed. It runs once by itself the first time it scrolls into view.
3. **How it works** (`#how`): the four steps, each beside a small view of the real screen.
4. **Inside the hub** (`#hub`): the four phases as tabs, each with a sample of the work.
5. **The Green Tick** (`#green-tick`): the three verification steps and a tick being earned.
6. **How the village works**: four principles.
7. **Questions** (`#faq`): six answers.
8. **A closing band** with both buttons, then the footer.

The header links are Matcher, Hub and FAQ, short enough for the French pill at 360px.

**The page only claims what the product does.** The matcher is role based: it ranks
developers verified in the roles an idea needs, then by technologies in common, and never
reads the idea's text. So the demo's match scores are labelled simulated (scores are planned,
see `2026-11-14-simulated-match-score-in-demo.md`), it never says the matcher "reads your idea", and uses the product's own steps (invite, read the agreement,
sign). The hub's phase tools are not built, so that section is labelled a sample. Every person
and idea on the page is made up, and the page says so.

**Motion:** one moment per section, started by the visitor or by the section's first scroll
into view, never looping (the hero keeps its own loop and pause button). Durations and easings
come from the motion tokens. With reduced motion every section shows its end state at once.
No animation library: CSS, a few timers and IntersectionObserver.

## Options we considered

- **A fit score from 0 to 100 in the demo,** as first drafted: it looks good, but the product
  does not compute one, and a judge who signs in would find the claim false.
- **A scripted video or an auto-playing story of the matcher:** cheaper, but a developer reads
  it as a screenshot. Picking an idea takes one click and shows the real vocabulary.
- **A globe or a map of Africa with arcs:** the "global SaaS" cliché, heavy on phones, and it
  says nothing about building together.
- **Stats and logos:** there are no real numbers or partners yet.
- **A section that flips a card between English and French:** the header's language switch
  already shows it.

## Consequences

- The page is much longer: seven sections between the hero and the footer. Each lives in
  `apps/web/app/landing/sections/` with its own copy, styles and tests, so the page file only
  orders them.
- The demo data (people, ideas, technologies) lives in the section copy files and must stay
  made up.
- The French copy, including the demo's people and ideas, still needs a native speaker's
  review before launch.
- If the matcher later gets a score or reads idea text, the demo and the principles must change
  with it.
