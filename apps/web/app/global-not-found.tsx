import { FONT_CLASSES } from "./fonts";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "./landing/theme";
import { LOCALES } from "./locales";
import { copy } from "./page-not-found/copy";
import { NOT_FOUND_TITLES } from "./page-not-found/metadata";
import { NotFoundPage } from "./page-not-found/not-found-page";
import { TabTitle } from "./page-not-found/tab-title";

// Runs before first paint. Next builds this document once and sends it for every address that
// matches no page, so the server cannot know the address's language: this reads it from the
// address, and globals.css shows that language's page. Then the saved theme, as in the layout.
// It is built only from this repository's own words, never from the address or anything sent.
export const NOT_FOUND_INIT_SCRIPT = `try{var l=location.pathname.split("/")[1],t=${JSON.stringify(NOT_FOUND_TITLES)};if(t[l]){document.documentElement.lang=l;document.title=t[l]}}catch(e){}${THEME_INIT_SCRIPT}`;

// The page for an address that matches no route: sent as real HTML with a 404 status, without
// rendering a layout. It holds the page in every language; all but one are hidden. Without
// scripts it stays in English.
export default function GlobalNotFound() {
  return (
    <html lang="en" className={FONT_CLASSES} suppressHydrationWarning>
      <head>
        <title>{copy.en.pageTitle}</title>
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: NOT_FOUND_INIT_SCRIPT }} />
        <TabTitle titles={NOT_FOUND_TITLES} />
        {LOCALES.map((lang) => (
          <div key={lang} lang={lang} data-not-found={lang}>
            <NotFoundPage lang={lang} />
          </div>
        ))}
      </body>
    </html>
  );
}
