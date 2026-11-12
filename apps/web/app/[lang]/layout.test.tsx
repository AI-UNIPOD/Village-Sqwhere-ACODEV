import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import RootLayout from "./layout";

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
