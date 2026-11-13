import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasLocale } from "../../locales";
import { copy } from "../../profile/copy";
import { ProfilePage } from "../../profile/profile-page";

export async function generateMetadata({ params }: PageProps<"/[lang]/profile">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function ProfileRoute({ params }: PageProps<"/[lang]/profile">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <ProfilePage lang={lang} />;
}
