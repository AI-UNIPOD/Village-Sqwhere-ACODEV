import { expect, test } from "vitest";

import { copy } from "./copy";
import { secondsOf, stopShares } from "./stops";

test("reads a stop's time as seconds", () => {
  expect(secondsOf("0:30")).toBe(30);
  expect(secondsOf("1:15")).toBe(75);
  expect(secondsOf("3:00")).toBe(180);
});

test("each stop's bar starts where the last one ended, and together they fill the total", () => {
  const { stops, total } = copy.en;
  const shares = stopShares(
    stops.map((s) => s.time),
    total.time,
  );
  expect(shares.map((s) => s.size)).toEqual([30 / 180, 45 / 180, 30 / 180, 75 / 180]);
  expect(shares[0].from).toBe(0);
  for (let i = 1; i < shares.length; i++) {
    expect(shares[i].from).toBeCloseTo(shares[i - 1].from + shares[i - 1].size);
  }
  const last = shares[shares.length - 1];
  expect(last.from + last.size).toBeCloseTo(1);
});
