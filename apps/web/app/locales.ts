export const LOCALES = ["en", "fr"] as const;
export type Lang = (typeof LOCALES)[number];
const DEFAULT_LANG: Lang = "en";

export function hasLocale(value: string): value is Lang {
  return (LOCALES as readonly string[]).includes(value);
}

// Picks the best supported language from an Accept-Language header, for example
// "fr-CA,fr;q=0.9,en;q=0.8". Anything unsupported or malformed falls back to English.
export function pickLocale(acceptLanguage: string | null): Lang {
  let best: Lang = DEFAULT_LANG;
  let bestQuality = 0;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const language = tag.split("-")[0].toLowerCase();
    const q = params.find((p) => p.trim().startsWith("q="));
    const quality = q ? Number(q.trim().slice(2)) : 1;
    if (hasLocale(language) && quality > bestQuality) {
      best = language;
      bestQuality = quality;
    }
  }
  return best;
}
