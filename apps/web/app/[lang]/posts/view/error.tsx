"use client";

import { AppFrame } from "../../../app-frame";
import { copy } from "../../../feed/copy";
import landing from "../../../landing/landing-page.module.css";
import onboarding from "../../../onboarding/onboarding.module.css";
import { useLang } from "../../../onboarding/use-lang";

export default function PostError({ retry }: { retry: () => void }) {
  const lang = useLang();
  const t = copy[lang];
  return (
    <AppFrame lang={lang} path="posts/view">
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.post.errorTitle}</h1>
        <p className={onboarding.why}>{t.errorText}</p>
        <div className={onboarding.actions}>
          <button type="button" className={landing.btn} onClick={retry}>
            {t.retry}
          </button>
        </div>
      </main>
    </AppFrame>
  );
}
