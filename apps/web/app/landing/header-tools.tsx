import { LanguageSwitch } from "../language-switch";
import type { Lang } from "../locales";
import { copy } from "./copy";
import styles from "./landing-page.module.css";
import { ThemeButton } from "./theme-toggle";

// The language and theme switches at the end of the public pages' header. With no path there is
// no language switch: a page that cannot be opened again in the other language.
export function HeaderTools({ lang, path }: { lang: Lang; path: string | null }) {
  const t = copy[lang];
  return (
    <div className={styles.tools}>
      {path !== null && <LanguageSwitch lang={lang} path={path} />}
      <ThemeButton toDark={t.toDark} toLight={t.toLight} className={styles.themeButton} />
    </div>
  );
}
