import type { Lang } from "./locales";

type Copy = {
  navLabel: string;
  village: string;
  feed: string;
  ideas: string;
  hubs: string;
  reviews: string;
  profile: string;
  /** Read after "Hubs" by a screen reader when an invitation waits. */
  invited: string;
  /** Shown to the shared demo account on every screen, and what it says when a change is refused. */
  demo: { line: string; refused: string; leave: string; tour: string };
  /** The avatar in the header: what the button is called, and its link to the profile. */
  account: { menu: string; profile: string };
};

// The names of the places a signed-in developer can go, short enough for a phone's bottom bar.
export const copy: Record<Lang, Copy> = {
  en: { navLabel: "Main", village: "Village", feed: "Feed", ideas: "Ideas", hubs: "Hubs", reviews: "Reviews", profile: "Profile", invited: "an invitation is waiting",
    demo: {
      line: "You are in the demo. The people, ideas and posts here are made up, and nothing can be changed.",
      refused: "That was not saved. The demo is for looking around: sign in with GitHub to do it for real.",
      leave: "Leave the demo",
      tour: "Take the tour",
    },
    account: { menu: "Account menu", profile: "Profile and settings" },
  },
  // Needs a native French review before launch.
  fr: { navLabel: "Principale", village: "Village", feed: "Fil", ideas: "Idées", hubs: "Espaces", reviews: "Revues", profile: "Profil", invited: "une invitation vous attend",
    demo: {
      line: "Vous êtes dans la démo. Les personnes, les idées et les publications sont fictives, et rien ne peut être modifié.",
      refused: "Cela n'a pas été enregistré. La démo sert à regarder\u202f: connectez-vous avec GitHub pour le faire vraiment.",
      leave: "Quitter la démo",
      tour: "Faire la visite",
    },
    account: { menu: "Menu du compte", profile: "Profil et réglages" },
  },
};
