import type { Metadata } from "next";
import { lang } from "next/root-params";

import { LOCALES, hasLocale } from "../locales";
import { copy } from "./copy";

/** The tab title of the not-found page, by language. */
export const NOT_FOUND_TITLES: Record<string, string> = Object.fromEntries(LOCALES.map((lang) => [lang, copy[lang].pageTitle]));

// The tab title in the address's language. An unknown language gets English.
export async function notFoundMetadata(): Promise<Metadata> {
  const value = await lang();
  return { title: copy[hasLocale(value) ? value : "en"].pageTitle };
}
