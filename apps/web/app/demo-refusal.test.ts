import { expect, test } from "vitest";

import { failureLine, isDemoRefusal, notSaved } from "./demo-refusal";
import { copy } from "./feed/copy";
import { IdeaError } from "./ideas/ideas-api";

const refused = new IdeaError(403, "DEMO_READ_ONLY");

test("only the API's refusal of the demo account is a demo refusal", () => {
  expect(isDemoRefusal(refused)).toBe(true);
  expect(isDemoRefusal(new IdeaError(403, "NOT_HUB_OWNER"))).toBe(false);
  expect(isDemoRefusal(new Error("403 DEMO_READ_ONLY"))).toBe(false);
});

test.each(["en", "fr"] as const)("a refused change says the feed's sentence in %s, and any other failure keeps the screen's own", (lang) => {
  expect(notSaved(lang)).toBe(copy[lang].notSaved);
  expect(failureLine(refused, lang, "The screen's own sentence.")).toBe(copy[lang].notSaved);
  expect(failureLine(new IdeaError(500, "UNKNOWN"), lang, "The screen's own sentence.")).toBe("The screen's own sentence.");
  expect(failureLine(new TypeError("Failed to fetch"), lang, "The screen's own sentence.")).toBe("The screen's own sentence.");
});
