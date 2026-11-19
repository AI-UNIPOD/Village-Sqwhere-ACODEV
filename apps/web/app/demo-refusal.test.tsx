import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { failureOf, isDemoRefusal, NotSaved } from "./demo-refusal";
import { IdeaError } from "./ideas/ideas-api";

afterEach(cleanup);

const refused = new IdeaError(403, "DEMO_READ_ONLY");

test("only the API's refusal of the demo account is a demo refusal", () => {
  expect(isDemoRefusal(refused)).toBe(true);
  expect(isDemoRefusal(new IdeaError(403, "NOT_HUB_OWNER"))).toBe(false);
  expect(isDemoRefusal(new Error("403 DEMO_READ_ONLY"))).toBe(false);
});

test("a refused change is kept as the demo's, and any other failure as the screen's own sentence", () => {
  expect(failureOf(refused, "The screen's own sentence.")).toBe("demo");
  expect(failureOf(new IdeaError(500, "UNKNOWN"), "The screen's own sentence.")).toBe("The screen's own sentence.");
  expect(failureOf(new TypeError("Failed to fetch"), "The screen's own sentence.")).toBe("The screen's own sentence.");
});

test.each([
  ["en", "Nothing was saved. The demo cannot be changed."],
  ["fr", "Rien n'a été enregistré. La démo ne peut pas être modifiée."],
] as const)("the line is a calm status in %s: no alert, no icon, and no word about the content", (lang, sentence) => {
  const { container } = render(<NotSaved lang={lang} />);
  expect(screen.getByRole("status").textContent).toBe(sentence);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(container.querySelector("svg")).toBeNull();
});
