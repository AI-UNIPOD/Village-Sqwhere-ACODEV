import type { Metadata } from "next";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import Script from "next/script";

import { copy } from "../landing/copy";
import { THEME_INIT_SCRIPT } from "../landing/theme";
import { LOCALES, hasLocale } from "../locales";
import "../globals.css";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

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
      className={`${unbounded.variable} ${onest.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </body>
    </html>
  );
}
