import { expect, test } from "vitest";

import { parseAnswers } from "./saved-answers";
import { NO_ANSWERS } from "./steps";

const saved = (value: unknown) => parseAnswers(JSON.stringify(value));

test("valid saved answers come back as they were", () => {
  const answers = { role: "backend-engineer", stack: ["go", "docker"], country: "SEN", topics: ["fintech"], feed: ["python"] };
  expect(saved(answers)).toEqual(answers);
});

test("anything that is not a saved set of answers gives no answers", () => {
  for (const raw of [null, "", "{not json", "null", "42", '"text"']) expect(parseAnswers(raw)).toEqual(NO_ANSWERS);
});

test("unknown slugs and fields of the wrong shape are dropped one by one", () => {
  expect(
    saved({ role: "wizard", stack: ["react", "cobol", 7, "react"], country: ["SN"], topics: "fintech", feed: ["go", "fintech"] }),
  ).toEqual({ role: null, stack: ["react"], country: null, topics: [], feed: ["go"] });
  expect(saved({ role: "mobile-engineer", country: "ZZ" })).toEqual({
    ...NO_ANSWERS,
    role: "mobile-engineer",
  });
});
