"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppFrame } from "../app-frame";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowLeft, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { scrollToPartWhileSettling } from "../scroll";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { BriefSection } from "./brief";
import { copy } from "./copy";
import { loadHub, type Hub } from "./hubs-api";
import { WithdrawRequest, WithdrawnLine, type WithdrawOutcome } from "./withdraw-request";
import styles from "./hubs.module.css";
import { HubsSkeleton, MissingHub } from "./my-hubs";
import { Notes } from "./notes";
import { Phases } from "./phases";
import { InvitationCard, Person, Team } from "./team";

function HubCard({ lang, id, created, joined }: { lang: Lang; id: string | null; created: boolean; joined: boolean }) {
  const t = copy[lang];
  // undefined while loading, null when there is no such hub (or the address has no id)
  const [hub, setHub] = useState<Hub | null | undefined>(id ? undefined : null);
  const [failure, setFailure] = useState<Error | null>(null);
  // the developer took their request back on this page, or tried to after the owner answered
  const [withdrawal, setWithdrawal] = useState<WithdrawOutcome | null>(null);
  // counts the loads, so the phases drop their last status or error line when the page is shown again
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadHub(id).then(
      (found) => {
        if (!live) return;
        setHub(found);
        // the page was left and shown again: what happened on the last visit is no longer news
        setWithdrawal(null);
        setLoads((n) => n + 1);
      },
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setHub(null);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  // The card arrives after the page, so the browser's own jump to #team or #phases finds
  // nothing: scroll to the part the address names once the card is there (the guided tour's
  // last two stops).
  const card = useRef<HTMLElement>(null);
  const shown = !!hub;
  useEffect(() => {
    const part = window.location.hash.slice(1);
    if (shown && part && card.current) return scrollToPartWhileSettling(card.current, part);
  }, [shown]);

  if (failure) throw failure;
  if (hub === null) return <MissingHub lang={lang} />;
  if (!hub) return <HubsSkeleton lang={lang} />;

  const isOwner = hub.viewer.member_role === "owner";
  const status = hub.viewer.membership_status;
  const isMember = status === "active";
  const ownership = hub.terms.ownership_model && t.ownership[hub.terms.ownership_model];

  return (
    <main ref={card} className={`${onboarding.column} ${ideas.main}`}>
      <Link className={`${onboarding.back} ${ideas.backLink}`} href={`/${lang}/hubs`}>
        <ArrowLeft />
        {t.yourHubs}
      </Link>
      <h1 className={ideas.title}>{hub.name}</h1>
      <p className={styles.status}>
        <span className={village.pill} data-state={hub.status === "active" ? "done" : "later"}>
          {hub.status === "active" && <Check />}
          {hub.status === "active" ? t.active : t.archived}
        </span>
      </p>
      {created && isOwner && (
        <p className={ideas.done} role="status">
          <Check />
          {t.created}
        </p>
      )}
      {joined && isMember && (
        <p className={ideas.done} role="status">
          <Check />
          {t.joined}
        </p>
      )}
      {status === "invited" && <InvitationCard lang={lang} hub={hub} onChange={setHub} />}
      {withdrawal && <WithdrawnLine lang={lang} outcome={withdrawal} />}
      {status === "requested" && (
        <>
          <p className={ideas.lead}>{t.ask.asked}</p>
          <WithdrawRequest
            lang={lang}
            hubId={hub.id}
            onDone={(card, outcome) => {
              setHub(card);
              setWithdrawal(outcome);
            }}
          />
        </>
      )}
      {/* after a withdrawal the line above has said it: nobody declined */}
      {status === "declined" && withdrawal !== "withdrawn" && <p className={ideas.lead}>{t.declinedNote}</p>}
      {!isMember && status !== "invited" && status !== "requested" && status !== "declined" && <p className={ideas.lead}>{t.notMember}</p>}
      {hub.description && <p className={styles.text}>{hub.description}</p>}

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.ideaHeading}</h2>
      <p className={styles.strong}>{hub.idea.title}</p>
      <p className={styles.text}>{hub.idea.summary}</p>
      {isOwner && (
        <p className={styles.line}>
          <Link href={`/${lang}/ideas/compose?id=${hub.idea.id}`}>{t.editIdea}</Link>
        </p>
      )}

      {isMember && <BriefSection lang={lang} hubId={hub.id} ideaId={hub.idea.id} isOwner={isOwner} moment={created || joined} />}

      <section id="team" className={styles.part}>
        <h2 className={`${ideas.heading} ${styles.heading}`}>{t.teamHeading}</h2>
        {isMember ? (
          <Team lang={lang} hub={hub} />
        ) : (
          <>
            <p className={ideas.meta}>{fill(t.members, { n: hub.member_count })}</p>
            <ul className={styles.members}>
              <li className={styles.member}>
                <Person lang={lang} user={hub.owner} role={t.owner} />
              </li>
            </ul>
          </>
        )}
      </section>

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.termsHeading}</h2>
      {ownership && <p className={styles.strong}>{ownership.title}</p>}
      {/* the other two choices are explained by the owner's own notes */}
      {hub.terms.ownership_model === "equal_split" && <p className={styles.text}>{ownership?.text}</p>}
      {hub.terms.notes && <p className={styles.text}>{hub.terms.notes}</p>}
      <p className={`${ideas.meta} ${styles.line}`}>{t.termsFrozen}</p>
      <p className={`${ideas.meta} ${styles.line}`}>{fill(t.agreementVersion, { n: hub.agreement.version })}</p>

      <Phases key={loads} lang={lang} hub={hub} onChange={setHub} />
      {isMember && hub.phase && <Notes key={`notes-${loads}`} lang={lang} hub={hub} onChange={setHub} />}
    </main>
  );
}

// One hub's card: what it builds, who is in it, the terms everyone signed, the four phases and, once the team is confirmed, its brainstorm notes.
export function HubPage({ lang }: { lang: Lang }) {
  const search = useSearchParams();
  const id = search.get("id");
  return (
    <AppFrame lang={lang} path={`hubs/view${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<HubsSkeleton lang={lang} />}>
        <HubCard key={id ?? "none"} lang={lang} id={id} created={search.get("created") === "1"} joined={search.get("joined") === "1"} />
      </RequireSession>
    </AppFrame>
  );
}
