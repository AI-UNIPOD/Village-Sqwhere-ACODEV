import type { Lang } from "./locales";

type Copy = {
  navLabel: string;
  village: string;
  ideas: string;
  hubs: string;
  reviews: string;
  profile: string;
};

// The names of the places a signed-in developer can go, short enough for a phone's bottom bar.
export const copy: Record<Lang, Copy> = {
  en: { navLabel: "Main", village: "Village", ideas: "Ideas", hubs: "Hubs", reviews: "Reviews", profile: "Profile" },
  // Needs a native French review before launch.
  fr: { navLabel: "Principale", village: "Village", ideas: "Idées", hubs: "Espaces", reviews: "Revues", profile: "Profil" },
};
