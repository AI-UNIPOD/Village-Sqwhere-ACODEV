import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { IdeaComposer } from "../../../ideas/composer";
import { copy } from "../../../ideas/copy";
import { IdeasLoading } from "../../../ideas/my-ideas";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas/compose">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].composePageTitle };
}

export default async function ComposeIdeaPage({ params }: PageProps<"/[lang]/ideas/compose">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the idea's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<IdeasLoading lang={lang} />}>
      <IdeaComposer lang={lang} />
    </Suspense>
  );
}
