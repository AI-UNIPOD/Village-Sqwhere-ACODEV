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
  title: "Inside the hub: four phases, one team.",
  lead: "A hub moves through four phases, one at a time. This one is a made-up sample.",
  sampleTag: "Sample hub",
  closing: "The phases open when the team is in place.",
  tablist: "Phases",
  done: "Done",
  phases: [
    {
      name: "Brainstorm",
      text: "The team agrees what to build first, and who does what.",
      view: "Sticky notes",
      items: ["Traders want one payout each evening", "Start with two banks, not ten", "Out of scope: card payments"],
    },
    {
      name: "Design and architecture",
      text: "The team sketches the pieces of the system and how they talk.",
      view: "Architecture sketch",
      items: ["Payout queue", "Bank adapter", "Retry worker"],
    },
    {
      name: "Build",
      text: "Each builder takes a piece and ships small changes often.",
      view: "Commit log",
    },
    {
      name: "Review and test",
      text: "Teammates read each other's work and test it before it goes out.",
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
  title: "Dans l'espace\u202f: quatre phases, une équipe.",
  lead: "Un espace traverse quatre phases, une à la fois. Celui-ci est un exemple inventé.",
  sampleTag: "Espace d'exemple",
  closing: "Les phases s'ouvrent quand l'équipe est en place.",
  tablist: "Phases",
  done: "Fait",
  phases: [
    {
      name: "Brainstorm",
      text: "L'équipe choisit ce qu'elle construit en premier, et qui fait quoi.",
      view: "Notes autocollantes",
      items: [
        "Les marchands veulent un seul paiement chaque soir",
        "Commencer avec deux banques, pas dix",
        "Hors périmètre\u202f: paiements par carte",
      ],
    },
    {
      name: "Conception et architecture",
      text: "L'équipe dessine les briques du système et la façon dont elles communiquent.",
      view: "Schéma d'architecture",
      items: ["File des paiements", "Connecteur bancaire", "Worker de relance"],
    },
    {
      name: "Construction",
      text: "Chacun prend une brique et livre souvent de petits changements.",
      view: "Historique des commits",
      // commit messages are code: the same in both languages, with no French space before the colon
    },
    {
      name: "Revue et tests",
      text: "Les membres de l'équipe se relisent et testent le travail avant sa mise en ligne.",
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
