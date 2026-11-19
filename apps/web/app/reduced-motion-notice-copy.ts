import type { Lang } from "./locales";

type Copy = { title: string; text: string; turnOn: string; keep: string };

// Said once to a visitor whose device asks for reduced motion (reduced-motion-notice.tsx). It
// says what the site does, what the button does and where else to change it.
export const copy: Record<Lang, Copy> = {
  en: {
    title: "Animations are toned down",
    text: "Your device asks for less motion, so this site moves less. You can turn animations on for this browser, or change it in your device's accessibility settings.",
    turnOn: "Turn animations on",
    keep: "Keep them toned down",
  },
  // Needs a native French review before launch.
  fr: {
    title: "Les animations sont atténuées",
    text: "Votre appareil demande moins de mouvement, alors ce site bouge moins. Vous pouvez activer les animations pour ce navigateur, ou le changer dans les réglages d'accessibilité de votre appareil.",
    turnOn: "Activer les animations",
    keep: "Les garder atténuées",
  },
};
