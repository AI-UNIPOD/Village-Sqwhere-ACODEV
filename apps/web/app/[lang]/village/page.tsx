import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasLocale } from "../../locales";
import { copy } from "../../village/copy";
import { Village } from "../../village/village";

export async function generateMetadata({ params }: PageProps<"/[lang]/village">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function VillagePage({ params }: PageProps<"/[lang]/village">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <Village lang={lang} />;
}
