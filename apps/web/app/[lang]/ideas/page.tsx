import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BrowseIdeas } from "../../ideas/browse";
import { copy } from "../../ideas/copy";
import { hasLocale } from "../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].browse.pageTitle };
}

export default async function BrowseIdeasPage({ params }: PageProps<"/[lang]/ideas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <BrowseIdeas lang={lang} />;
}
