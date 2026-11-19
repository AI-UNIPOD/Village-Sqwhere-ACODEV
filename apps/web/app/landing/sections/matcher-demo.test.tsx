import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { TECHNOLOGIES, TOPICS } from "../../onboarding/options";
import { MatcherDemo } from "./matcher-demo";
import { copy, FACTS } from "./matcher-demo-copy";
import * as formula from "./matcher-demo-score";

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("reduce"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const section = () => within(document.querySelector<HTMLElement>("#matcher")!);
// one beat at a time: each beat's timer is set once the one before has been drawn
const beats = (count: number, ms: number) => {
  for (let i = 0; i < count; i++) act(() => vi.advanceTimersByTime(ms));
};
const shown = { selector: "p:not([aria-live])" };
const live = () => document.querySelector("#matcher [aria-live]")!.textContent;

beforeEach(() => stubMotion(false));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([
  ["en", "Watch the matcher find a team.", "Choose an idea"],
  ["fr", "Voyez le matcher trouver une équipe.", "Choisissez une idée"],
] as const)("the %s section names itself and offers three made-up ideas", (lang, title, legend) => {
  render(<MatcherDemo lang={lang} />);
  expect(section().getByRole("heading", { level: 2, name: title })).toBeTruthy();
  expect(section().getByRole("group", { name: legend })).toBeTruthy();
  expect(section().getAllByRole("radio")).toHaveLength(3);
});

// the three suggestions of the idea on show: a `li` of the suggestions, not one of their reasons
const cards = () => section().getAllByRole("listitem").filter((li) => li.className.includes("match") && !li.className.includes("matches"));

// Without a way to see when it scrolls into view (no IntersectionObserver in jsdom), the section
// keeps what the server drew: the first idea's three suggestions, so it reads without a script.
test("without a script it shows the first idea's suggestions, each with its reasons", () => {
  render(<MatcherDemo lang="en" />);
  expect(cards().map((li) => within(li).getByText(/^(Hamza|Thandiwe|Kidist)/).textContent)).toEqual([
    "Hamza Benali",
    "Thandiwe Mokoena",
    "Kidist Alemayehu",
  ]);
  // the reasons are the app's own: the roles held, the technologies in common, the sectors in common
  expect(section().getByText("Verified in Backend and Systems Engineer and Cybersecurity and Smart Contract Auditor")).toBeTruthy();
  expect(section().getByText("In common with you: Go, PostgreSQL, Docker")).toBeTruthy();
  expect(section().getByText("You both build for Fintech and Commerce")).toBeTruthy();
  expect(section().getAllByRole("list", { name: "Why this score" })).toHaveLength(3);
});

// The product stores a country and no city, so the demo shows a country for the owner and each match.
test.each([
  ["en", ["Morocco", "South Africa", "Ethiopia"], "Shared by Ọmọlará Adéwálé, Nigeria"],
  ["fr", ["Maroc", "Afrique du Sud", "Éthiopie"], "Partagée par Ọmọlará Adéwálé, Nigeria"],
] as const)("in %s the people are placed by country, not city", (lang, countries, sharedBy) => {
  render(<MatcherDemo lang={lang} />);
  for (const country of countries) expect(section().getByText(country)).toBeTruthy();
  expect(section().getByText(sharedBy)).toBeTruthy();
  expect(section().queryByText(/Casablanca|Johannesburg|Addis|Lagos/)).toBeNull();
});

// ---------- the score: the app's own component, counted from the made-up facts ----------

// The formula of docs/decisions/2026-11-14-match-score.md, written out again so the demo's data is
// checked against it and not against itself: 30 for one role and 40 for two or more, 4 for each
// technology up to 5, 5 for each sector up to 2, and the 70 that exist scaled to 100.
function expected(roles: number, technologies: number, sectors: number) {
  const parts = [roles >= 2 ? 40 : roles === 1 ? 30 : 0, Math.min(technologies, 5) * 4, Math.min(sectors, 2) * 5];
  return { parts, score: Math.round(((parts[0] + parts[1] + parts[2]) * 100) / 70) };
}

// What the formula gives each made-up person, worked by hand: [score, roles, technologies, sectors].
const SCORES = [
  [
    [89, 40, 12, 10],
    [67, 30, 12, 5],
    [49, 30, 4, 0],
  ],
  [
    [83, 40, 8, 10],
    [61, 30, 8, 5],
    [54, 30, 8, 0],
  ],
  [
    [69, 30, 8, 10],
    [67, 30, 12, 5],
    [54, 30, 8, 0],
  ],
] as const;

test.each(["en", "fr"] as const)("in %s every suggestion's score is the real formula applied to its made-up facts, best first", (lang) => {
  stubMotion(true);
  render(<MatcherDemo lang={lang} />);
  copy[lang].ideas.forEach((idea, i) => {
    fireEvent.click(section().getAllByRole("radio")[i]);
    const found = cards();
    expect(found).toHaveLength(3);
    const scores = found.map((card, m) => {
      const facts = FACTS[i].matches[m];
      const inCommon = facts.sectors.filter((sector) => FACTS[i].ownerSectors.includes(sector)).length;
      const want = expected(facts.roles.length, facts.shared.length, inCommon);
      expect([want.score, ...want.parts]).toEqual([...SCORES[i][m]]);
      expect(within(card).getByText(String(want.score), { selector: "[aria-hidden]" })).toBeTruthy();
      expect(within(card).getByText(idea.matches[m].name)).toBeTruthy();
      return want.score;
    });
    // the list is in the order of its scores
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    // every role a suggestion holds is one the idea needs
    for (const match of FACTS[i].matches) for (const role of match.roles) expect(idea.roles[role]).toBeTruthy();
  });
});

test("the demo draws what the formula gives: the score, its parts and what is in common", () => {
  FACTS.forEach((idea, i) =>
    idea.matches.forEach((match, m) => {
      const drawn = formula.demoScore(i, m);
      const [score, roles, technologies, sectors] = SCORES[i][m];
      expect(drawn.score).toBe(score);
      expect(drawn.partial).toBe(true);
      expect(drawn.breakdown.roles).toEqual({ points: roles, max: 40 });
      expect(drawn.breakdown.technologies).toEqual({ points: technologies, max: 20 });
      expect(drawn.breakdown.sectors).toEqual({ points: sectors, max: 10 });
      expect(drawn.breakdown.meaning).toEqual({ points: null, max: 30 });
      expect(drawn.shared_technologies.map((tech) => tech.slug)).toEqual(match.shared);
      expect(drawn.shared_sectors.map((sector) => sector.slug)).toEqual(match.sectors.filter((s) => idea.ownerSectors.includes(s)));
    }),
  );
});

test("the demo's numbers are the API's: the constants of match_score.py", () => {
  const python = readFileSync(join(__dirname, "../../../../api/app/services/match_score.py"), "utf8");
  const api = (name: string) => Number(new RegExp(`^${name} = (\\d+)`, "m").exec(python)![1]);
  expect(formula.ONE_ROLE_POINTS).toBe(api("ONE_ROLE_POINTS"));
  expect(formula.MANY_ROLES_POINTS).toBe(api("MANY_ROLES_POINTS"));
  expect(formula.TECHNOLOGY_POINTS).toBe(api("TECHNOLOGY_POINTS"));
  expect(formula.TECHNOLOGY_CAP).toBe(api("TECHNOLOGY_CAP"));
  expect(formula.SECTOR_POINTS).toBe(api("SECTOR_POINTS"));
  expect(formula.SECTOR_CAP).toBe(api("SECTOR_CAP"));
  expect(formula.MEANING_MAX).toBe(api("MEANING_MAX"));
});

test("every technology and sector of the facts is one the product knows, so each shows in the page's language", () => {
  for (const idea of FACTS) {
    for (const slug of idea.ownerSectors) expect(TOPICS.some((topic) => topic.slug === slug)).toBe(true);
    for (const match of idea.matches) {
      for (const slug of match.shared) expect(TECHNOLOGIES.some((tech) => tech.slug === slug)).toBe(true);
      for (const slug of match.sectors) expect(TOPICS.some((topic) => topic.slug === slug)).toBe(true);
    }
  }
});

test.each([
  [
    "en",
    "Why this score",
    "Partial score: it counts roles, technologies and sectors. It does not yet compare what the idea and the profile say.",
    "Match score: 89 out of 100, Strong match. Partial score.",
    "Match score: 49 out of 100, Weak match. Partial score.",
  ],
  // the French no-break space before the colon reads as a space once Testing Library normalises it
  [
    "fr",
    "Pourquoi ce score",
    "Score partiel : il compte les rôles, les technologies et les domaines. Il ne compare pas encore ce que disent l'idée et le profil.",
    "Score de correspondance : 89 sur 100, très bonne correspondance. Score partiel.",
    "Score de correspondance : 49 sur 100, correspondance faible. Score partiel.",
  ],
] as const)("in %s each suggestion shows its parts, the partial note and one sentence for a screen reader", (lang, why, note, strong, weak) => {
  render(<MatcherDemo lang={lang} />);
  const lists = section().getAllByRole("list", { name: why });
  expect(lists).toHaveLength(3);
  // roles, technologies, sectors, and the meaning part that is not counted yet
  for (const list of lists) expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  // on each card for wide screens, and once under the list for a phone, where the cards fold
  expect(section().getAllByText(note)).toHaveLength(4);
  expect(section().getByText(strong)).toBeTruthy();
  expect(section().getByText(weak)).toBeTruthy();
});

test("the parts are written out with their points, as on the app's card", () => {
  render(<MatcherDemo lang="en" />);
  const lines = (card: HTMLElement) => within(card).getAllByRole("listitem").map((item) => item.textContent);
  expect(lines(cards()[0])).toEqual([
    "Roles40 of 40Verified in Backend and Systems Engineer and Cybersecurity and Smart Contract Auditor",
    "Technologies12 of 20In common with you: Go, PostgreSQL, Docker",
    "Sectors10 of 10You both build for Fintech and Commerce",
    "MeaningNot compared yet",
  ]);
  expect(lines(cards()[2]).slice(2)).toEqual(["Sectors0 of 10No sectors in common", "MeaningNot compared yet"]);
});

test("in French the technologies, the sectors and the roles are named in French", () => {
  stubMotion(true);
  render(<MatcherDemo lang="fr" />);
  fireEvent.click(section().getAllByRole("radio")[1]);
  expect(section().getByText(/PyTorch, LLM$/)).toBeTruthy();
  expect(section().getByText(/Vous construisez tous deux pour Agritech et Commerce/)).toBeTruthy();
  expect(section().getByText(/Vérifié dans Ingénieur backend et systèmes et Ingénieur MLOps et données/)).toBeTruthy();
});

test.each(["en", "fr"] as const)("nothing in the %s demo says its scores are simulated or planned", (lang) => {
  stubMotion(true);
  const { container } = render(<MatcherDemo lang={lang} />);
  copy[lang].ideas.forEach((_, i) => {
    fireEvent.click(section().getAllByRole("radio")[i]);
    expect(container.textContent).not.toMatch(/simulat|simulé|planned|prévu/i);
  });
  expect(Object.keys(copy[lang])).not.toContain("simulated");
  expect(Object.keys(copy[lang])).not.toContain("scoreLine");
});

test.each([
  ["en", "Counting the technologies and sectors you share", "Ordering by score: roles, shared technologies, shared sectors"],
  ["fr", "Décompte des technologies et des domaines en commun", "Classement par score : rôles, technologies en commun, domaines en commun"],
] as const)("in %s the matcher's last status lines say how the score is counted", (lang, counting, ordering) => {
  expect(copy[lang].run[2]).toBe(counting);
  expect(copy[lang].run[3]).toBe(ordering);
});

test("the win lines name the country of the owner and of each suggestion, in both languages", () => {
  for (const lang of ["en", "fr"] as const) {
    for (const idea of copy[lang].ideas) {
      for (const place of new Set([idea.place, ...idea.matches.map((match) => match.place)])) expect(idea.win).toContain(place);
    }
  }
});

test("with reduced motion a picked idea's scores show their final value at once", () => {
  stubMotion(true);
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getByRole("radio", { name: /Clinic queue/ }));
  const first = section().getAllByRole("listitem").find((li) => li.textContent?.includes("Rehema Salim"))!;
  expect(within(first).getByText("69", { selector: "[aria-hidden]" })).toBeTruthy();
});

