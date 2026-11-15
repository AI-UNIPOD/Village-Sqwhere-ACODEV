"use client";

import { useEffect, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { AgreementText } from "./agreement-text";
import { copy } from "./copy";
import { loadHubAgreement, loadMembership, type Agreement, type Hub, type Membership } from "./hubs-api";
import styles from "./hubs.module.css";

const day = (lang: Lang, at: string) => new Date(at).toLocaleDateString(lang, { dateStyle: "long" });

// What the signed-in person signed to be in this hub: the version, the name they typed and the
// day, and on request the text itself, checked against the hash of what they signed.
export function MySignature({ lang, hub }: { lang: Lang; hub: Hub }) {
  const t = copy[lang].signature;
  // undefined while it loads, null when it could not be loaded
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [agreement, setAgreement] = useState<Agreement | null | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    loadMembership(hub.id).then(
      (found) => live && setMembership(found),
      (error: unknown) => live && !(error instanceof SignedOutError) && setMembership(null),
    );
    return () => {
      live = false;
    };
  }, [hub.id, tries]);

  function read() {
    setReading(true);
    if (agreement) return;
    setAgreement(undefined);
    loadHubAgreement(hub.id).then(setAgreement, (error: unknown) => !(error instanceof SignedOutError) && setAgreement(null));
  }

  if (membership === undefined) return <p className={styles.line}>{t.loading}</p>;
  if (membership === null)
    return (
      <>
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.failed}
        </p>
        <p className={styles.line}>
          <button
            type="button"
            className={landing.ghost}
            onClick={() => {
              setMembership(undefined);
              setTries((n) => n + 1);
            }}
          >
            {t.retry}
          </button>
        </p>
      </>
    );

  const { signature } = membership;
  if (!signature) return <p className={styles.line}>{t.none}</p>;
  // the text shown now is the text signed only if the hashes agree
  const same = agreement && agreement.body_sha256 === signature.template_sha256;
  return (
    <div>
      <p className={styles.text}>
        {fill(t.signed, { version: signature.version, name: signature.signed_legal_name, date: day(lang, signature.signed_at) })}
      </p>
      {membership.joined_at && <p className={styles.text}>{fill(t.since, { date: day(lang, membership.joined_at) })}</p>}
      {!reading || agreement === null ? (
        <>
          {agreement === null && (
            <p className={`${onboarding.error} ${styles.problem}`} role="alert">
              <AlertCircle />
              {t.textFailed}
            </p>
          )}
          <p className={styles.line}>
            <button type="button" className={landing.ghost} onClick={read}>
              {t.read}
            </button>
          </p>
        </>
      ) : agreement === undefined ? (
        <p className={styles.line}>{t.loadingText}</p>
      ) : (
        <>
          <p className={styles.line} role="status">
            {same ? (
              <span className={styles.verified}>
                <Check />
                {t.same}
              </span>
            ) : (
              t.different
            )}
          </p>
          <div className={styles.agreement} role="region" aria-label={agreement.title} tabIndex={0}>
            <AgreementText body={agreement.body} />
          </div>
        </>
      )}
    </div>
  );
}
