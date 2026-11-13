import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { copy } from "../../hubs/copy";
import { MyHubs } from "../../hubs/my-hubs";
import { hasLocale } from "../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/hubs">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].minePageTitle };
}

export default async function MyHubsPage({ params }: PageProps<"/[lang]/hubs">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <MyHubs lang={lang} />;
}
