import type { Lang } from "../../locales";

type Match = {
  name: string;
  /** The verified role, in the product's words. */
  role: string;
  place: string;
  /** Technologies in common with the idea's owner. */
  shared: string[];
  /** A simulated match score: match scores are planned, the matcher has none today. */
  score: number;
};

type Idea = {
  title: string;
  owner: string;
  place: string;
  pitch: string;
  roles: string[];
  matches: [Match, Match, Match];
  /** The win line once all three have signed. */
  win: string;
};

type Copy = {
  title: string;
  lead: string;
  sampleNote: string;
  pickLabel: string;
  rolesNeeded: string;
  sharedBy: (owner: string, place: string) => string;
  /** What the matcher is doing, one line at a time: only what the real matcher does. */
  run: [string, string, string, string];
  done: string;
  tag: string;
  waiting: string;
  verified: string;
  inCommon: (owner: string) => string;
  /** Said once under the suggestions: the scores are simulated. */
  simulated: string;
  /** A score as screen readers hear it: what it is, the number and its step. */
  scoreLine: (score: number, step: string) => string;
  /** The match score's steps (docs/design-system/components.md): 80+, 60 to 79, 40 to 59, below 40. */
  steps: [string, string, string, string];
  invite: string;
  inviting: string;
  signed: (name: string) => string;
  again: string;
  bridge: string;
  ideas: [Idea, Idea, Idea];
};

const en: Copy = {
  title: "Watch the matcher find a team.",
  lead: "Pick an idea. See who the matcher suggests, then form the team yourself.",
  sampleNote: "Made-up ideas and people. Nothing here is saved.",
  pickLabel: "Choose an idea",
  rolesNeeded: "Roles needed",
  sharedBy: (owner, place) => `Shared by ${owner}, ${place}`,
  run: [
    "Reading the roles your idea needs",
    "Finding developers verified in them",
    "Counting the technologies you share",
    "Ordering by roles held, then shared technologies",
  ],
  done: "Three suggestions. You decide.",
  tag: "The matcher suggests. The owner decides.",
  waiting: "Pick an idea and the matcher starts.",
  verified: "Verified",
  inCommon: (owner) => `In common with ${owner}`,
  simulated: "Scores here are simulated: match scores are a planned feature.",
  scoreLine: (score, step) => `Simulated score: ${score}, ${step}`,
  steps: ["Strong match", "Possible match", "Weak match", "Poor match"],
  invite: "Send three invitations",
  inviting: "Sending invitations",
  signed: (name) => `${name} read the agreement and signed.`,
  again: "Try another idea",
  bridge: "What is a Green Tick?",
  ideas: [
    {
      title: "Daily naira payouts for market traders",
      owner: "Ọmọlará Adéwálé",
      place: "Lagos",
      pitch: "An app that pays market traders in naira each evening and retries when the bank network drops.",
      roles: ["Backend and Systems Engineer", "Mobile Engineer", "Cybersecurity and Smart Contract Auditor"],
      matches: [
        {
          name: "Hamza Benali",
          score: 92,
          role: "Backend and Systems Engineer",
          place: "Casablanca, Morocco",
          shared: ["Go", "PostgreSQL", "Docker"],
        },
        {
          name: "Thandiwe Mokoena",
          score: 86,
          role: "Mobile Engineer",
          place: "Johannesburg, South Africa",
          shared: ["Flutter", "React Native"],
        },
        {
          name: "Kidist Alemayehu",
          score: 74,
          role: "Cybersecurity and Smart Contract Auditor",
          place: "Addis Ababa, Ethiopia",
          shared: ["Python"],
        },
      ],
      win: "All three read the agreement and signed. Four builders in Lagos, Casablanca, Johannesburg and Addis Ababa.",
    },
    {
      title: "Market prices by SMS, in Wolof and French",
      owner: "Seynabou Faye",
      place: "Thiès",
      pitch: "Farmers near Thiès text a crop name and get today's market price back.",
      roles: ["Backend and Systems Engineer", "MLOps and Data Engineer", "AI and ML Engineer"],
      matches: [
        {
          name: "Yannick Mbarga",
          score: 89,
          role: "Backend and Systems Engineer",
          place: "Douala, Cameroon",
          shared: ["Python", "PostgreSQL"],
        },
        {
          name: "Aline Uwimana",
          score: 81,
          role: "MLOps and Data Engineer",
          place: "Kigali, Rwanda",
          shared: ["Python", "Docker"],
        },
        {
          name: "Joaquim Fortes",
          score: 67,
          role: "AI and ML Engineer",
          place: "Praia, Cabo Verde",
          shared: ["PyTorch", "LLMs"],
        },
      ],
      win: "All three read the agreement and signed. Four builders, four countries: Senegal, Cameroon, Rwanda and Cabo Verde.",
    },
    {
      title: "Clinic queue that texts patients their turn",
      owner: "Kiprono Cheruiyot",
      place: "Nairobi",
      pitch: "Patients join the queue from a basic phone and get an SMS when their turn is near.",
      roles: ["Mobile Engineer", "DevOps and Cloud Engineer", "UI/UX Engineer and Product Architect"],
      matches: [
        {
          name: "Rehema Salim",
          score: 94,
          role: "Mobile Engineer",
          place: "Mombasa, Kenya",
          shared: ["Flutter", "Java"],
        },
        {
          name: "Nelson Machava",
          score: 78,
          role: "DevOps and Cloud Engineer",
          place: "Maputo, Mozambique",
          shared: ["Docker", "Kubernetes"],
        },
        {
          name: "Tiana Rakotoarisoa",
          score: 71,
          role: "UI/UX Engineer and Product Architect",
          place: "Antananarivo, Madagascar",
          shared: ["React"],
        },
      ],
      win: "All three read the agreement and signed. Four builders, three countries: two in Kenya, one in Mozambique, one in Madagascar.",
    },
  ],
};

