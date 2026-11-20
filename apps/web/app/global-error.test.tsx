import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import GlobalError from "./global-error";
import { LOCALES } from "./locales";
import { copy } from "./page-error/copy";

// next/font only works inside the Next.js compiler
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Unbounded: font, Onest: font, JetBrains_Mono: font };
});

test("a failure in the root layout gets its own page, in both languages, with a way to try again", () => {
  const html = renderToStaticMarkup(<GlobalError retry={() => {}} />);
  expect(html.startsWith("<html")).toBe(true);
  for (const lang of LOCALES) {
    expect(html).toContain(`<section lang="${lang}">`);
    expect(html).toContain(copy[lang].heading.replace("'", "&#x27;"));
    expect(html).toContain(`>${copy[lang].retry}</button>`);
  }
  expect(html.match(/<h1/g)).toHaveLength(1);
});
