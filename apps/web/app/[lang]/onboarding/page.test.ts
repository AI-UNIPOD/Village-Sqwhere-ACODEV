import { expect, test } from "vitest";

import { generateMetadata } from "./page";

test.each([
  ["en", "Set up your profile | Village Sqwhere"],
  ["fr", "Configurer votre profil | Village Sqwhere"],
])("the browser tab names the onboarding page in %s", async (lang, title) => {
  const metadata = await generateMetadata({ params: Promise.resolve({ lang }) } as PageProps<"/[lang]/onboarding">);
  expect(metadata.title).toBe(title);
});
