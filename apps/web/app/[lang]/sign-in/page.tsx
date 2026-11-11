import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { hasLocale } from "../../locales";
import { copy } from "../../sign-in/copy";
import { SignInPage } from "../../sign-in/sign-in-page";

export async function generateMetadata({ params }: PageProps<"/[lang]/sign-in">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].pageTitle };
}

export default async function SignIn({ params }: PageProps<"/[lang]/sign-in">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <SignInPage lang={lang} />;
}
