import { afterEach, expect, test, vi } from "vitest";

import CatchAll, { generateMetadata, instant } from "../[lang]/[...rest]/page";

const route = vi.hoisted(() => ({ lang: "en" }));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
);

vi.mock("next/root-params", () => ({ lang: async () => route.lang }));
vi.mock("next/navigation", () => ({ notFound }));

afterEach(() => notFound.mockClear());

test("any other address under a language calls notFound", () => {
  expect(() => CatchAll()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(notFound).toHaveBeenCalledOnce();
});

test.each([
  ["en", "Page not found | Village Sqwhere"],
  ["fr", "Page introuvable | Village Sqwhere"],
  ["xx", "Page not found | Village Sqwhere"],
])("the browser tab title for %s says the page was not found", async (lang, title) => {
  route.lang = lang;
  expect((await generateMetadata()).title).toBe(title);
});

// The page always 404s, so there is no instant navigation to validate. Without this the dev
// overlay reports "Could not validate `instant`" on every not-found address.
test("the catch-all page opts out of instant navigation validation", () => {
  expect(instant).toBe(false);
});
