import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../hubs/copy";
import { JoinHub } from "../../../hubs/join-hub";
import { HubsLoading } from "../../../hubs/my-hubs";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/hubs/join">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].join.pageTitle };
}

export default async function JoinHubPage({ params }: PageProps<"/[lang]/hubs/join">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the hub's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<HubsLoading lang={lang} />}>
      <JoinHub lang={lang} />
    </Suspense>
  );
}
