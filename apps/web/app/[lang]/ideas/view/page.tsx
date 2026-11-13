import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../ideas/copy";
import { IdeaPage } from "../../../ideas/idea-page";
import { IdeasLoading } from "../../../ideas/my-ideas";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas/view">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].open.pageTitle };
}

export default async function IdeaViewPage({ params }: PageProps<"/[lang]/ideas/view">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the idea's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<IdeasLoading lang={lang} />}>
      <IdeaPage lang={lang} />
    </Suspense>
  );
}
