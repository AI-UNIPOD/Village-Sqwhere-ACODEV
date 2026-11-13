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
  demo: { line: string; refused: string; leave: string };
};

// The names of the places a signed-in developer can go, short enough for a phone's bottom bar.
export const copy: Record<Lang, Copy> = {
  en: { navLabel: "Main", village: "Village", feed: "Feed", ideas: "Ideas", hubs: "Hubs", reviews: "Reviews", profile: "Profile", invited: "an invitation is waiting",
    demo: {
      line: "You are in the demo. Look at everything: nothing you change is saved.",
      refused: "That was not saved. The demo is for looking around: sign in with GitHub to do it for real.",
      leave: "Leave the demo",
    },
  },
  // Needs a native French review before launch.
  fr: { navLabel: "Principale", village: "Village", feed: "Fil", ideas: "Idées", hubs: "Espaces", reviews: "Revues", profile: "Profil", invited: "une invitation vous attend",
    demo: {
      line: "Vous êtes dans la démo. Regardez tout, rien de ce que vous modifiez n'est enregistré.",
      refused: "Cela n'a pas été enregistré. La démo sert à regarder\u202f: connectez-vous avec GitHub pour le faire vraiment.",
      leave: "Quitter la démo",
    },
  },
};
