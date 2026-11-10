// @vitest-environment node
import { NextRequest } from "next/server";
import { expect, test } from "vitest";

import { proxy } from "./proxy";

function redirectFor(acceptLanguage?: string) {
  const headers = acceptLanguage ? { "accept-language": acceptLanguage } : undefined;
  const response = proxy(new NextRequest("http://localhost:3000/", { headers }));
  return { status: response.status, location: new URL(response.headers.get("location")!).pathname };
}

test("sends French speakers from the bare address to /fr", () => {
  expect(redirectFor("fr-SN,fr;q=0.9,en;q=0.5")).toEqual({ status: 307, location: "/fr" });
});

test("sends everyone else to /en, including visitors with no language header", () => {
  expect(redirectFor("en-NG,en;q=0.9").location).toBe("/en");
  expect(redirectFor().location).toBe("/en");
});
