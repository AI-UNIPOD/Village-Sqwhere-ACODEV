import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { copy } from "../../../feed/copy";
import { Feed } from "../../../feed/feed";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/feed/mine">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle.mine };
}

export default async function MyPostsPage({ params }: PageProps<"/[lang]/feed/mine">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <Feed lang={lang} tab="mine" />;
}
