import { notFound } from "next/navigation";
import { Suspense } from "react";

import { hasLocale } from "../../locales";
import { Onboarding } from "../../onboarding/onboarding";
import { OnboardingSkeleton } from "../../onboarding/onboarding-skeleton";

export default async function OnboardingPage({ params }: PageProps<"/[lang]/onboarding">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // useSearchParams (the step in the URL) needs a Suspense boundary above it
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Onboarding lang={lang} />
    </Suspense>
  );
}
