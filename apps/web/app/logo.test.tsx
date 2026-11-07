import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { LOGO_PATHS, Logo } from "./logo";

const logoDir = join(__dirname, "../../../docs/design-system/logo");
const read = (name: string) => readFileSync(join(logoDir, name), "utf8");

test("draws the same paths as the design system logo files", () => {
  for (const file of [
    "palaver-tree-v_on-paper.svg",
    "palaver-tree-v_on-ink.svg",
    "palaver-tree-v_laterite-700.svg",
    "palaver-tree-v_laterite.svg",
  ]) {
    const paths = [...read(file).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual(LOGO_PATHS);
  }
});

test("takes its colour from the theme and stays hidden from screen readers", () => {
  const { container } = render(<Logo size={24} />);
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("fill")).toBe("var(--logo)");
  expect(svg?.getAttribute("width")).toBe("24");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
});

test("the browser tab icon is the design system's on-paper logo", () => {
  const icon = readFileSync(join(__dirname, "icon.svg"), "utf8");
  expect(icon).toBe(read("palaver-tree-v_on-paper.svg"));
});
