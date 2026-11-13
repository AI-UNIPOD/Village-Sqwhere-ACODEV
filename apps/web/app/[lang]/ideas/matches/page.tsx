import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../ideas/copy";
import { IdeaMatches } from "../../../ideas/idea-matches";
import { IdeasLoading } from "../../../ideas/my-ideas";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas/matches">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].matches.pageTitle };
}

export default async function IdeaMatchesPage({ params }: PageProps<"/[lang]/ideas/matches">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the idea's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<IdeasLoading lang={lang} />}>
      <IdeaMatches lang={lang} />
    </Suspense>
  );
}
