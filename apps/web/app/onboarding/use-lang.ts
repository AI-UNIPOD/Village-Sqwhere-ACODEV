import { useParams } from "next/navigation";

import { hasLocale, type Lang } from "../locales";

// The loading and error screens get no props, so they read the language from the URL.
export function useLang(): Lang {
  const { lang } = useParams<{ lang: string }>();
  return hasLocale(lang) ? lang : "en";
}
