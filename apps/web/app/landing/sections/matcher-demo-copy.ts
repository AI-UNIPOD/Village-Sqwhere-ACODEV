import type { Lang } from "../../locales";

type Match = {
  name: string;
  place: string;
};

/**
 * What the score is counted from, the same in both languages so the two can never disagree:
 * the numbers go through the formula of apps/api/app/services/match_score.py (matcher-demo-score.ts).
 */
type Facts = {
  /** The sectors the idea's owner builds for (slugs of onboarding/options.ts). */
  ownerSectors: string[];
  matches: [
    { roles: number[]; shared: string[]; sectors: string[] },
    { roles: number[]; shared: string[]; sectors: string[] },
    { roles: number[]; shared: string[]; sectors: string[] },
  ];
};

type Idea = {
  title: string;
  owner: string;
  place: string;
  pitch: string;
  /** The roles the idea needs: a match's `roles` in the facts are positions in this list. */
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
    "Counting the technologies and sectors you share",
    "Ordering by score: roles, shared technologies, shared sectors",
  ],
  done: "Three suggestions. You decide.",
  tag: "The matcher suggests. The owner decides.",
  waiting: "Pick an idea and the matcher starts.",
  invite: "Send three invitations",
  inviting: "Sending invitations",
  signed: (name) => `${name} read the agreement and signed.`,
  again: "Try another idea",
  bridge: "What is a Green Tick?",
  ideas: [
    {
      title: "Daily naira payouts for market traders",
      owner: "Ọmọlará Adéwálé",
      place: "Nigeria",
      pitch: "An app that pays market traders in naira each evening and retries when the bank network drops.",
      roles: ["Backend and Systems Engineer", "Mobile Engineer", "Cybersecurity and Smart Contract Auditor"],
      matches: [
        { name: "Hamza Benali", place: "Morocco" },
        { name: "Thandiwe Mokoena", place: "South Africa" },
        { name: "Kidist Alemayehu", place: "Ethiopia" },
      ],
      win: "All three read the agreement and signed. Four builders in Nigeria, Morocco, South Africa and Ethiopia.",
    },
    {
      title: "Market prices by SMS, in Wolof and French",
      owner: "Seynabou Faye",
      place: "Senegal",
      pitch: "Farmers near Thiès text a crop name and get today's market price back.",
      roles: ["Backend and Systems Engineer", "MLOps and Data Engineer", "AI and ML Engineer"],
      matches: [
        { name: "Yannick Mbarga", place: "Cameroon" },
        { name: "Aline Uwimana", place: "Rwanda" },
        { name: "Joaquim Fortes", place: "Cabo Verde" },
      ],
      win: "All three read the agreement and signed. Four builders, four countries: Senegal, Cameroon, Rwanda and Cabo Verde.",
    },
    {
      title: "Clinic queue that texts patients their turn",
      owner: "Kiprono Cheruiyot",
      place: "Kenya",
      pitch: "Patients join the queue from a basic phone and get an SMS when their turn is near.",
      roles: ["Mobile Engineer", "DevOps and Cloud Engineer", "UI/UX Engineer and Product Architect"],
      matches: [
        { name: "Rehema Salim", place: "Kenya" },
        { name: "Nelson Machava", place: "Mozambique" },
        { name: "Tiana Rakotoarisoa", place: "Madagascar" },
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
    "Décompte des technologies et des domaines en commun",
    "Classement par score\u202f: rôles, technologies en commun, domaines en commun",
  ],
  done: "Trois propositions. À vous de décider.",
  tag: "Le matcher propose. Le porteur de l'idée décide.",
  waiting: "Choisissez une idée et le matcher se lance.",
  invite: "Envoyer trois invitations",
  inviting: "Envoi des invitations",
  signed: (name) => `${name} a lu l'accord et signé.`,
  again: "Essayer une autre idée",
  bridge: "Qu'est-ce qu'un Green Tick\u202f?",
  ideas: [
    {
      title: "Paiement en nairas chaque soir pour les marchands",
      owner: "Ọmọlará Adéwálé",
      place: "Nigeria",
      pitch:
        "Une application qui paie les marchands en nairas chaque soir et relance le paiement si le réseau bancaire tombe.",
      roles: [
        "Ingénieur backend et systèmes",
        "Ingénieur mobile",
        "Auditeur cybersécurité et smart contracts",
      ],
      matches: [
        { name: "Hamza Benali", place: "Maroc" },
        { name: "Thandiwe Mokoena", place: "Afrique du Sud" },
        { name: "Kidist Alemayehu", place: "Éthiopie" },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs au Nigeria, au Maroc, en Afrique du Sud et en Éthiopie.",
    },
    {
      title: "Les prix du marché par SMS, en wolof et en français",
      owner: "Seynabou Faye",
      place: "Sénégal",
      pitch:
        "Les agriculteurs des environs de Thiès envoient le nom d'une culture par SMS et reçoivent le prix du jour.",
      roles: ["Ingénieur backend et systèmes", "Ingénieur MLOps et données", "Ingénieur IA et ML"],
      matches: [
        { name: "Yannick Mbarga", place: "Cameroun" },
        { name: "Aline Uwimana", place: "Rwanda" },
        { name: "Joaquim Fortes", place: "Cap-Vert" },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs, quatre pays\u202f: Sénégal, Cameroun, Rwanda et Cap-Vert.",
    },
    {
      title: "Une file d'attente de clinique qui prévient par SMS",
      owner: "Kiprono Cheruiyot",
      place: "Kenya",
      pitch: "Le patient rejoint la file depuis un téléphone simple et reçoit un SMS quand son tour approche.",
      roles: ["Ingénieur mobile", "Ingénieur DevOps et cloud", "Ingénieur UI/UX et architecte produit"],
      matches: [
        { name: "Rehema Salim", place: "Kenya" },
        { name: "Nelson Machava", place: "Mozambique" },
        { name: "Tiana Rakotoarisoa", place: "Madagascar" },
      ],
      win: "Les trois ont lu l'accord et signé. Quatre développeurs, trois pays\u202f: deux au Kenya, un au Mozambique, un à Madagascar.",
    },
  ],
};

export const copy: Record<Lang, Copy> = { en, fr };

// Roles are positions in each idea's `roles`. Made-up people: the first of each idea holds two
// of the roles, the others one; the sectors in common run from two to none.
export const FACTS: [Facts, Facts, Facts] = [
  {
    ownerSectors: ["fintech", "commerce"],
    matches: [
      { roles: [0, 2], shared: ["go", "postgresql", "docker"], sectors: ["fintech", "commerce", "health"] },
      { roles: [1], shared: ["flutter", "react-native", "java"], sectors: ["fintech", "education"] },
      { roles: [2], shared: ["python"], sectors: ["civic"] },
    ],
  },
  {
    ownerSectors: ["agritech", "commerce"],
    matches: [
      { roles: [0, 1], shared: ["python", "postgresql"], sectors: ["agritech", "commerce", "fintech"] },
      { roles: [1], shared: ["python", "docker"], sectors: ["agritech", "climate-energy"] },
      { roles: [2], shared: ["pytorch", "llms"], sectors: ["health"] },
    ],
  },
  {
    ownerSectors: ["health", "civic"],
    matches: [
      { roles: [0], shared: ["flutter", "java"], sectors: ["health", "civic"] },
      { roles: [1], shared: ["docker", "kubernetes", "terraform"], sectors: ["health", "fintech"] },
      { roles: [2], shared: ["react", "vue"], sectors: ["media-culture"] },
    ],
  },
];
