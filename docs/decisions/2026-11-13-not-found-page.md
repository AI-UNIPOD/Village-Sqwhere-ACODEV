# The page for an address that leads nowhere

## Context

An unknown address under `/en` or `/fr` was caught by a catch-all page that called
`notFound()`. With Cache Components on, Next answers such a page with a 404 status and an
empty document, then asks the browser to draw the page. Measured on a production build:
`/en/nope` came back as 1,227 bytes with no heading in it. On a slow phone that is a blank
screen until the scripts arrive, and with scripts off it stays blank.

The page itself was one sentence and one button. It did not say which address was asked for,
offer a way back, or suggest where to go.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **Unmatched addresses get real HTML.** `experimental.globalNotFound` is on, the catch-all
  page is gone, and `app/global-not-found.tsx` is the document Next sends: a 404 status and the
  whole page in the HTML (22 KB for `/en/nope`). The flag is described in Next's own docs,
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`, for
  exactly our case: a root layout under a dynamic segment (`app/[lang]/layout.tsx`).
- **One document, every language.** Next builds that document once and cannot know the
  address when it does. So it holds the page in English and in French, and a script that runs
  before first paint reads the language from the address and sets it on `<html>`;
  `globals.css` shows the matching page. With scripts off the page is in English. The same
  script sets the saved theme and the tab title.
- **The page says what happened and offers four ways out,** in reading order: the message and
  the address asked for; "Back to the home page" (or "Back to your village" when signed in)
  and "Go back to where you were" when there is a page to go back to; then the places most
  people wanted (ideas, hubs and profile when signed in; how it works and sign-in for a
  visitor).
- **No search box.** Nothing in the API searches yet. The suggested places do that job.
- **One small scene, played with on purpose.** The palaver tree is an outline and 26 people
  drift around it: nobody is gathered at this address. "Call everyone back" walks them into
  the tree's shape and the logo appears where they stand, then the page says the page is still
  missing. It is the landing page's gathering in small, and it is the only decoration.
- **Motion follows the design system's rules.** Only `transform` and `opacity` move. The walk
  runs when the visitor asks for it, never on its own. With reduced motion nobody drifts or
  walks: the people fade and the tree fades in.
- **The scene is for the eye only** (`aria-hidden`). Its meaning is in the status line under
  it, which a screen reader hears change, and the button is an ordinary button.

## Options we considered

- **Keep the catch-all and `notFound()`.** It keeps the language on the server, but the page is
  drawn by the browser, which is the problem.
- **A catch-all that renders the page as a normal page.** Real HTML in the right language, but
  with a 200 status: a "soft 404" that link checkers and analytics count as a working page.
- **A proxy that rewrites unknown addresses with a 404 status.** It would need its own list of
  every route, kept in step by hand.
- **Choose the language after the page loads.** Simpler, but a French visitor would see the
  English page first.
- **A canvas scene like the landing hero's.** It cannot be in the server's HTML and needs more
  script than a 404 should carry. The scene is an SVG moved by the stylesheet.

## Consequences

- An address with no language at all, like `/ideas`, still matches `app/[lang]` and reaches
  `notFound()`, so that one is still drawn by the browser (the same page, with a 404 status).
  Next does not allow `dynamicParams = false` with Cache Components, which would have fixed it.
- The fonts are loaded in `app/fonts.ts`, shared by the layout and the new document.
- The document carries the page twice, once per language. A third language adds a third copy
  and one line in `globals.css`; a test fails if that line is missing.
- `globalNotFound` is experimental. If a Next upgrade changes it, the tests on the document
  and a `curl -I` against `next start` for `/en/nope` will show it.
- Any new place a signed-in developer can go should be considered for the suggested places.
