import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { copy } from "../../../ideas/copy";
import { ForYouIdeas } from "../../../ideas/for-you";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/ideas/for-you">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].forYou.pageTitle };
}

export default async function ForYouIdeasPage({ params }: PageProps<"/[lang]/ideas/for-you">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <ForYouIdeas lang={lang} />;
}
