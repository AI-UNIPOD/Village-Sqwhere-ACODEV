import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import tokens from "../../../../docs/design-system/tokens.json";
import { THEME_INIT_SCRIPT } from "../landing/theme";
import RootLayout, { viewport } from "./layout";

// next/font only works inside the Next.js compiler
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Unbounded: font, Onest: font, JetBrains_Mono: font };
});

// An unknown language must not stop the layout: the page under it calls notFound(), so the
// 404 is drawn by [lang]/not-found.tsx inside a normal document, in English.
test.each([
  ["en", "en"],
  ["fr", "fr"],
  ["xx", "en"],
])("the layout for /%s sets the page language to %s", async (lang, expected) => {
  const layout = await RootLayout({
    children: <p>page</p>,
    params: Promise.resolve({ lang }),
  } as LayoutProps<"/[lang]">);
  expect(renderToStaticMarkup(layout)).toContain(`<html lang="${expected}"`);
});

// The theme is set by a plain inline script, the first thing in the body, so it runs before
// anything is painted: next/script's beforeInteractive ran only after the first paint.
test("the early theme script is a plain inline script, the first thing in the body", async () => {
  const layout = await RootLayout({
    children: <p>page</p>,
    params: Promise.resolve({ lang: "en" }),
  } as LayoutProps<"/[lang]">);
  const html = renderToStaticMarkup(layout);
  // the skip link comes right after it, before the page
  expect(html).toContain(`<body><script>${THEME_INIT_SCRIPT}</script><a `);
  expect(html).toContain(">Skip to main content</a><p>page</p>");
});

// On a phone the browser's bars take the page's background from the tokens, and the page may
// reach under the notch, so the safe-area insets the bottom bar and the body use are real.
test("the viewport colours the browser's bars from the tokens and reaches under the notch", () => {
  expect(viewport.viewportFit).toBe("cover");
  expect(viewport.themeColor).toEqual([
    { media: "(prefers-color-scheme: light)", color: tokens.theme.light.bg },
    { media: "(prefers-color-scheme: dark)", color: tokens.theme.dark.bg },
  ]);
});

test("a tap shows no grey box, a pressed link dims on touch, and the body keeps clear of the notch", () => {
  const css = readFileSync(join(__dirname, "..", "globals.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toContain("html { -webkit-tap-highlight-color: transparent; }");
  expect(css).toContain("@media (hover: none) { :where(a[href]):active { opacity: 0.7; } }");
  expect(css).toContain("padding-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);");
});
