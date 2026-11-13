import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { copy } from "../../../hubs/copy";
import { HubPage } from "../../../hubs/hub-page";
import { HubsLoading } from "../../../hubs/my-hubs";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/hubs/view">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].viewPageTitle };
}

export default async function HubViewPage({ params }: PageProps<"/[lang]/hubs/view">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  // the query string (the hub's id) needs a Suspense boundary above it
  return (
    <Suspense fallback={<HubsLoading lang={lang} />}>
      <HubPage lang={lang} />
    </Suspense>
  );
}
