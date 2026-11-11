import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { copy } from "../../../auth-callback/copy";
import { CallbackPage } from "../../../auth-callback/callback-page";
import { hasLocale } from "../../../locales";

export async function generateMetadata({ params }: PageProps<"/[lang]/auth/callback">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function AuthCallback({ params }: PageProps<"/[lang]/auth/callback">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <CallbackPage lang={lang} />;
}
