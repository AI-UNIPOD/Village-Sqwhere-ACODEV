import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../../locales";
import { copy } from "../../../people/copy";
import { PersonLoading, PersonPage } from "../../../people/person-page";

export async function generateMetadata({ params }: PageProps<"/[lang]/people/view">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function PersonViewPage({ params }: PageProps<"/[lang]/people/view">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the username) needs a Suspense boundary above it
  return (
    <Suspense fallback={<PersonLoading lang={lang} />}>
      <PersonPage lang={lang} />
    </Suspense>
  );
}
