import { lang } from "next/root-params";

import { hasLocale } from "../locales";
import { NOT_FOUND_TITLES, notFoundMetadata } from "../page-not-found/metadata";
import { NotFoundPage } from "../page-not-found/not-found-page";
import { TabTitle } from "../page-not-found/tab-title";

export const generateMetadata = notFoundMetadata;

// Shown when a page under a language calls notFound(), which today means an unknown language
// such as /xx. An address that matches no page at all gets app/global-not-found.tsx instead.
// A not-found file gets no props, so it reads the language from the address.
export default async function NotFound() {
  const value = await lang();
  return (
    <>
      {/* this page is drawn by the browser, which does not get the title above */}
      <TabTitle titles={NOT_FOUND_TITLES} />
      <NotFoundPage lang={hasLocale(value) ? value : "en"} />
    </>
  );
}
