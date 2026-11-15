import type { Lang } from "../../locales";

type Step = { title: string; text: string; view: string };

type Match = {
  name: string;
  initials: string;
  country: string;
  verified: string;
  tech: readonly string[];
  why: string;
};

type Member = { name: string; initials: string; line: string; signed: string };

export type Copy = {
  title: string;
  lead: string;
  steps: readonly [Step, Step, Step, Step];
  idea: {
    draft: string;
    title: string;
    pitch: string;
    sharedBy: string;
    rolesNeeded: string;
    roles: readonly [string, string, string];
  };
  matcher: { tag: string; matches: readonly [Match, Match, Match] };
  team: {
    heading: string;
    count: string;
    members: readonly [Member, Member, Member, Member];
    agreement: string;
    signedByAll: string;
  };
  hub: {
    sample: string;
    active: string;
    count: string;
    phasesHeading: string;
    phases: readonly [string, string, string, string];
    /** The labels of the hub page's phase states (apps/web/app/hubs/copy.ts). */
    states: { done: string; inProgress: string; notStarted: string };
  };
};

// The phase of the sample hub that is in progress: those before it are done, those after not started.
export const SAMPLE_PHASE = 1;

const en: Copy = {
  title: "From an idea to a team, in four steps.",
  lead: "Here is what happens between sharing an idea and building it together. The people and ideas shown are made up.",
  steps: [
    {
      title: "Idea",
      text: "Write what you want to build and which roles it is missing. Keep the full brief private.",
      view: "A draft idea with three roles ticked",
    },
    {
      title: "Matcher",
      text: "The matcher looks at the roles your idea needs. It suggests developers verified in them, and says why.",
      view: "Three suggestions, each with a reason",
    },
    {
      title: "Team",
      text: "You invite developers, or accept those who ask to join. A team is up to five people, you included. Everyone reads and signs the same agreement.",
      view: "A team of four, all signed",
    },
    {
      title: "Hub",
      text: "Your team gets one hub: the agreement, the terms and the team, in one place. The owner confirms the team, Brainstorm opens, and the owner moves the hub through four phases, one at a time. Brainstorm has its notes already; the tools for the other phases are still to come.",
      view: "A sample hub, each phase Done, In progress or Not started",
    },
  ],
  idea: {
    draft: "Draft",
    title: "Daily naira payouts for market traders",
    pitch: "An app that pays market traders in naira each evening and retries when the bank network drops.",
    sharedBy: "Shared by Ọmọlará Adéwálé, Nigeria",
    rolesNeeded: "Roles needed",
    roles: ["Backend and Systems Engineer", "Mobile Engineer", "Cybersecurity and Smart Contract Auditor"],
  },
  matcher: {
    tag: "The matcher suggests. The owner decides.",
    matches: [
      {
        name: "Hamza Benali",
        initials: "HB",
        country: "Morocco",
        verified: "Verified",
        tech: ["Go", "PostgreSQL", "Docker"],
        why: "Verified backend engineer. Go, PostgreSQL and Docker in common with Ọmọlará.",
      },
      {
        name: "Thandiwe Mokoena",
        initials: "TM",
        country: "South Africa",
        verified: "Verified",
        tech: ["Flutter", "React Native"],
        why: "Verified mobile engineer. Flutter and React Native in common with Ọmọlará.",
      },
      {
        name: "Kidist Alemayehu",
        initials: "KA",
        country: "Ethiopia",
        verified: "Verified",
        tech: ["Python"],
        why: "Verified security auditor. Python in common with Ọmọlará.",
      },
    ],
  },
  team: {
    heading: "Team",
    count: "4 of 5 members",
    members: [
      { name: "Ọmọlará Adéwálé", initials: "ỌA", line: "Owner · Frontend Engineer", signed: "Signed" },
      { name: "Hamza Benali", initials: "HB", line: "Backend and Systems Engineer", signed: "Signed" },
      { name: "Thandiwe Mokoena", initials: "TM", line: "Mobile Engineer", signed: "Signed" },
      { name: "Kidist Alemayehu", initials: "KA", line: "Cybersecurity and Smart Contract Auditor", signed: "Signed" },
    ],
    agreement: "Version 1 of the hub agreement",
    signedByAll: "Signed by every member.",
  },
  hub: {
    sample: "Sample hub",
    active: "Active",
    count: "4 of 5 members",
    phasesHeading: "Phases",
    phases: ["Brainstorm", "Design and architecture", "Build", "Review and test"],
    states: { done: "Done", inProgress: "In progress", notStarted: "Not started" },
  },
};

