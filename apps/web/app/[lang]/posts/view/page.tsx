import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../feed/copy";
import { PostLoading, PostPage } from "../../../feed/post-page";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/posts/view">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].post.pageTitle };
}

export default async function PostViewPage({ params }: PageProps<"/[lang]/posts/view">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the post's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<PostLoading lang={lang} />}>
      <PostPage lang={lang} />
    </Suspense>
  );
}
