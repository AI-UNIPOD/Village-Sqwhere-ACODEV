import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { HeadingText } from "./heading-text";

afterEach(cleanup);

test("the full stop gets its own mark, and the heading still reads and is named in full", () => {
  render(
    <h2>
      <HeadingText text="Questions, answered plainly." />
    </h2>,
  );
  const heading = screen.getByRole("heading", { name: "Questions, answered plainly." });
  expect(heading.textContent).toBe("Questions, answered plainly.");
  expect(heading.querySelector("span")?.textContent).toBe(".");
});

test("a title without a full stop is left as it is", () => {
  render(
    <h2>
      <HeadingText text="Vos questions" />
    </h2>,
  );
  expect(screen.getByRole("heading", { name: "Vos questions" }).querySelector("span")).toBeNull();
});
