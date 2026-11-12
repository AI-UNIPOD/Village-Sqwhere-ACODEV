import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(join(__dirname, "onboarding.module.css"), "utf8");

// The design system changes layout at 768px and 1100px only (spacing-and-layout.md).
test("every width in an onboarding media query is a design system breakpoint", () => {
  const widths = [...css.matchAll(/\(\s*(?:min-|max-)?width:\s*([^)]+)\)/g)].map((m) => m[1].trim());
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) {
    expect(["768px", "1100px"], `width ${width}`).toContain(width);
  }
});
