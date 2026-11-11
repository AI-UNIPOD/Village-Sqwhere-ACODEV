// @vitest-environment node
import { NextRequest } from "next/server";
import { expect, test } from "vitest";

import { proxy } from "./proxy";

function redirectFor(acceptLanguage?: string, path = "/") {
  const headers = acceptLanguage ? { "accept-language": acceptLanguage } : undefined;
  const response = proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  const location = new URL(response.headers.get("location")!);
  return { status: response.status, location: location.pathname + location.search };
}

test("sends French speakers from the bare address to /fr", () => {
  expect(redirectFor("fr-SN,fr;q=0.9,en;q=0.5")).toEqual({ status: 307, location: "/fr" });
});

test("sends everyone else to /en, including visitors with no language header", () => {
  expect(redirectFor("en-NG,en;q=0.9").location).toBe("/en");
  expect(redirectFor().location).toBe("/en");
});

test("sends the sign-in return to the visitor's language and keeps the login code", () => {
  const path = "/auth/callback?login_code=lc_demo123";
  expect(redirectFor("fr-SN,fr;q=0.9", path).location).toBe("/fr/auth/callback?login_code=lc_demo123");
  expect(redirectFor("en-NG,en;q=0.9", path).location).toBe("/en/auth/callback?login_code=lc_demo123");
  expect(redirectFor(undefined, path).location).toBe("/en/auth/callback?login_code=lc_demo123");
});

test("keeps the error code when the sign-in return is a failure", () => {
  expect(redirectFor("fr", "/auth/callback?error=ACCESS_DENIED").location).toBe(
    "/fr/auth/callback?error=ACCESS_DENIED",
  );
});
