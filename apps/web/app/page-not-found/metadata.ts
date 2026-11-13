import type { Metadata } from "next";
import { lang } from "next/root-params";

import { hasLocale } from "../locales";
import { copy } from "./copy";

// The tab title in the address's language. An unknown language gets English.
export async function notFoundMetadata(): Promise<Metadata> {
  const value = await lang();
  return { title: copy[hasLocale(value) ? value : "en"].pageTitle };
}
