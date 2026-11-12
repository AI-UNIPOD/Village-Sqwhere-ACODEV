import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../locales";
import { copy } from "../../onboarding/copy";
import { SignedInOnboarding } from "../../onboarding/onboarding";
import { OnboardingSkeleton } from "../../onboarding/onboarding-skeleton";

export async function generateMetadata({ params }: PageProps<"/[lang]/onboarding">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function OnboardingPage({ params }: PageProps<"/[lang]/onboarding">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // useSearchParams (the step in the URL) needs a Suspense boundary above it
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <SignedInOnboarding lang={lang} />
    </Suspense>
  );
}
