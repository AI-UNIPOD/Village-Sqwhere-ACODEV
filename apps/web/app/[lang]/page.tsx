import { notFound } from "next/navigation";

import { LandingPage } from "../landing/landing-page";
import { hasLocale } from "../locales";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return <LandingPage lang={lang} />;
}
