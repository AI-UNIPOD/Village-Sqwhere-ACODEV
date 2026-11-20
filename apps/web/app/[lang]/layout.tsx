import type { Metadata } from "next";

import { FONT_CLASSES } from "../fonts";
import { copy } from "../landing/copy";
import { THEME_INIT_SCRIPT } from "../landing/theme";
import { LOCALES, hasLocale } from "../locales";
import { ReducedMotionNotice } from "../reduced-motion-notice";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// the browser's bars and the notch, shared with global-not-found.tsx
export { viewport } from "../viewport";

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: "Village Sqwhere", description: copy[lang].description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  // An unknown language is not stopped here: every page under it calls notFound(), and
  // [lang]/not-found.tsx draws the 404 inside this document, in English.

  return (
    // the early theme script sets data-theme on <html> before React hydrates
    <html
      lang={hasLocale(lang) ? lang : "en"}
      className={FONT_CLASSES}
      suppressHydrationWarning
    >
      <body>
        {/* The first thing in the body, so it runs before anything is painted: the saved theme,
            or dark. A plain inline script, like global-not-found.tsx: next/script's
            beforeInteractive only runs once Next's own scripts have loaded, after the first
            paint, which flashed light on a light-mode phone. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        {hasLocale(lang) && <ReducedMotionNotice lang={lang} />}
      </body>
    </html>
  );
}
