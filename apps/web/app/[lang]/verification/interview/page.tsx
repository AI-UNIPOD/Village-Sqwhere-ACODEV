import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../../locales";
import { copy } from "../../../verification-interview/copy";
import { Interview, InterviewSkeleton } from "../../../verification-interview/interview";

export async function generateMetadata({ params }: PageProps<"/[lang]/verification/interview">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function InterviewPage({ params }: PageProps<"/[lang]/verification/interview">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // useSearchParams (the attempt id in the URL) needs a Suspense boundary above it
  return (
    <Suspense fallback={<InterviewSkeleton lang={lang} />}>
      <Interview lang={lang} />
    </Suspense>
  );
}
