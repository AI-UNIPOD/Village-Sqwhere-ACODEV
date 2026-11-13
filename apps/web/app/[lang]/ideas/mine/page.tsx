import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../ideas/copy";
import { IdeasLoading, MyIdeas } from "../../../ideas/my-ideas";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas/mine">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].minePageTitle };
}

export default async function MyIdeasPage({ params }: PageProps<"/[lang]/ideas/mine">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the message after publishing) needs a Suspense boundary above it
  return (
    <Suspense fallback={<IdeasLoading lang={lang} />}>
      <MyIdeas lang={lang} />
    </Suspense>
  );
}