const fr: Copy = {
  title: "D'une idée à une équipe, en quatre étapes.",
  lead:
    "Voici ce qui se passe entre le partage d'une idée et sa construction en équipe. Les personnes et les idées présentées sont fictives.",
  steps: [
    {
      title: "Idée",
      text: "Écrivez ce que vous voulez construire et les rôles qui lui manquent. Gardez le dossier complet privé.",
      view: "Un brouillon d'idée, trois rôles cochés",
    },
    {
      title: "Le matcher",
      text: "Le matcher regarde les rôles dont votre idée a besoin. Il propose des développeurs vérifiés dans ces rôles et dit pourquoi.",
      view: "Trois propositions, chacune avec sa raison",
    },
    {
      title: "Équipe",
      text: "Vous invitez des développeurs, ou vous acceptez ceux qui demandent à rejoindre l'espace. Une équipe compte jusqu'à cinq personnes, vous compris. Chacun lit et signe le même accord.",
      view: "Une équipe de quatre, accord signé",
    },
    {
      title: "Espace",
      text: "Votre équipe a un seul espace\u202f: l'accord, les conditions et l'équipe, au même endroit. Le porteur de l'idée confirme l'équipe, le brainstorm s'ouvre, puis il fait passer l'espace par quatre phases, une à la fois. Le brainstorm a déjà ses notes\u202f; les outils des autres phases restent à venir.",
      view: "Un espace d'exemple, chaque phase Terminée, En cours ou Pas commencée",
    },
  ],
  idea: {
    draft: "Brouillon",
    title: "Paiement en nairas chaque soir pour les marchands",
    pitch:
      "Une application qui paie les marchands en nairas chaque soir et relance le paiement si le réseau bancaire tombe.",
    sharedBy: "Partagée par Ọmọlará Adéwálé, Nigeria",
    rolesNeeded: "Rôles recherchés",
    roles: ["Ingénieur backend et systèmes", "Ingénieur mobile", "Auditeur cybersécurité et smart contracts"],
  },
  matcher: {
    tag: "Le matcher propose. Le porteur de l'idée décide.",
    matches: [
      {
        name: "Hamza Benali",
        initials: "HB",
        country: "Maroc",
        verified: "Vérifié",
        tech: ["Go", "PostgreSQL", "Docker"],
        why: "Ingénieur backend vérifié. Go, PostgreSQL et Docker en commun avec Ọmọlará.",
      },
      {
        name: "Thandiwe Mokoena",
        initials: "TM",
        country: "Afrique du Sud",
        verified: "Vérifiée",
        tech: ["Flutter", "React Native"],
        why: "Ingénieure mobile vérifiée. Flutter et React Native en commun avec Ọmọlará.",
      },
      {
        name: "Kidist Alemayehu",
        initials: "KA",
        country: "Éthiopie",
        verified: "Vérifiée",
        tech: ["Python"],
        why: "Auditrice sécurité vérifiée. Python en commun avec Ọmọlará.",
      },
    ],
  },
  team: {
    heading: "Équipe",
    count: "Membres\u202f: 4 sur 5",
    members: [
      { name: "Ọmọlará Adéwálé", initials: "ỌA", line: "Porteur de l'idée · Ingénieur frontend", signed: "Signé" },
      { name: "Hamza Benali", initials: "HB", line: "Ingénieur backend et systèmes", signed: "Signé" },
      { name: "Thandiwe Mokoena", initials: "TM", line: "Ingénieur mobile", signed: "Signée" },
      { name: "Kidist Alemayehu", initials: "KA", line: "Auditeur cybersécurité et smart contracts", signed: "Signée" },
    ],
    agreement: "Version 1 de l'accord de l'espace",
    signedByAll: "Signé par chaque membre.",
  },
  hub: {
    sample: "Espace d'exemple",
    active: "Actif",
    count: "Membres\u202f: 4 sur 5",
    phasesHeading: "Phases",
    phases: ["Brainstorm", "Conception et architecture", "Construction", "Revue et tests"],
    states: { done: "Terminée", inProgress: "En cours", notStarted: "Pas commencée" },
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
