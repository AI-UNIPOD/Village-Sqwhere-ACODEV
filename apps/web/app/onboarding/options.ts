import { COUNTRIES } from "../landing/gather";
import type { Lang } from "../locales";
import type { Me } from "../session/me";

type Text = Record<Lang, string>;

// The signed-in developer. A GitHub account may have no name, so the real name can be
// missing and the username stands in.
export type Profile = { displayName: string | null; username: string };

// When GitHub has no name, the API stores the username as the name: show it once, not twice.
export function toProfile(me: Me): Profile {
  return { displayName: me.display_name !== me.username ? me.display_name : null, username: me.username };
}

export function firstName({ displayName, username }: Profile) {
  return displayName?.split(" ")[0] ?? username;
}

// The slugs are the ones the API stores (infra/db/init/002-schema.sql).
export const ROLES: ReadonlyArray<{ slug: string; name: Text; hint: Text }> = [
  {
    slug: "frontend-engineer",
    name: { en: "Frontend Engineer", fr: "Ingénieur frontend" },
    hint: { en: "Web interfaces, React, Vue", fr: "Interfaces web, React, Vue" },
  },
  {
    slug: "backend-engineer",
    name: { en: "Backend and Systems Engineer", fr: "Ingénieur backend et systèmes" },
    hint: { en: "APIs, databases, services", fr: "API, bases de données, services" },
  },
  {
    slug: "mobile-engineer",
    name: { en: "Mobile Engineer", fr: "Ingénieur mobile" },
    hint: { en: "Android, iOS, Flutter", fr: "Android, iOS, Flutter" },
  },
  {
    slug: "ai-ml-engineer",
    name: { en: "AI and ML Engineer", fr: "Ingénieur IA et ML" },
    hint: { en: "Models, LLMs, computer vision", fr: "Modèles, LLM, vision par ordinateur" },
  },
  {
    slug: "mlops-data-engineer",
    name: { en: "MLOps and Data Engineer", fr: "Ingénieur MLOps et données" },
    hint: { en: "Data pipelines, model serving", fr: "Pipelines de données, mise en service de modèles" },
  },
  {
    slug: "devops-cloud-engineer",
    name: { en: "DevOps and Cloud Engineer", fr: "Ingénieur DevOps et cloud" },
    hint: { en: "Deploys, containers, cloud", fr: "Déploiement, conteneurs, cloud" },
  },
  {
    slug: "embedded-iot-engineer",
    name: { en: "Embedded Systems and IoT Engineer", fr: "Ingénieur systèmes embarqués et IoT" },
    hint: { en: "Devices, sensors, firmware", fr: "Appareils, capteurs, firmware" },
  },
  {
    slug: "security-engineer",
    name: { en: "Cybersecurity and Smart Contract Auditor", fr: "Auditeur cybersécurité et smart contracts" },
    hint: { en: "Security reviews, contract audits", fr: "Revues de sécurité, audits de contrats" },
  },
  {
    slug: "ui-ux-engineer",
    name: { en: "UI/UX Engineer and Product Architect", fr: "Ingénieur UI/UX et architecte produit" },
    hint: { en: "Interface design, product structure", fr: "Design d'interface, structure du produit" },
  },
];

// Product names (React, Docker) are the same in both languages. Only the plain-word
// technologies are translated.
const product = (name: string): Text => ({ en: name, fr: name });

export const TECHNOLOGIES: ReadonlyArray<{ slug: string; name: Text }> = [
  { slug: "react", name: product("React") },
  { slug: "vue", name: product("Vue") },
  { slug: "go", name: product("Go") },
  { slug: "rust", name: product("Rust") },
  { slug: "nodejs", name: product("Node.js") },
  { slug: "python", name: product("Python") },
  { slug: "java", name: product("Java") },
  { slug: "flutter", name: product("Flutter") },
  { slug: "react-native", name: product("React Native") },
  { slug: "pytorch", name: product("PyTorch") },
  { slug: "tensorflow", name: product("TensorFlow") },
  { slug: "llms", name: { en: "LLMs", fr: "LLM" } },
  { slug: "computer-vision", name: { en: "Computer Vision", fr: "Vision par ordinateur" } },
  { slug: "postgresql", name: product("PostgreSQL") },
  { slug: "vector-databases", name: { en: "Vector Databases", fr: "Bases de données vectorielles" } },
  { slug: "kubernetes", name: product("Kubernetes") },
  { slug: "docker", name: product("Docker") },
  { slug: "terraform", name: product("Terraform") },
  { slug: "ci-cd", name: product("CI/CD") },
];

// A draft list. The API stores feed topics as technologies today.
export const TOPICS: ReadonlyArray<{ slug: string; name: Text }> = [
  { slug: "fintech", name: { en: "Fintech", fr: "Fintech" } },
  { slug: "agritech", name: { en: "Agritech", fr: "Agritech" } },
  { slug: "health", name: { en: "Health", fr: "Santé" } },
  { slug: "education", name: { en: "Education", fr: "Éducation" } },
  { slug: "climate-energy", name: { en: "Climate and energy", fr: "Climat et énergie" } },
  { slug: "mobility-logistics", name: { en: "Mobility and logistics", fr: "Mobilité et logistique" } },
  { slug: "commerce", name: { en: "Commerce", fr: "Commerce" } },
  { slug: "civic", name: { en: "Civic tech and public services", fr: "Civic tech et services publics" } },
  { slug: "media-culture", name: { en: "Media and culture", fr: "Médias et culture" } },
  { slug: "developer-tools", name: { en: "Developer tools", fr: "Outils pour développeurs" } },
];

// The API stores a country as two letters. The page lists them under the three-letter codes
// of landing/gather.ts, so this is the way across (the test checks it against the API's list).
export const ALPHA2: Record<string, string> = {
  DZA: "DZ", AGO: "AO", BEN: "BJ", BWA: "BW", BFA: "BF", BDI: "BI", CPV: "CV", CMR: "CM", CAF: "CF",
  TCD: "TD", COM: "KM", COG: "CG", COD: "CD", DJI: "DJ", EGY: "EG", GNQ: "GQ", ERI: "ER", SWZ: "SZ",
  ETH: "ET", GAB: "GA", GMB: "GM", GHA: "GH", GIN: "GN", GNB: "GW", CIV: "CI", KEN: "KE", LSO: "LS",
  LBR: "LR", LBY: "LY", MDG: "MG", MWI: "MW", MLI: "ML", MRT: "MR", MUS: "MU", MAR: "MA", MOZ: "MZ",
  NAM: "NA", NER: "NE", NGA: "NG", RWA: "RW", STP: "ST", SEN: "SN", SYC: "SC", SLE: "SL", SOM: "SO",
  ZAF: "ZA", SSD: "SS", SDN: "SD", TZA: "TZ", TGO: "TG", TUN: "TN", UGA: "UG", ZMB: "ZM", ZWE: "ZW",
};

// The 54 countries named in the page language and sorted for it ("Égypte" sits with the Es).
// `code` is the three-letter code onboarding keeps its answer under, `alpha2` the API's.
export function countriesFor(lang: Lang) {
  return COUNTRIES.map(([en, fr, code]) => ({ code, alpha2: ALPHA2[code], name: lang === "en" ? en : fr })).sort((a, b) =>
    a.name.localeCompare(b.name, lang),
  );
}
