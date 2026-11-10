import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { pickLocale } from "./app/locales";

// The site lives under /en and /fr. The bare address sends people to their language.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/${pickLocale(request.headers.get("accept-language"))}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/"] };
