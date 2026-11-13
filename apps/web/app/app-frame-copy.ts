import type { Lang } from "./locales";

type Copy = {
  navLabel: string;
  village: string;
  ideas: string;
  hubs: string;
  reviews: string;
  profile: string;
  /** Read after "Hubs" by a screen reader when an invitation waits. */
  invited: string;
};

// The names of the places a signed-in developer can go, short enough for a phone's bottom bar.
export const copy: Record<Lang, Copy> = {
  en: { navLabel: "Main", village: "Village", ideas: "Ideas", hubs: "Hubs", reviews: "Reviews", profile: "Profile", invited: "an invitation is waiting" },
  // Needs a native French review before launch.
  fr: { navLabel: "Principale", village: "Village", ideas: "Idées", hubs: "Espaces", reviews: "Revues", profile: "Profil", invited: "une invitation vous attend" },
};
