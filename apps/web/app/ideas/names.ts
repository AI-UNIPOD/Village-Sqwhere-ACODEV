import type { Lang } from "../locales";
import { ROLES, TECHNOLOGIES, TOPICS } from "../onboarding/options";

// A role, technology or sector in the page's language, by slug, falling back to the API's name.
// In their own module, so a page that only shows a match score (the landing page's demo) does not
// pull in the ideas screens.
export const roleName = (lang: Lang, role: { slug: string; name: string }) =>
  ROLES.find((known) => known.slug === role.slug)?.name[lang] ?? role.name;

export const technologyName = (lang: Lang, tech: { slug: string; name: string }) =>
  TECHNOLOGIES.find((known) => known.slug === tech.slug)?.name[lang] ?? tech.name;

export const sectorName = (lang: Lang, sector: { slug: string; name: string }) =>
  TOPICS.find((known) => known.slug === sector.slug)?.name[lang] ?? sector.name;
