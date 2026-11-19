import type { Scored } from "../../ideas/ideas-api";
import { FACTS } from "./matcher-demo-copy";

// The numbers of version 2 of the match score: the same as apps/api/app/services/match_score.py,
// which the demo's test reads to check they agree (docs/decisions/2026-11-14-match-score.md and
// 2026-11-15-match-score-meaning.md).
export const ONE_ROLE_POINTS = 30;
export const MANY_ROLES_POINTS = 40;
export const TECHNOLOGY_POINTS = 4;
export const TECHNOLOGY_CAP = 5;
export const SECTOR_POINTS = 5;
export const SECTOR_CAP = 2;
export const MEANING_MAX = 30;
// the band the meaning points stretch over, measured on OpenAI's vectors
export const MEANING_FLOOR = 0.15;
export const MEANING_CEILING = 0.45;

const ROLES_MAX = MANY_ROLES_POINTS;
const TECHNOLOGIES_MAX = TECHNOLOGY_POINTS * TECHNOLOGY_CAP;
const SECTORS_MAX = SECTOR_POINTS * SECTOR_CAP;

const named = (slug: string) => ({ slug, name: slug });

// The meaning points, as meaning_points in match_score.py: the measured likeness placed in the
// band, 0 to 30, rounded half up.
export function meaningPoints(read: number): number {
  const position = Math.min(Math.max((read - MEANING_FLOOR) / (MEANING_CEILING - MEANING_FLOOR), 0), 1);
  return Math.floor(MEANING_MAX * position + 0.5);
}

// One made-up suggestion's score, counted as the API counts a real one whose idea and profile
// were both measured: the roles it holds, the technologies it shares with the owner, the sectors
// they both build for, and how alike the idea and the profile read, added up to 100. The shape
// is what the app's match card is given.
export function demoScore(idea: number, match: number): Required<Scored> & { shared_technologies: { slug: string; name: string }[] } {
  const { ownerSectors, matches } = FACTS[idea];
  const { roles, shared, sectors, read } = matches[match];
  const sharedSectors = sectors.filter((sector) => ownerSectors.includes(sector));
  const rolePoints = roles.length >= 2 ? MANY_ROLES_POINTS : roles.length === 1 ? ONE_ROLE_POINTS : 0;
  const technologyPoints = Math.min(shared.length, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS;
  const sectorPoints = Math.min(sharedSectors.length, SECTOR_CAP) * SECTOR_POINTS;
  const meaning = meaningPoints(read);
  return {
    score: rolePoints + technologyPoints + sectorPoints + meaning,
    partial: false,
    breakdown: {
      roles: { points: rolePoints, max: ROLES_MAX },
      technologies: { points: technologyPoints, max: TECHNOLOGIES_MAX },
      sectors: { points: sectorPoints, max: SECTORS_MAX },
      meaning: { points: meaning, max: MEANING_MAX },
    },
    shared_technologies: shared.map(named),
    shared_sectors: sharedSectors.map(named),
  };
}
