import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../feed/copy";
import { Feed, FeedLoading } from "../../../feed/feed";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/feed/saved">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle.saved };
}

export default async function SavedPostsPage({ params }: PageProps<"/[lang]/feed/saved">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the message after a delete) needs a Suspense boundary above it
  return (
    <Suspense fallback={<FeedLoading lang={lang} tab="saved" />}>
      <Feed lang={lang} tab="saved" />
    </Suspense>
  );
}
