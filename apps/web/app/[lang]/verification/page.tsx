import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasLocale } from "../../locales";
import { copy } from "../../verification/copy";
import { Verification } from "../../verification/verification";

export async function generateMetadata({ params }: PageProps<"/[lang]/verification">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function VerificationPage({ params }: PageProps<"/[lang]/verification">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <Verification lang={lang} />;
}
