import type { Lang } from "../../locales";

type Copy = { title: string; text: string; ctaJoin: string; ctaDemo: string };

const en: Copy = {
  title: "Bring your idea to the square.",
  text: "Sign in with GitHub and share it, or look around the demo first.",
  ctaJoin: "Join the village",
  ctaDemo: "Try the demo",
};

// Needs a native French review before launch.
const fr: Copy = {
  title: "Apportez votre idée sur la place.",
  text: "Connectez-vous avec GitHub et partagez-la, ou explorez d'abord la démo.",
  ctaJoin: "Rejoindre le village",
  ctaDemo: "Essayer la démo",
};

export const copy: Record<Lang, Copy> = { en, fr };
