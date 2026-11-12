import { lang } from "next/root-params";

import { hasLocale } from "../locales";
import { notFoundMetadata } from "../page-not-found/metadata";
import { NotFoundPage } from "../page-not-found/not-found-page";

// The title is set here and on the catch-all page: which one Next uses depends on whether
// the 404 is found before or after the response starts streaming.
export const generateMetadata = notFoundMetadata;

// A not-found file gets no props, so it reads the language from the address.
export default async function NotFound() {
  const value = await lang();
  return <NotFoundPage lang={hasLocale(value) ? value : "en"} />;
}
