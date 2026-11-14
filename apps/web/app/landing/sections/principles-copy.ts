import type { Lang } from "../../locales";

export type PrincipleKey = "together" | "owner" | "private" | "verified";

type Copy = {
  title: string;
  items: Array<{ key: PrincipleKey; title: string; text: string }>;
};

const en: Copy = {
  title: "How the village works",
  items: [
    {
      key: "together",
      title: "Built together, not hired",
      text: "Nobody is hired. Ownership terms are set before anyone joins, signed by everyone, and cannot change.",
    },
    {
      key: "owner",
      title: "The owner decides, the matcher suggests",
      text: "The matcher orders developers and says why. You choose who to invite.",
    },
    {
      key: "private",
      title: "Your brief stays private",
      text: "Signed-in developers see your title and summary. The full brief opens to your team after they sign. The matcher never reads it.",
    },
    {
      key: "verified",
      title: "Only verified roles are matched",
      text: "Claiming a role is not enough. The matcher counts roles that passed verification.",
    },
  ],
};

// Needs a native French review before launch.
const fr: Copy = {
  title: "Comment fonctionne le village",
  items: [
    {
      key: "together",
      title: "Construire ensemble, pas recruter",
      text: "Personne n'est recruté. Les conditions de propriété sont fixées avant l'arrivée de chacun, signées par tous et non modifiables.",
    },
    {
      key: "owner",
      title: "Le porteur décide, le matcher propose",
      text: "Le matcher classe les développeurs et dit pourquoi. Vous choisissez qui inviter.",
    },
    {
      key: "private",
      title: "Votre dossier reste privé",
      text: "Les développeurs connectés voient votre titre et votre résumé. Le dossier complet s'ouvre à votre équipe après sa signature. Le matcher ne le lit jamais.",
    },
    {
      key: "verified",
      title: "Seuls les rôles vérifiés comptent",
      text: "Déclarer un rôle ne suffit pas. Le matcher ne compte que les rôles qui ont passé la vérification.",
    },
  ],
};

export const copy: Record<Lang, Copy> = { en, fr };
