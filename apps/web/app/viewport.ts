import type { Viewport } from "next";

import tokens from "../../../docs/design-system/tokens.json";

// The viewport of every document the app sends: the layout's pages and the page for an address
// that matches nothing (global-not-found.tsx), so all of them colour the browser's bars.
// On a phone the browser's own bars take the page's background, in light and dark, read from
// the design tokens; the early theme script (landing/theme.ts) then gives them the theme the
// page opened in, dark unless the visitor saved light. viewport-fit=cover lets the page reach
// under the notch and the home indicator, so the safe-area insets are real: the bottom bar
// (app-frame.module.css) and the body's side padding (globals.css) keep clear of them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tokens.theme.light.bg },
    { media: "(prefers-color-scheme: dark)", color: tokens.theme.dark.bg },
  ],
};
