import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { agritech, fintech, scored, stillMotion } from "./match-fixtures";
import { MatchScore, ScoreReasons } from "./match-score";

beforeEach(stillMotion);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  [100, "strong", "Strong match", true],
  [80, "strong", "Strong match", true],
  [79, "possible", "Possible match", false],
  [60, "possible", "Possible match", false],
  [59, "weak", "Weak match", true],
  [40, "weak", "Weak match", true],
  [39, "poor", "Poor match", true],
])("a score of %i is the %s step: %s, with its number at once and an icon where the step has one", (score, step, label, icon) => {
  const { container } = render(<MatchScore lang="en" score={score} partial />);
  expect(container.querySelector("[data-step]")!.getAttribute("data-step")).toBe(step);
  expect(screen.getByText(String(score))).toBeTruthy();
  expect(!!screen.getByText(label).querySelector("svg")).toBe(icon);
});

test("the three steps with an icon each have their own", () => {
  const icons = [100, 50, 10].map((score) => {
    const { container, unmount } = render(<MatchScore lang="en" score={score} partial />);
    const html = container.querySelector("svg")!.innerHTML;
    unmount();
    return html;
  });
  expect(new Set(icons).size).toBe(3);
});

test("a screen reader hears one sentence, in English and in French, and not the number or the pill on their own", () => {
  const { container, rerender } = render(<MatchScore lang="en" score={81} partial />);
  expect(container.textContent).toContain("Match score: 81 out of 100, Strong match. Partial score.");
  expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2);
  expect(container.querySelector('span[aria-hidden="true"]')!.textContent).toBe("81");

  rerender(<MatchScore lang="en" score={43} partial={false} />);
  expect(container.textContent).toContain("Match score: 43 out of 100, Weak match.");
  expect(container.textContent).not.toContain("Partial score");

  rerender(<MatchScore lang="fr" score={81} partial />);
  expect(container.textContent).toContain("Score de correspondance\u202f: 81 sur 100, très bonne correspondance. Score partiel.");
});

test.each([
  [85, "Très bonne correspondance"],
  [65, "Correspondance possible"],
  [45, "Correspondance faible"],
  [5, "Correspondance insuffisante"],
])("French names the step of %i: %s", (score, label) => {
  render(<MatchScore lang="fr" score={score} partial />);
  expect(screen.getByText(label)).toBeTruthy();
});

// ---------- motion ----------

// The frames the score asks for, run by hand: a test never waits for a real one.
function frames() {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const request = vi.fn((callback: FrameRequestCallback) => {
    queue.set(++id, callback);
    return id;
  });
  const cancel = vi.fn((one: number) => void queue.delete(one));
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    pending: () => queue.size,
    run: (after: number) => {
      const [first, callback] = [...queue][0];
      queue.delete(first);
      act(() => callback(performance.now() + after));
    },
  };
}

test("the number counts up once, then shows the score, and a card that renders again does not count again", () => {
  const raf = frames();
  const { container, rerender } = render(<MatchScore lang="en" score={81} partial />);
  const number = () => container.querySelector('[aria-hidden="true"]')!;
  expect(number().textContent).toBe("0");
  // a strong score swells while it lands
  expect(number().hasAttribute("data-swell")).toBe(true);

  raf.run(5000);
  expect(number().textContent).toBe("81");
  expect(raf.pending()).toBe(0);
  const asked = raf.request.mock.calls.length;

  rerender(<MatchScore lang="en" score={81} partial />);
  expect(number().textContent).toBe("81");
  expect(raf.request).toHaveBeenCalledTimes(asked);

  // fresh data for the same card shows at once
  rerender(<MatchScore lang="en" score={52} partial />);
  expect(number().textContent).toBe("52");
  expect(raf.pending()).toBe(0);
});

test("a weak score counts without a swell, and nothing keeps running after the card is gone", () => {
  const raf = frames();
  const { container, unmount } = render(<MatchScore lang="en" score={52} partial />);
  expect(container.querySelector("[data-swell]")).toBeNull();
  expect(raf.pending()).toBe(1);
  unmount();
  expect(raf.pending()).toBe(0);
  expect(raf.cancel).toHaveBeenCalled();
});

test("with reduced motion the number shows at once and no frame is asked for", () => {
  const request = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  const { container } = render(<MatchScore lang="en" score={92} partial />);
  expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe("92");
  expect(container.querySelector("[data-swell]")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

// ---------- the reasons ----------

const go = { slug: "go", name: "Go" };
const postgres = { slug: "postgresql", name: "PostgreSQL" };

const reasons = (props: Partial<Parameters<typeof ScoreReasons>[0]> & Pick<Parameters<typeof ScoreReasons>[0], "scored">) =>
  render(
    <ScoreReasons
      lang="en"
      roles="Verified in Backend Engineer and Systems Engineer"
      technologies={(names) => `In common with you: ${names}`}
      sectors={(names) => `You both build for ${names}`}
      {...props}
    />,
  );

const lines = () => within(screen.getByRole("list", { name: "Why this score" })).getAllByRole("listitem").map((item) => item.textContent);

test("the reasons are a named list of four parts, in order, each with its raw points", () => {
  reasons({ scored: { ...scored(100, [40, 20, 10], [fintech, agritech]), shared_technologies: [go, postgres] } });
  expect(lines()).toEqual([
    "Roles40 of 40Verified in Backend Engineer and Systems Engineer",
    "Technologies20 of 20In common with you: Go, PostgreSQL",
    "Sectors10 of 10You both build for Fintech and Agritech",
    "MeaningNot compared yet",
  ]);
  expect(screen.getByText("Partial score: it counts roles, technologies and sectors. It does not yet compare what the idea and the profile say.")).toBeTruthy();
});

test("nothing in common says so in words, and the points are zero", () => {
  reasons({ scored: { ...scored(0, [0, 0, 0]), shared_technologies: [] } });
  expect(lines()).toEqual([
    "Roles0 of 40Verified in Backend Engineer and Systems Engineer",
    "Technologies0 of 20No technologies in common",
    "Sectors0 of 10No sectors in common",
    "MeaningNot compared yet",
  ]);
});

test("a score that is not partial has no line about it", () => {
  reasons({ scored: { ...scored(100, [40, 20, 10]), partial: false, shared_technologies: [] } });
  expect(screen.queryByText(/Partial score/)).toBeNull();
});

test("an older API with no breakdown still gets its reasons, with no points, no sectors and no meaning", () => {
  reasons({ scored: { shared_technologies: [go] } });
  expect(lines()).toEqual(["RolesVerified in Backend Engineer and Systems Engineer", "TechnologiesIn common with you: Go"]);
  expect(screen.queryByText(/Partial score/)).toBeNull();
});

test("sector and technology names follow the page's language, and so does the rest", () => {
  reasons({
    lang: "fr",
    scored: { ...scored(80, [30, 0, 10], [{ slug: "health", name: "Health" }, { slug: "education", name: "Education" }]), shared_technologies: [] },
    sectors: (names) => `Vous construisez dans ${names}`,
  });
  const list = screen.getByRole("list", { name: "Pourquoi ce score" });
  expect(within(list).getByText("Vous construisez dans Santé et Éducation")).toBeTruthy();
  expect(within(list).getByText("30 sur 40")).toBeTruthy();
  expect(within(list).getByText("Pas encore comparé")).toBeTruthy();
  expect(within(list).getByText("Aucune technologie en commun")).toBeTruthy();
});
