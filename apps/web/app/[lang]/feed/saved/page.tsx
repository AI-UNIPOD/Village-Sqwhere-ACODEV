import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { copy } from "../../../feed/copy";
import { Feed } from "../../../feed/feed";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/feed/saved">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle.saved };
}

export default async function SavedPostsPage({ params }: PageProps<"/[lang]/feed/saved">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <Feed lang={lang} tab="saved" />;
}
