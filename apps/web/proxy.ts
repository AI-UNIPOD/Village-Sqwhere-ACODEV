import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { pickLocale } from "./app/locales";

// The site lives under /en and /fr. An address with no language goes to the same address in
// the visitor's language: the bare address, the API's sign-in return (which knows no language
// and carries a one-time code in its query), and anything typed without one, like /ideas. The
// clone keeps the query string.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/${pickLocale(request.headers.get("accept-language"))}${path}`;
  return NextResponse.redirect(url);
}

// Every address but those that already start with a language, Next's own files and files with
// an extension (the icon). Next reads this at build time, so the languages are written out:
// proxy.test.ts fails if one from LOCALES is missing.
export const config = { matcher: ["/", "/((?!_next/|en(?:/|$)|fr(?:/|$)|.*\\..*).+)"] };
