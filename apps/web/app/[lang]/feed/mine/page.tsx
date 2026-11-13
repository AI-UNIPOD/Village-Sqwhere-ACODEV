import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../feed/copy";
import { Feed, FeedLoading } from "../../../feed/feed";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/feed/mine">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle.mine };
}

export default async function MyPostsPage({ params }: PageProps<"/[lang]/feed/mine">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the message after a delete) needs a Suspense boundary above it
  return (
    <Suspense fallback={<FeedLoading lang={lang} tab="mine" />}>
      <Feed lang={lang} tab="mine" />
    </Suspense>
  );
}
