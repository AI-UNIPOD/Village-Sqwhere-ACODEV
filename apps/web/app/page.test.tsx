import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "./page";

test("shows the product name as the page heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "Village Sqwhere" })).toBeTruthy();
});

test("shows the logo above the heading", () => {
  const { container } = render(<Home />);
  const logo = container.querySelector('svg[fill="var(--logo)"]');
  expect(logo?.getAttribute("width")).toBe("64");
});
