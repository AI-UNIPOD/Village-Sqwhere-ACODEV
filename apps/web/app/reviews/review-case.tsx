"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertTriangle, ArrowLeft, Bot } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { Decision } from "./decision";
import styles from "./reviews.module.css";
import { isGithub, loadCase, readCase, repositories, roleName, type Attempt } from "./reviews";

type Read = ReturnType<typeof readCase>;

const casePath = (id: string | null) => (id ? `reviews/case?id=${encodeURIComponent(id)}` : "reviews");

function Frame({ lang, id, children }: { lang: Lang; id: string | null; children: ReactNode }) {
  return (
    <AppFrame lang={lang} path={casePath(id)}>
      <main className={`${styles.wide} ${styles.main}`}>{children}</main>
    </AppFrame>
  );
}

// Shown while the case loads: blocks where the title and the evidence will be.
export function CaseSkeleton({ lang, id }: { lang: Lang; id: string | null }) {
  return (
    <AppFrame lang={lang} path={casePath(id)}>
      <main className={`${styles.wide} ${styles.main}`} aria-busy="true">
        <p className={landing.srOnly} role="status">
          {copy[lang].caseLoading}
        </p>
        <div className={onboarding.skeleton} aria-hidden="true">
          <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
          <div className={onboarding.block} />
          <div className={`${onboarding.block} ${onboarding.blockText}`} />
          <div className={onboarding.block} />
          <div className={onboarding.spinner} />
        </div>
      </main>
    </AppFrame>
  );
}

function BackLink({ lang }: { lang: Lang }) {
  return (
    <Link className={styles.back} href={`/${lang}/reviews`}>
      <ArrowLeft />
      {copy[lang].back}
    </Link>
  );
}