test("picking an idea runs the matcher line by line, then suggests three developers", () => {
  vi.useFakeTimers();
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getByRole("radio", { name: /Clinic queue/ }));
  expect(live()).toBe("Reading the roles your idea needs");
  expect(section().queryByText("Rehema Salim")).toBeNull();
  act(() => vi.advanceTimersByTime(450));
  expect(live()).toBe("Finding developers verified in them");
  beats(2, 450);
  expect(live()).toBe("Ordering by score: roles, shared technologies, shared sectors");
  beats(1, 450);
  expect(live()).toBe("Three suggestions. You decide.");
  expect(section().getByText("Rehema Salim")).toBeTruthy();
  expect(section().getByText("The matcher suggests. The owner decides.")).toBeTruthy();
});

test("inviting the three shows each signature, then the closing line", () => {
  vi.useFakeTimers();
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getByRole("button", { name: "Send three invitations" }));
  expect(section().getByRole("button", { name: "Sending invitations" }).hasAttribute("disabled")).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  expect(section().getByText("Hamza Benali read the agreement and signed.")).toBeTruthy();
  expect(section().queryByText("Kidist Alemayehu read the agreement and signed.")).toBeNull();
  beats(3, 500);
  const win = "All three read the agreement and signed. Four builders in Nigeria, Morocco, South Africa and Ethiopia.";
  expect(section().getByText(win, shown)).toBeTruthy();
  expect(live()).toBe(win);
  fireEvent.click(section().getByRole("button", { name: "Try another idea" }));
  expect(section().getByText("Pick an idea and the matcher starts.")).toBeTruthy();
});

