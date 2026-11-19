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
  closing: string;
  /** On a phone the closing paragraph waits behind this button. */
  more: string;
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
    "The owner confirms the team, Brainstorm opens, and the hub moves through four phases one at a time: brainstorm, design and architecture, build, then review and test. Each phase has its own tool on the hub page: brainstorm notes, the design sketch, the build tab and the review checklist.",
  closing:
    "Today the hub page shows each phase as Done, In progress or Not started, and the owner moves the hub from one phase to the next. During brainstorm, the team's active members add short notes of up to 280 characters on the hub page. They stay to read afterwards. During design, they list the pieces of the system and the labelled links between them, and the hub page draws them as boxes and arrows. During build, each member takes a piece of the sketch, the owner sets the team's public GitHub repository, and its latest commits show on the hub page with a Refresh commits button. During review, members add checks to each piece, a teammate ticks them (never the person who built the piece), and the owner finishes the hub once every check is ticked.",
  more: "How each phase works",
  tablist: "Phases",
  done: "Done",
  phases: [
    {
      name: "Brainstorm",
      text: "A space to agree what to build first, and who does what.",
      view: "Brainstorm notes",
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
    "Le porteur de l'idée confirme l'équipe, le brainstorm s'ouvre, puis l'espace traverse quatre phases, une à la fois\u202f: brainstorm, conception et architecture, construction, puis revue et tests. Chaque phase a son propre outil sur la page de l'espace\u202f: les notes de brainstorm, le schéma de conception, l'onglet construction et la liste de revue.",
  closing:
    "Aujourd'hui, la page de l'espace indique chaque phase comme Terminée, En cours ou Pas commencée, et le porteur de l'idée fait passer l'espace d'une phase à la suivante. Pendant le brainstorm, les membres actifs de l'équipe ajoutent de courtes notes de 280 caractères au maximum sur la page de l'espace. Elles restent lisibles ensuite. Pendant la conception, ils listent les briques du système et les liens nommés entre elles, et la page de l'espace les dessine en boîtes et en flèches. Pendant la construction, chaque membre prend une brique du schéma, le porteur de l'idée indique le dépôt GitHub public de l'équipe, et ses derniers commits s'affichent sur la page de l'espace avec un bouton Actualiser les commits. Pendant la revue, les membres ajoutent des vérifications à chaque brique, un coéquipier les coche (jamais la personne qui a construit la brique), et le porteur de l'idée termine l'espace une fois toutes les vérifications cochées.",
  more: "Comment fonctionne chaque phase",
  tablist: "Phases",
  done: "Fait",
  phases: [
    {
      name: "Brainstorm",
      text: "Un espace pour choisir ce qu'on construit en premier, et qui fait quoi.",
      view: "Notes de brainstorm",
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
