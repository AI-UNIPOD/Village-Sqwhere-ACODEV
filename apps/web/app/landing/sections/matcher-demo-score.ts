import type { Scored } from "../../ideas/ideas-api";
import { FACTS } from "./matcher-demo-copy";

// The numbers of version 1 of the match score: the same as apps/api/app/services/match_score.py,
// which the demo's test reads to check they agree (docs/decisions/2026-11-14-match-score.md).
export const ONE_ROLE_POINTS = 30;
export const MANY_ROLES_POINTS = 40;
export const TECHNOLOGY_POINTS = 4;
export const TECHNOLOGY_CAP = 5;
export const SECTOR_POINTS = 5;
export const SECTOR_CAP = 2;
export const MEANING_MAX = 30;

const ROLES_MAX = MANY_ROLES_POINTS;
const TECHNOLOGIES_MAX = TECHNOLOGY_POINTS * TECHNOLOGY_CAP;
const SECTORS_MAX = SECTOR_POINTS * SECTOR_CAP;
// the 70 points that exist before the meaning part
const AVAILABLE_MAX = ROLES_MAX + TECHNOLOGIES_MAX + SECTORS_MAX;

const named = (slug: string) => ({ slug, name: slug });

// One made-up suggestion's score, counted as the API counts it: the roles it holds, the
// technologies it shares with the owner and the sectors they both build for, scaled from 70 to
// 100 and rounded half up. The shape is what the app's match card is given.
export function demoScore(idea: number, match: number): Required<Scored> & { shared_technologies: { slug: string; name: string }[] } {
  const { ownerSectors, matches } = FACTS[idea];
  const { roles, shared, sectors } = matches[match];
  const sharedSectors = sectors.filter((sector) => ownerSectors.includes(sector));
  const rolePoints = roles.length >= 2 ? MANY_ROLES_POINTS : roles.length === 1 ? ONE_ROLE_POINTS : 0;
  const technologyPoints = Math.min(shared.length, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS;
  const sectorPoints = Math.min(sharedSectors.length, SECTOR_CAP) * SECTOR_POINTS;
  const raw = rolePoints + technologyPoints + sectorPoints;
  return {
    score: Math.floor((raw * 100 + AVAILABLE_MAX / 2) / AVAILABLE_MAX),
    partial: true,
    breakdown: {
      roles: { points: rolePoints, max: ROLES_MAX },
      technologies: { points: technologyPoints, max: TECHNOLOGIES_MAX },
      sectors: { points: sectorPoints, max: SECTORS_MAX },
      meaning: { points: null, max: MEANING_MAX },
    },
    shared_technologies: shared.map(named),
    shared_sectors: sharedSectors.map(named),
  };
}
