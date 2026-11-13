import { expect, test } from "vitest";

import { generateMetadata } from "./page";

test.each([
  ["en", "Verification interview | Village Sqwhere"],
  ["fr", "Entretien de vérification | Village Sqwhere"],
])("the browser tab names the interview page in %s", async (lang, title) => {
  const metadata = await generateMetadata({ params: Promise.resolve({ lang }) } as PageProps<"/[lang]/verification/interview">);
  expect(metadata.title).toBe(title);
});
