import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../../locales";
import { copy } from "../../../reviews/copy";
import { CaseSkeleton, ReviewCase } from "../../../reviews/review-case";

export async function generateMetadata({ params }: PageProps<"/[lang]/reviews/case">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].casePageTitle };
}

export default async function ReviewCasePage({ params }: PageProps<"/[lang]/reviews/case">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // useSearchParams (the attempt id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<CaseSkeleton lang={lang} id={null} />}>
      <ReviewCase lang={lang} />
    </Suspense>
  );
}