test("with reduced motion a pick and an invite land at once, with no steps", () => {
  stubMotion(true);
  render(<MatcherDemo lang="fr" />);
  fireEvent.click(section().getByRole("radio", { name: /prix du marché/ }));
  expect(section().getByText("Yannick Mbarga")).toBeTruthy();
  fireEvent.click(section().getByRole("button", { name: "Envoyer trois invitations" }));
  expect(section().getByText(/^Les trois ont lu l'accord et signé\. Quatre développeurs, quatre pays/, shown)).toBeTruthy();
  expect(section().getByText("Joaquim Fortes a lu l'accord et signé.")).toBeTruthy();
});

test("the Green Tick question leads to the section that answers it", () => {
  render(<MatcherDemo lang="en" />);
  expect(section().getByRole("link", { name: "What is a Green Tick?" }).getAttribute("href")).toBe("#green-tick");
});

test("each suggestion's reasons open and close from its own Why this score button", () => {
  render(<MatcherDemo lang="en" />);
  const buttons = section().getAllByRole("button", { name: "Why this score" });
  expect(buttons).toHaveLength(3);
  const reasons = (i: number) => document.getElementById(buttons[i].getAttribute("aria-controls")!)!;
  expect(buttons.map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "false", "false"]);
  fireEvent.click(buttons[1]);
  expect(buttons[1].getAttribute("aria-expanded")).toBe("true");
  expect(reasons(1).getAttribute("data-open")).toBe("true");
  expect(reasons(0).getAttribute("data-open")).toBe("false");
  fireEvent.click(buttons[1]);
  expect(reasons(1).getAttribute("data-open")).toBe("false");
});

test("picking another idea folds the reasons again", () => {
  stubMotion(true);
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getAllByRole("button", { name: "Why this score" })[0]);
  fireEvent.click(section().getAllByRole("radio")[1]);
  expect(section().getAllByRole("button", { name: "Why this score" }).map((b) => b.getAttribute("aria-expanded"))).toEqual([
    "false",
    "false",
    "false",
  ]);
});

// jsdom has no layout, so this reads the stylesheet: the folding and the single note are for a
// phone only; wider screens show every reason open, with no button
test("only a phone folds the reasons, hides the pitch and says partial once", () => {
  const css = readFileSync(join(__dirname, "matcher-demo.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toContain(".why, .partialOnce { display: none; } @media (max-width: 767px) {");
  const phone = css.slice(css.indexOf(".why, .partialOnce { display: none; }"));
  expect(phone).toContain(".optionMeta, .ideaTitle, .pitch { display: none; }");
  expect(phone).toContain('.reasons[data-open="false"], .reasons > p { display: none; }');
  expect(phone).toContain(".partialOnce { display: block;");
});

