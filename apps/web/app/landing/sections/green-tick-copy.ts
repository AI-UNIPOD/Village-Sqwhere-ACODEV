import type { Lang } from "../../locales";

type Step = { title: string; text: string };

type Copy = {
  title: string;
  lead: string;
  stepsLabel: string;
  steps: [Step, Step, Step];
  attempts: string;
  noTickNeeded: string;
  demo: {
    caption: string;
    name: string;
    initials: string;
    role: string;
    seal: string;
    pill: { checking: string; yourTurn: string; waiting: string; done: string };
    replay: string;
  };
  win: string;
};

const en: Copy = {
  title: "The Green Tick says your role is real.",
  lead: "The matcher only suggests developers verified in the role an idea needs. Verification takes three steps.",
  stepsLabel: "The three verification steps",
  steps: [
    {
      title: "Repositories check",
      text: "An AI checker looks at the public GitHub repositories you choose: file names, languages, tests and recent commit messages. Only public repositories can be checked.",
    },
    {
      title: "Interview",
      text: "Five questions from an AI interviewer. You type your answers and stay on the page until the last one.",
    },
    {
      title: "Peer review",
      text: "A developer already verified in your role reads the evidence and decides. They do not see your profile, but repository addresses can show your GitHub name.",
    },
  ],
  attempts: "You get three attempts for each role.",
  noTickNeeded: "You can share an idea before you have a Green Tick.",
  demo: {
    caption: "Thandiwe Mokoena earns a Green Tick as a Mobile Engineer.",
    name: "Thandiwe Mokoena",
    initials: "TM",
    role: "Mobile Engineer",
    seal: "Green Tick",
    pill: { checking: "Checking", yourTurn: "Your turn", waiting: "Waiting", done: "Done" },
    replay: "Watch it again",
  },
  win: "Green Tick earned. Idea owners can now be shown your profile, and you can review others in your role.",
};

// Needs a native French review before launch.
const fr: Copy = {
  title: "Le Green Tick montre que votre rôle est réel.",
  lead: "Le matcher ne propose que des développeurs vérifiés dans le rôle recherché. La vérification se fait en trois étapes.",
  stepsLabel: "Les trois étapes de la vérification",
  steps: [
    {
      title: "Analyse des dépôts",
      text: "Un vérificateur IA examine les dépôts GitHub publics que vous choisissez\u202f: noms de fichiers, langages, tests et derniers messages de commit. Seuls les dépôts publics peuvent être analysés.",
    },
    {
      title: "Entretien",
      text: "Cinq questions posées par un intervieweur IA. Vous répondez par écrit, sans quitter la page avant la dernière.",
    },
    {
      title: "Relecture par un pair",
      text: "Un développeur déjà vérifié dans votre rôle lit les éléments et décide. Cette personne ne voit pas votre profil, mais les adresses des dépôts peuvent montrer votre nom GitHub.",
    },
  ],
  attempts: "Vous avez trois tentatives par rôle.",
  noTickNeeded: "Vous pouvez partager une idée avant d'avoir un Green Tick.",
  demo: {
    caption: "Thandiwe Mokoena obtient un Green Tick en tant qu'ingénieure mobile.",
    name: "Thandiwe Mokoena",
    initials: "TM",
    role: "Ingénieure mobile",
    seal: "Green Tick",
    pill: { checking: "Analyse en cours", yourTurn: "À vous", waiting: "En attente", done: "Fait" },
    replay: "Revoir",
  },
  win: "Green Tick obtenu. Les porteurs d'idées peuvent désormais voir votre profil, et vous pouvez relire d'autres développeurs dans votre rôle.",
};

export const copy: Record<Lang, Copy> = { en, fr };
