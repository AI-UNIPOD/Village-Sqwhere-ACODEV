# docs

Everything written about Village Sqwhere that is not code: how it fits together, every API
route with examples, why each choice was made, and the design system the screens are built
from.

```text
docs/
  architecture.md      the parts, every API route, the core flow (a test fails if a route is missing)
  backend.md           the API reference: conventions, every endpoint with requests and answers
  PROGRESS.md          where the project stands and what comes next
  decisions/           59 decision records, one per choice someone might question
    _template.md       Context, Decision, Options we considered, Consequences
  design-system/       tokens, colour, type, spacing, components, logo, voice and tone
  images/              screenshots used by the READMEs (made-up people and ideas)
```

## Which one to open

| You want to | Open |
|---|---|
| See how a request reaches the database | [architecture.md](architecture.md) |
| Call an endpoint: its body, answers and error codes | [backend.md](backend.md) |
| Know why something works the way it does | [decisions/](decisions/) |
| Build or change a screen | [design-system/README.md](design-system/README.md) |
| Know what is done and what is next | [PROGRESS.md](PROGRESS.md) |

## A decision record

Each record is short and dated. This is the start of
[`2026-11-14-hub-edit-and-archive.md`](decisions/2026-11-14-hub-edit-and-archive.md):

```markdown
# Renaming and archiving a hub

## Context
A hub's name and description were fixed when it was created ...

## Decision
- `PATCH /v1/hubs/{hub_id}`: the owner changes the name, the description or both ...
- `POST /v1/hubs/{hub_id}/archive`: the owner archives the hub. It is one way ...

## Options we considered
## Consequences
```

## The design system in one look

<p>
  <img src="design-system/logo/palaver-tree-v_on-paper.svg" alt="The palaver tree logo on a light background" width="96" />
  <img src="design-system/logo/palaver-tree-v_on-ink.svg" alt="The palaver tree logo on a dark background" width="96" />
</p>

Screens use the tokens' jobs, never raw colours, so light and dark themes come for free:

```css
/* design-system/tokens.css */
--laterite: #F0601F;   /* the brand orange: main buttons, the logo */
--lagoon:   #3DBFDB;   /* the second accent */

/* in a component */
.button { background: var(--action); color: var(--on-action); }
```

[`tokens.json`](design-system/tokens.json) is the source, [`tokens.css`](design-system/tokens.css)
mirrors it, and a web test fails if the two disagree.
