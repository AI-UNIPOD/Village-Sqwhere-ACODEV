"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppFrame } from "../app-frame";
import { copy as hubsCopy } from "../hubs/copy";
import { inviteMember, loadHubsByIdea, type Hub } from "../hubs/hubs-api";
import hubsStyles from "../hubs/hubs.module.css";
import { Person, TEAM_MAX, inviteMessage } from "../hubs/team";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, ArrowLeft, Check, Clock, Lightbulb } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { countriesFor } from "../onboarding/options";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { roleName, technologyName } from "./browse";
import { copy } from "./copy";
import { IdeaError, loadDevelopersForIdea, loadMyIdea, type Developer, type OwnedIdea } from "./ideas-api";
import styles from "./ideas.module.css";
import { IdeasSkeleton } from "./my-ideas";

// One developer who matches: who they are, why they matched, and, when the idea has a hub with
// room, the button that invites them. `hub` is undefined when nobody can be invited.
function DeveloperCard({ lang, person, hub }: { lang: Lang; person: Developer; hub: Hub | undefined }) {
  const t = copy[lang].matches;
  const team = hubsCopy[lang].team;
  const card = useRef<HTMLLIElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const shared = person.shared_technologies;
  // a missing or unknown code shows nothing: a wrong place is worse than none
  const country = countriesFor(lang).find((known) => known.alpha2 === person.country_code)?.name;
  // the shared ones lead, each group in the API's order
  const marked = person.technologies.map((tech) => ({ tech, inCommon: shared.some((one) => one.slug === tech.slug) }));
  const tags = [...marked.filter((tag) => tag.inCommon), ...marked.filter((tag) => !tag.inCommon)];

  // the button leaves with the invitation, so keyboard focus moves to the person's link
  useEffect(() => {
    if (state === "sent") card.current?.querySelector("a")?.focus();
  }, [state]);

  async function invite() {
    if (!hub || state === "busy") return;
    setState("busy");
    setProblem(null);
    try {
      await inviteMember(hub.id, person.username);
      setState("sent");
    } catch (error) {
      setState("idle");
      if (!(error instanceof SignedOutError)) setProblem(inviteMessage(error, team) ?? team.actionFailed);
    }
  }

  return (
    <li ref={card} className={styles.card}>
      <div className={styles.personRow}>
        <Person lang={lang} user={person} />
        {hub && state === "sent" && (
          <span className={`${village.pill} ${hubsStyles.sent}`} data-state="open">
            <Clock />
            {team.invited}
          </span>
        )}
        {hub && state !== "sent" && (
          <button
            type="button"
            className={landing.ghost}
            aria-label={fill(team.named, { action: t.invite, name: person.display_name })}
            aria-busy={state === "busy" || undefined}
            onClick={invite}
          >
            {t.invite}
          </button>
        )}
      </div>
      {country && <p className={styles.meta}>{country}</p>}
      <p className={landing.srOnly} role="status">
        {state === "sent" ? fill(team.form.sent, { name: person.display_name }) : ""}
      </p>
      {problem && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {problem}
        </p>
      )}
      <div className={styles.why}>
        <p>{fill(t.verifiedIn, { roles: person.matched_roles.map((role) => roleName(lang, role)).join(", ") })}</p>
        {shared.length > 0 && <p>{fill(t.inCommon, { technologies: shared.map((tech) => technologyName(lang, tech)).join(", ") })}</p>}
      </div>
      {tags.length > 0 && (
        <ul className={village.tags} aria-label={t.technologies}>
          {tags.map(({ tech, inCommon }) => (
            <li key={tech.slug} className={inCommon ? `${village.tag} ${styles.sharedTag}` : village.tag}>
              {inCommon && <Check />}
              {technologyName(lang, tech)}
              {inCommon && <span className={landing.srOnly}> ({t.inCommonTag})</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// What stands in for the list when there is nothing to show: what is the matter, and a way on.
function Gap({ title, text, href, action }: { title: string; text: string; href?: string; action?: string }) {
  return (
    <div className={onboarding.empty}>
      <Lightbulb className={onboarding.emptyIcon} />
      <h2 className={onboarding.emptyTitle}>{title}</h2>
      <p>{text}</p>
      {href && (
        <Link className={landing.btn} href={href}>
          {action}
        </Link>
      )}
    </div>
  );
}

// `people` is null when the idea is not open, which is when the API refuses to match it
type Found = { idea: OwnedIdea; hub: Hub | undefined; people: Developer[] | null; next: number | null };

function Matches({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const hubs = hubsCopy[lang];
  // undefined while loading, null when there is no such idea of theirs (or the address has no id)
  const [found, setFound] = useState<Found | null | undefined>(id ? undefined : null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (!id) return;
    let live = true;
    // together, because the idea says what the list is for and the hub says whether it can invite
    Promise.allSettled([loadMyIdea(id), loadHubsByIdea(), loadDevelopersForIdea(id)]).then(([idea, myHubs, people]) => {
      if (!live) return;
      const fail = (error: unknown) => {
        if (!(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
      };
      if (idea.status === "rejected") {
        const gone = idea.reason instanceof IdeaError && (idea.reason.status === 404 || idea.reason.status === 422);
        return gone ? setFound(null) : fail(idea.reason);
      }
      if (myHubs.status === "rejected") return fail(myHubs.reason);
      // a draft or a closed idea is refused its matches: that is a state of the page, not a failure
      const notOpen = people.status === "rejected" && people.reason instanceof IdeaError && people.reason.code === "IDEA_NOT_OPEN";
      if (people.status === "rejected" && !notOpen) return fail(people.reason);
      setFound({
        idea: idea.value,
        hub: myHubs.value[id],
        people: people.status === "fulfilled" ? people.value.data : null,
        next: people.status === "fulfilled" ? people.value.next_offset : null,
      });
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (failure) throw failure;
  if (found === null) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.errors.notFoundTitle}</h1>
        <p className={onboarding.why}>{t.errors.notFoundText}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/ideas/mine`}>
            {t.back}
          </Link>
        </div>
      </main>
    );
  }
  if (!found) return <IdeasSkeleton lang={lang} />;

  const { idea, hub, people, next } = found;
  const composer = `/${lang}/ideas/compose?id=${encodeURIComponent(idea.id)}`;
  // an idea with no hub yet cannot invite anyone, and a full team cannot take more
  const full = !!hub && hub.member_count >= TEAM_MAX;
  const inviting = hub && !full ? hub : undefined;

  function showMore() {
    if (more === "loading" || next === null) return;
    setMore("loading");
    loadDevelopersForIdea(idea.id, next).then(
      (page) => {
        setFound((shown) => shown && { ...shown, people: [...(shown.people ?? []), ...page.data], next: page.next_offset });
        setMore("idle");
      },
      (error: unknown) => !(error instanceof SignedOutError) && setMore("failed"),
    );
  }

  let body;
  if (idea.status === "closed") {
    body = <Gap title={t.matches.closedTitle} text={t.matches.closedText} href={`/${lang}/ideas/mine`} action={t.back} />;
  } else if (!people) {
    body = <Gap title={t.matches.notOpenTitle} text={t.matches.notOpenText} href={composer} action={t.matches.notOpenAction} />;
  } else if (idea.roles_needed.length === 0) {
    body = <Gap title={t.matches.noRolesTitle} text={t.matches.noRolesText} href={composer} action={t.matches.noRolesAction} />;
  } else {
    body = (
      <>
        {!hub && (
          <div className={styles.notice}>
            <h2 className={styles.noticeTitle}>{t.matches.noHubTitle}</h2>
            <p className={styles.noticeText}>{t.matches.noHubText}</p>
            <Link className={landing.btn} href={`/${lang}/hubs/new?idea=${encodeURIComponent(idea.id)}`}>
              {hubs.createHub}
            </Link>
          </div>
        )}
        {full && <p className={hubsStyles.full}>{hubs.team.full}</p>}
        {people.length === 0 ? (
          <Gap
            title={t.matches.noneTitle}
            text={t.matches.noneText}
            href={inviting ? `/${lang}/hubs/view?id=${encodeURIComponent(inviting.id)}` : undefined}
            action={t.matches.noneAction}
          />
        ) : (
          <>
            <ul className={styles.list}>
              {people.map((person) => (
                <DeveloperCard key={person.id} lang={lang} person={person} hub={inviting} />
              ))}
            </ul>
            {more === "failed" && (
              <p className={`${onboarding.error} ${styles.moreFailed}`} role="alert">
                {t.matches.moreFailed}
              </p>
            )}
            {next !== null && (
              <button
                type="button"
                className={`${landing.ghost} ${styles.more}`}
                aria-busy={more === "loading" || undefined}
                onClick={showMore}
              >
                {t.loadMore}
              </button>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <Link className={`${onboarding.back} ${styles.backLink}`} href={`/${lang}/ideas/mine`}>
        <ArrowLeft />
        {t.back}
      </Link>
      <h1 className={styles.title}>{fill(t.matches.title, { title: idea.title })}</h1>
      <p className={styles.lead}>{t.matches.lead}</p>
      {body}
    </main>
  );
}

// The developers who are verified in a role one of the signed-in developer's ideas needs, and
// the invitation to the idea's hub.
export function IdeaMatches({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`ideas/matches${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        {/* another idea is another page: nothing loaded for one may show for the next */}
        <Matches key={id ?? "none"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}