// Needs a native French review before launch.
const fr: Copy = {
  title: "Voyez le matcher trouver une équipe.",
  lead: "Choisissez une idée. Voyez qui le matcher propose, puis composez l'équipe vous-même.",
  sampleNote: "Idées et personnes inventées. Rien n'est enregistré ici.",
  pickLabel: "Choisissez une idée",
  rolesNeeded: "Rôles recherchés",
  sharedBy: (owner, place) => `Partagée par ${owner}, ${place}`,
  run: [
    "Lecture des rôles que votre idée recherche",
    "Recherche des développeurs vérifiés dans ces rôles",
    "Décompte des technologies en commun",
    "Classement par rôles détenus, puis technologies en commun",
  ],
  done: "Trois propositions. À vous de décider.",
  tag: "Le matcher propose. Le porteur décide.",
  waiting: "Choisissez une idée et le matcher se lance.",
  verified: "Vérifié",
  inCommon: (owner) => `En commun avec ${owner}`,
  simulated: "Scores simulés ici\u202f: le score de correspondance est une fonction prévue.",
  scoreLine: (score, step) => `Score simulé\u202f: ${score}, ${step}`,
  steps: ["Correspondance forte", "Correspondance possible", "Correspondance faible", "Correspondance très faible"],
  invite: "Envoyer trois invitations",
  inviting: "Envoi des invitations",
  signed: (name) => `${name} a lu l'accord et signé.`,
  again: "Essayer une autre idée",
  bridge: "Qu'est-ce qu'un Green Tick\u202f?",
  ideas: [
    {
      title: "Paiement en nairas chaque soir pour les marchands",
      owner: "Ọmọlará Adéwálé",
      place: "Lagos",
      pitch:
        "Une application qui paie les marchands en nairas chaque soir et relance le paiement si le réseau bancaire tombe.",
      roles: [
        "Ingénieur backend et systèmes",
        "Ingénieur mobile",
        "Auditeur cybersécurité et smart contracts",
      ],
      matches: [
        {
          name: "Hamza Benali",
          score: 92,
          role: "Ingénieur backend et systèmes",
          place: "Casablanca, Maroc",
          shared: ["Go", "PostgreSQL", "Docker"],
        },
        {
          name: "Thandiwe Mokoena",
          score: 86,
          role: "Ingénieur mobile",
          place: "Johannesburg, Afrique du Sud",
          shared: ["Flutter", "React Native"],
        },
        {
          name: "Kidist Alemayehu",
          score: 74,
          role: "Auditeur cybersécurité et smart contracts",
          place: "Addis-Abeba, Éthiopie",
          shared: ["Python"],
        },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs à Lagos, Casablanca, Johannesburg et Addis-Abeba.",
    },
    {
      title: "Les prix du marché par SMS, en wolof et en français",
      owner: "Seynabou Faye",
      place: "Thiès",
      pitch:
        "Les agriculteurs des environs de Thiès envoient le nom d'une culture par SMS et reçoivent le prix du jour.",
      roles: ["Ingénieur backend et systèmes", "Ingénieur MLOps et données", "Ingénieur IA et ML"],
      matches: [
        {
          name: "Yannick Mbarga",
          score: 89,
          role: "Ingénieur backend et systèmes",
          place: "Douala, Cameroun",
          shared: ["Python", "PostgreSQL"],
        },
        {
          name: "Aline Uwimana",
          score: 81,
          role: "Ingénieur MLOps et données",
          place: "Kigali, Rwanda",
          shared: ["Python", "Docker"],
        },
        {
          name: "Joaquim Fortes",
          score: 67,
          role: "Ingénieur IA et ML",
          place: "Praia, Cap-Vert",
          shared: ["PyTorch", "LLM"],
        },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs, quatre pays\u202f: Sénégal, Cameroun, Rwanda et Cap-Vert.",
    },
    {
      title: "Une file d'attente de clinique qui prévient par SMS",
      owner: "Kiprono Cheruiyot",
      place: "Nairobi",
      pitch: "Le patient rejoint la file depuis un téléphone simple et reçoit un SMS quand son tour approche.",
      roles: ["Ingénieur mobile", "Ingénieur DevOps et cloud", "Ingénieur UI/UX et architecte produit"],
      matches: [
        {
          name: "Rehema Salim",
          score: 94,
          role: "Ingénieur mobile",
          place: "Mombasa, Kenya",
          shared: ["Flutter", "Java"],
        },
        {
          name: "Nelson Machava",
          score: 78,
          role: "Ingénieur DevOps et cloud",
          place: "Maputo, Mozambique",
          shared: ["Docker", "Kubernetes"],
        },
        {
          name: "Tiana Rakotoarisoa",
          score: 71,
          role: "Ingénieur UI/UX et architecte produit",
          place: "Antananarivo, Madagascar",
          shared: ["React"],
        },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs, trois pays\u202f: deux au Kenya, un au Mozambique, un à Madagascar.",
    },
  ],
};

export const copy: Record<Lang, Copy> = { en, fr };
