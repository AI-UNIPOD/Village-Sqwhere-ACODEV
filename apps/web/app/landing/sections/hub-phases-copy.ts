import type { Lang } from "../../locales";

type Phase = {
  name: string;
  text: string;
  /** The label of the sample view: its caption and its accessible name. */
  view: string;
  /** What the sample view holds, in the order it is drawn (the commits are code, in COMMITS). */
  items?: readonly [string, string, string];
};

export type Copy = {
  title: string;
  lead: string;
  sampleTag: string;
  closing: string;
  tablist: string;
  done: string;
  phases: readonly [Phase, Phase, Phase, Phase];
};

// Not words: who wrote each sticky note and each commit, and the commits themselves. A commit
// message is code: the same in both languages, with no French space before its colon.
export const NOTE_AUTHORS = ["ỌA", "HB", "KA"] as const;
export const COMMITS = [
  { initials: "HB", hash: "a3f9c21", message: "feat: retry failed payouts" },
  { initials: "ỌA", hash: "7be04d8", message: "fix: store amounts in kobo" },
  { initials: "KA", hash: "1c8e5fa", message: "test: queue survives a restart" },
] as const;

const en: Copy = {
  title: "Your hub has four phases.",
  lead:
    "The hub page lists four phases: brainstorm, design and architecture, build, then review and test. Their tools are not built yet, so what you see below is a made-up sample.",
  sampleTag: "Sample, not built yet",
  closing: "Today the hub only lists the phases. Each one reads Not started.",
  tablist: "Phases",
  done: "Done",
  phases: [
    {
      name: "Brainstorm",
      text: "A space to agree what to build first, and who does what.",
      view: "Sticky notes",
      items: ["Traders want one payout each evening", "Start with two banks, not ten", "Out of scope: card payments"],
    },
    {
      name: "Design and architecture",
      text: "A space to sketch the pieces of the system and how they talk.",
      view: "Architecture sketch",
      items: ["Payout queue", "Bank adapter", "Retry worker"],
    },
    {
      name: "Build",
      text: "A space to follow who builds which piece.",
      view: "Commit log",
    },
    {
      name: "Review and test",
      text: "A space for teammates to read each other's work and test it before it goes out.",
      view: "Review checklist",
      items: [
        "Retries tested with the bank offline",
        "Amounts checked in kobo",
        "Payout limits reviewed by Kidist",
      ],
    },
  ],
};

const fr: Copy = {
  title: "Votre espace compte quatre phases.",
  lead:
    "La page de l'espace liste quatre phases\u202f: brainstorm, conception et architecture, construction, puis revue et tests. Leurs outils ne sont pas encore construits\u202f: ce qui suit est un exemple inventé.",
  sampleTag: "Exemple, pas encore construit",
  closing: "Aujourd'hui, l'espace se contente de lister les phases. Chacune indique Pas commencée.",
  tablist: "Phases",
  done: "Fait",
  phases: [
    {
      name: "Brainstorm",
      text: "Un espace pour choisir ce qu'on construit en premier, et qui fait quoi.",
      view: "Notes autocollantes",
      items: [
        "Les marchands veulent un seul paiement chaque soir",
        "Commencer avec deux banques, pas dix",
        "Hors périmètre\u202f: paiements par carte",
      ],
    },
    {
      name: "Conception et architecture",
      text: "Un espace pour dessiner les briques du système et la façon dont elles communiquent.",
      view: "Schéma d'architecture",
      items: ["File des paiements", "Connecteur bancaire", "Worker de relance"],
    },
    {
      name: "Construction",
      text: "Un espace pour suivre qui construit quelle brique.",
      view: "Historique des commits",
      // commit messages are code: the same in both languages, with no French space before the colon
    },
    {
      name: "Revue et tests",
      text: "Un espace pour que l'équipe se relise et teste le travail avant sa mise en ligne.",
      view: "Liste de revue",
      items: [
        "Relances testées, banque hors ligne",
        "Montants vérifiés en kobo",
        "Plafonds de paiement relus par Kidist",
      ],
    },
  ],
};

export const copy: Record<Lang, Copy> = { en, fr };
