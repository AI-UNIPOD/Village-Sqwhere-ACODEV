# Village Sqwhere

[English](README.md) · **Français**

**La place du village des développeurs africains.** Partagez une idée, trouvez des développeurs
qui veulent construire la même chose, et construisez-la ensemble dans un espace partagé où
votre idée reste protégée.

> Conçu pour **ACODev 2026**, la Coupe d'Afrique des Développeurs : *« Construire la
> plateforme d'échange africaine, pour les devs, par les devs. »*

**Démo en ligne :** bientôt disponible

---

## Pourquoi Village Sqwhere

La plupart des plateformes pour développeurs sont pensées pour le recrutement : profils, offres
d'emploi, recruteurs. Pourtant, beaucoup de bonnes idées ne voient jamais le jour, parce que
leur auteur ne trouve pas les bonnes personnes avec qui les construire, ou craint de perdre son
idée en la partageant.

Village Sqwhere est fait pour **construire ensemble**, pas pour recruter. La plateforme réunit
des développeurs aux idées proches et aux compétences complémentaires, et protège chaque idée
qui y est partagée.

## Comment ça marche

1. **Partagez une idée.** Décrivez ce que vous voulez construire et ce que vous y apportez.
2. **Trouvez votre équipe.** L'IA compare votre idée à celles des autres membres et vous propose
   des développeurs aux idées proches et aux compétences complémentaires.
3. **Protégez l'idée.** Avant de rejoindre un hub, chaque membre accepte un accord numérique
   contraignant (PI/NDA), pour que les idées puissent être partagées en toute sécurité.
4. **Construisez dans un Hub de Collaboration Virtuel.** L'équipe formée dispose d'un espace
   partagé qui l'accompagne du brainstorming à la conception et l'architecture, puis au
   développement et à la revue par les pairs.

La plateforme est conçue dès le départ pour fonctionner en **anglais et en français**.

## Technologies

| Élément | Technologie |
| --- | --- |
| Application web | [Next.js](https://nextjs.org/) (App Router), TypeScript |
| API | Python, [FastAPI](https://fastapi.tiangolo.com/) |
| Base de données | PostgreSQL avec [pgvector](https://github.com/pgvector/pgvector) pour la mise en relation par IA |
| Hébergement | Systalink |

## Structure du dépôt

```text
apps/
  web/        application web Next.js
  api/        service FastAPI
infra/        base de données locale (Docker) et notes de déploiement
docs/         architecture et documentation du projet
.github/      modèle de pull request
```

## Lancer le projet en local

Il vous faut [Node.js](https://nodejs.org/) 22 ou plus récent (24 recommandé),
[uv](https://docs.astral.sh/uv/) pour Python, et [Docker](https://www.docker.com/) pour la base
de données.

```bash
git clone https://github.com/AI-UNIPOD/Village-Sqwhere-ACODEV.git
cd Village-Sqwhere-ACODEV
corepack enable        # fournit la version de pnpm fixée par le projet
pnpm install
pnpm db:up             # Postgres + pgvector sur localhost:5432
pnpm dev:api           # API sur http://localhost:8000 (documentation sur /docs)
pnpm dev:web           # application web sur http://localhost:3000 (dans un second terminal)
```

Lancez `pnpm dev:api` et `pnpm dev:web` dans deux terminaux séparés. Au premier lancement,
`uv` installe automatiquement la bonne version de Python et les dépendances de l'API.

## Contribuer

Membres de l'équipe : consultez [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais) pour
l'installation, les branches et les conventions de commit.

## Licence

Pas encore de licence : tous droits réservés jusqu'à la soumission à ACODev 2026. Nous
prévoyons ensuite de publier le code sous licence MIT.

## Remerciements

Conçu à l'AI UniPod de l'Université de Lagos, pour ACODev 2026, organisé par Systalink.
