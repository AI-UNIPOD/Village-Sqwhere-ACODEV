import { expect, test } from "vitest";

import { generateMetadata } from "./page";

const props = (lang: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) });

test.each([
  ["en", "Sign in | Village Sqwhere"],
  ["fr", "Connexion | Village Sqwhere"],
])("the %s sign-in page has its own browser tab title", async (lang, title) => {
  expect(await generateMetadata(props(lang))).toEqual({ title });
});

test("a language the site does not have gets no title", async () => {
  expect(await generateMetadata(props("de"))).toEqual({});
});
