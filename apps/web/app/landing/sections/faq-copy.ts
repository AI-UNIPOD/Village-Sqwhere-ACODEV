import type { Lang } from "../../locales";

type Copy = {
  title: string;
  items: Array<{ q: string; a: string }>;
};

const en: Copy = {
  title: "Questions, answered plainly.",
  items: [
    {
      q: "Who is Village Sqwhere for?",
      a: "Developers across Africa who want to build with others. You sign in with your GitHub account.",
    },
    {
      q: "Who can read my idea?",
      a: "Until you publish, only you. Then signed-in developers see the title, summary and roles. The private brief stays with your team.",
    },
    {
      q: "How big is a team?",
      a: "A hub takes up to five members, you included. Everyone signs the same agreement before joining.",
    },
    {
      q: "Do I need a Green Tick?",
      a: "Not to share an idea. To be suggested to other owners, yes. You get three attempts per role.",
    },
    {
      q: "Which languages does it use?",
      a: "English and French, on every screen. Switch any time from the header.",
    },
    {
      q: "Can I look around before signing up?",
      a: "Yes. The demo is a read-only account with a guided tour. Nothing you change is saved.",
    },
  ],
};

// Needs a native French review before launch.
const fr: Copy = {
  title: "Vos questions, sans détour.",
  items: [
    {
      q: "À qui s'adresse Village Sqwhere\u202f?",
      a: "Aux développeurs de toute l'Afrique qui veulent construire avec d'autres. Vous vous connectez avec votre compte GitHub.",
    },
    {
      q: "Qui peut lire mon idée\u202f?",
      a: "Tant que vous ne publiez pas, vous seul. Ensuite, les développeurs connectés voient le titre, le résumé et les rôles. Le dossier privé reste dans votre équipe.",
    },
    {
      q: "Quelle est la taille d'une équipe\u202f?",
      a: "Un espace accueille jusqu'à cinq membres, vous compris. Chacun signe le même accord avant de rejoindre l'équipe.",
    },
    {
      q: "Me faut-il un Green Tick\u202f?",
      a: "Pas pour partager une idée. Pour être proposé aux autres porteurs, oui. Vous avez trois tentatives par rôle.",
    },
    {
      q: "Quelles langues utilise-t-il\u202f?",
      a: "L'anglais et le français, sur chaque écran. Changez à tout moment depuis l'en-tête.",
    },
    {
      q: "Puis-je explorer avant de m'inscrire\u202f?",
      a: "Oui. La démo est un compte en lecture seule, avec une visite guidée. Rien de ce que vous modifiez n'est enregistré.",
    },
  ],
};

export const copy: Record<Lang, Copy> = { en, fr };
