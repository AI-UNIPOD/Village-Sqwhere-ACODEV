import { vi } from "vitest";

// The score fields of a match, as the API sends them: `parts` are the raw points of roles,
// technologies and sectors. Without `meaning` the pair was not compared (version 1, partial);
// with it, both were, and the score is the plain sum of the four parts (version 2).
export const scored = (
  score: number,
  parts: [number, number, number],
  shared_sectors: { slug: string; name: string }[] = [],
  meaning: number | null = null,
) => ({
  score,
  score_version: meaning === null ? 1 : 2,
  partial: meaning === null,
  breakdown: {
    roles: { points: parts[0], max: 40 },
    technologies: { points: parts[1], max: 20 },
    sectors: { points: parts[2], max: 10 },
    meaning: { points: meaning, max: 30 },
  },
  shared_sectors,
});

export const fintech = { slug: "fintech", name: "Fintech" };
export const agritech = { slug: "agritech", name: "Agritech" };

// A score shows its final number at once when motion is reduced, so a screen test never sees it mid-count.
export const stillMotion = () =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
