import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../hubs/copy";
import { HubsLoading } from "../../../hubs/my-hubs";
import { NewHub } from "../../../hubs/new-hub";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/hubs/new">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].newPageTitle };
}

export default async function NewHubPage({ params }: PageProps<"/[lang]/hubs/new">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the idea's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<HubsLoading lang={lang} />}>
      <NewHub lang={lang} />
    </Suspense>
  );
}
