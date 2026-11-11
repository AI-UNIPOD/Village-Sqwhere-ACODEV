import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { pickLocale } from "./app/locales";

// The site lives under /en and /fr. The bare address and the API's sign-in return (which knows
// no language and carries a one-time code in its query) go to the visitor's language. The
// clone keeps the query string.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/${pickLocale(request.headers.get("accept-language"))}${path}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/", "/auth/callback"] };
