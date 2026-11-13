import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../feed/copy";
import { ComposeLoading, PostComposer } from "../../../feed/post-composer";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/posts/compose">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].compose.pageTitle };
}

export default async function ComposePostPage({ params }: PageProps<"/[lang]/posts/compose">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the post's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<ComposeLoading lang={lang} />}>
      <PostComposer lang={lang} />
    </Suspense>
  );
}
