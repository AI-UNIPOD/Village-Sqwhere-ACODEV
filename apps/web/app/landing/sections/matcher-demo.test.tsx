import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MatcherDemo } from "./matcher-demo";

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

// Without a way to see when it scrolls into view (no IntersectionObserver in jsdom), the section
// keeps what the server drew: the first idea's three suggestions, so it reads without a script.
test("without a script it shows the first idea's suggestions, each verified, with what they share", () => {
  render(<MatcherDemo lang="en" />);
  const matches = section().getAllByRole("listitem").filter((li) => li.className.includes("match"));
  expect(matches.map((li) => within(li).getByText(/^(Hamza|Thandiwe|Kidist)/).textContent)).toEqual([
    "Hamza Benali",
    "Thandiwe Mokoena",
    "Kidist Alemayehu",
  ]);
  expect(section().getByText("Verified: Backend and Systems Engineer")).toBeTruthy();
  expect(section().getAllByRole("list", { name: "In common with Ọmọlará" })).toHaveLength(3);
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

// Match scores are planned, not built: the demo shows simulated ones, drawn as the design
// system's match score, and says they are simulated.
test.each([
  ["en", "Simulated score: 92, Strong match", "Simulated score: 74, Possible match", "Scores here are simulated: match scores are a planned feature."],
  // the French no-break space before the colon reads as a space once Testing Library normalises it
  ["fr", "Score simulé : 92, Correspondance forte", "Score simulé : 74, Correspondance possible", "Scores simulés ici : le score de correspondance est une fonction prévue."],
] as const)("in %s each suggestion has a simulated score with its step, and the panel says so", (lang, strong, possible, note) => {
  render(<MatcherDemo lang={lang} />);
  expect(section().getByText(strong)).toBeTruthy();
  expect(section().getByText(possible)).toBeTruthy();
  expect(section().getByText(note)).toBeTruthy();
});

test("with reduced motion a picked idea's scores show their final value at once", () => {
  stubMotion(true);
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getByRole("radio", { name: /Clinic queue/ }));
  const first = section().getAllByRole("listitem").find((li) => li.textContent?.includes("Rehema Salim"))!;
  expect(within(first).getByText("94", { selector: "[aria-hidden]" })).toBeTruthy();
});

test("picking an idea runs the matcher line by line, then suggests three developers", () => {
  vi.useFakeTimers();
  render(<MatcherDemo lang="en" />);
  fireEvent.click(section().getByRole("radio", { name: /Clinic queue/ }));
  expect(live()).toBe("Reading the roles your idea needs");
  expect(section().queryByText("Rehema Salim")).toBeNull();
  act(() => vi.advanceTimersByTime(450));
  expect(live()).toBe("Finding developers verified in them");
  beats(3, 450);
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