function Gone({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return (
    <div className={styles.gone}>
      <p role="status">{t.gone}</p>
      <Link className={landing.ghost} href={`/${lang}/reviews`}>
        {t.goneAction}
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

// A code the web app has no words for is shown as it came, in mono.
function flagText(lang: Lang, code: string): ReactNode {
  const words: Record<string, string> = copy[lang].flags;
  return Object.hasOwn(words, code) ? words[code] : <span className={styles.mono}>{code}</span>;
}

function Flag({ lang, code }: { lang: Lang; code: string }) {
  return (
    <span className={`${village.pill} ${styles.flag}`} data-state="warning">
      <AlertTriangle />
      {flagText(lang, code)}
    </span>
  );
}

function Repositories({ lang, addresses }: { lang: Lang; addresses: string[] }) {
  return (
    <Section title={copy[lang].repositories}>
      <ul className={styles.repos}>
        {addresses.map((address, index) => (
          <li key={index} className={styles.text}>
            {isGithub(address) ? (
              <a href={address} target="_blank" rel="noopener noreferrer">
                {address}<span className={landing.srOnly}>, {copy[lang].opensInNewTab}</span>
              </a>
            ) : (
              address
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Interview({ lang, read }: { lang: Lang; read: Read }) {
  const t = copy[lang];
  return (
    <Section title={t.interview}>
      {read.welcome && <p className={`${styles.text} ${styles.muted}`}>{read.welcome}</p>}
      <ol className={styles.turns}>
        {read.turns.map((turn) => (
          <li key={turn.number} className={styles.turn}>
            <p className={styles.mono}>{fill(t.question, { n: turn.number })}</p>
            {turn.question && <p className={`${styles.text} ${styles.question}`}>{turn.question}</p>}
            <p className={styles.label}>{t.theirAnswer}</p>
            <p className={`${styles.text} ${turn.answer ? "" : styles.muted}`}>{turn.answer ?? t.noAnswer}</p>
            {turn.flags.length > 0 && (
              <div className={styles.flags}>
                {turn.flags.map((code) => (
                  <Flag key={code} lang={lang} code={code} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// "error_handling" reads "Error handling"
const criterionName = (name: string) => {
  const words = name.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function RepositoriesCheck({ lang, analysis }: { lang: Lang; analysis: Read["analysis"] }) {
  const t = copy[lang];
  return (
    <Section title={t.repoCheck}>
      {analysis.summary && <p className={styles.text}>{analysis.summary}</p>}
      <ul className={styles.criteria}>
        {analysis.criteria.map((criterion, index) => (
          <li key={index} className={styles.criterion}>
            <h3 className={styles.itemTitle}>
              {criterionName(criterion.name)}
              {criterion.score !== null && <span className={styles.mono}>{fill(t.criterionScore, { n: criterion.score })}</span>}
            </h3>
            {criterion.rationale && <p className={styles.text}>{criterion.rationale}</p>}
            {criterion.files.length > 0 && (
              <ul className={styles.files}>
                {criterion.files.map((file, at) => (
                  <li key={at} className={`${styles.mono} ${styles.text}`}>
                    {file}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Bullets({ title, items, children }: { title: string; items: string[]; children?: (item: string) => ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.bullets}>
      <h3 className={styles.itemTitle}>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index} className={styles.text}>
            {children ? children(item) : item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The AI's own words come last, after the evidence, so the reviewer reads the work before any
// score can anchor them. Its colour marks it as the AI's, and it shows no pass or fail word.
function AiReport({ lang, report }: { lang: Lang; report: NonNullable<Read["report"]> }) {
  const t = copy[lang];
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 });
  const [before, after] = t.suggestedScore.split("{score}");
  return (
    <section className={styles.ai}>
      <p className={styles.aiLabel}>
        <Bot />
        {t.aiLabel}
      </p>
      <h2 className={styles.sectionTitle}>{t.aiTitle}</h2>
      {report.summary && <p className={styles.text}>{report.summary}</p>}
      <Bullets title={t.codeShows} items={report.code} />
      <Bullets title={t.interviewShows} items={report.interview} />
      <Bullets title={t.concerns} items={report.concerns} />
      <Bullets title={t.flagsTitle} items={report.flags}>
        {(code) => flagText(lang, code)}
      </Bullets>
      {report.score !== null && (
        <p className={styles.score}>
          {before}
          <span className={styles.scoreNumber}>{number.format(report.score)}</span>
          {after}
        </p>
      )}
      {report.confidence !== null && (
        <p className={styles.muted}>{fill(t.confidence, { value: percent.format(report.confidence) })}</p>
      )}
    </section>
  );
}

function Case({ lang, attempt }: { lang: Lang; attempt: Attempt }) {
  const t = copy[lang];
  const [closed, setClosed] = useState(false);
  const read = readCase(attempt);
  const addresses = repositories(attempt);
  const role = roleName(attempt, lang);
  return (
    <Frame lang={lang} id={attempt.id}>
      <BackLink lang={lang} />
      <h1 className={styles.title}>{fill(t.caseTitle, { role, n: attempt.attempt_number })}</h1>
      {addresses.length > 0 && <Repositories lang={lang} addresses={addresses} />}
      {(read.welcome || read.turns.length > 0) && <Interview lang={lang} read={read} />}
      {(read.analysis.summary || read.analysis.criteria.length > 0) && (
        <RepositoriesCheck lang={lang} analysis={read.analysis} />
      )}
      {read.report ? <AiReport lang={lang} report={read.report} /> : <p className={`${styles.section} ${styles.muted}`}>{t.aiMissing}</p>}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t.decisionTitle}</h2>
        {closed ? <Gone lang={lang} /> : <Decision lang={lang} id={attempt.id} role={role} onClosed={() => setClosed(true)} />}
      </section>
    </Frame>
  );
}

function Loaded({ lang, id }: { lang: Lang; id: string | null }) {
  const [result, setResult] = useState<Attempt | "gone" | Error | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadCase(id).then(
      (attempt) => live && setResult(attempt ?? "gone"),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setResult(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);
  if (result instanceof Error) throw result;
  if (!id || result === "gone") {
    return (
      <Frame lang={lang} id={id}>
        <h1 className={styles.title}>{copy[lang].goneTitle}</h1>
        <Gone lang={lang} />
      </Frame>
    );
  }
  return result ? <Case lang={lang} attempt={result} /> : <CaseSkeleton lang={lang} id={id} />;
}

// One attempt's evidence and the form to decide it, for a reviewer who holds a Green Tick.
export function ReviewCase({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <RequireSession lang={lang} fallback={<CaseSkeleton lang={lang} id={id} />}>
      <Loaded lang={lang} id={id} />
    </RequireSession>
  );
}
