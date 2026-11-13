import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../locales";
import { copy } from "../../reviews/copy";
import { QueueSkeleton, ReviewQueue } from "../../reviews/queue";

export async function generateMetadata({ params }: PageProps<"/[lang]/reviews">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function ReviewsPage({ params }: PageProps<"/[lang]/reviews">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // useSearchParams (the ?done message) needs a Suspense boundary above it
  return (
    <Suspense fallback={<QueueSkeleton lang={lang} />}>
      <ReviewQueue lang={lang} />
    </Suspense>
  );
}
