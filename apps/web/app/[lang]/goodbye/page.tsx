import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "../../app-frame";
import landing from "../../landing/landing-page.module.css";
import { hasLocale } from "../../locales";
import onboarding from "../../onboarding/onboarding.module.css";
import { copy } from "../../profile/copy";

export async function generateMetadata({ params }: PageProps<"/[lang]/goodbye">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: copy[lang].deletion.goodbye.pageTitle };
}

// Where a deleted account lands, already signed out.
export default async function GoodbyePage({ params }: PageProps<"/[lang]/goodbye">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = copy[lang].deletion.goodbye;

  return (
    <AppFrame lang={lang} path="goodbye" bare>
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.title}</h1>
        <p className={onboarding.why}>{t.text}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}`}>
            {t.home}
          </Link>
        </div>
      </main>
    </AppFrame>
  );
}
