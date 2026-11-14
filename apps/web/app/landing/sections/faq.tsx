import type { Lang } from "../../locales";
import { HeadingText } from "../heading-text";
import styles from "../landing-page.module.css";
import { copy } from "./faq-copy";
import own from "./faq.module.css";

// Native details elements that share a name: opening one closes the others, with no script.
export function Faq({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return (
    <section className={`${styles.block} ${own.faq}`} id="faq" aria-labelledby="faq-title">
      <div className={`${styles.wrap} ${own.layout}`}>
        <h2 id="faq-title">
          <HeadingText text={t.title} />
        </h2>
        <div className={own.list}>
          {t.items.map((item) => (
            <details className={own.item} name="faq" key={item.q}>
              <summary className={own.summary}>
                <span>{item.q}</span>
                <svg className={own.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 9.5l6 6 6-6" />
                </svg>
              </summary>
              <p className={own.answer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
