import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import VillageError from "../[lang]/village/error";
import { SESSION_KEY } from "../session/session";
import { copy } from "./copy";
import { Village } from "./village";

const route = vi.hoisted(() => ({ lang: "en" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }) }));

const fetchMock = vi.fn();

const role = (slug: string, name: string, verified = false) => ({
  slug,
  name,
  is_primary: true,
  verified_at: verified ? "2026-11-06T18:00:00Z" : null,
});

// what GET /v1/me answers for a made-up developer
function signedInAs(me: { roles?: unknown[]; technologies?: unknown[]; display_name?: string }) {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ data: { username: "aminata-n", display_name: "Aminata Ndiaye", roles: [], technologies: [], ...me } }),
      { status: 200 },
    ),
  );
}

// the step with this title, as a list item
const step = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li")!;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("while the profile loads, the page says so and shows no empty profile", async () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<Village lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening your village");
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

test("a new member is greeted by name and sent to set up their profile first", async () => {
  signedInAs({});
  render(<Village lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Good to see you, Aminata." })).toBeTruthy();
  expect(screen.getByText("No role chosen yet")).toBeTruthy();

  const profile = step("Set up your profile");
  expect(within(profile).getByText("Next")).toBeTruthy();
  expect(within(profile).getByRole("link", { name: "Set up my profile" }).getAttribute("href")).toBe(
    "/en/onboarding?step=role",
  );
  for (const title of ["Earn your Green Tick", "Share an idea, or join one", "Build together in a hub"]) {
    expect(within(step(title)).getByText("Later")).toBeTruthy();
  }
});

test("with a role chosen, the profile step is done and verifying the role is next", async () => {
  signedInAs({
    roles: [role("backend-engineer", "Backend & Systems Engineer")],
    technologies: [{ slug: "go", name: "Go" }, { slug: "vector-databases", name: "Vector Databases" }],
  });
  render(<Village lang="fr" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Ravis de vous voir, Aminata." })).toBeTruthy();
  // the role and the stack are shown in French, by slug
  expect(screen.getByText("Ingénieur backend et systèmes")).toBeTruthy();
  expect(screen.getByText("Pas encore vérifié")).toBeTruthy();
  expect(screen.getByText("Bases de données vectorielles")).toBeTruthy();

  const profile = step("Configurer votre profil");
  expect(within(profile).getByText("Fait")).toBeTruthy();
  expect(within(profile).getByRole("link", { name: "Modifier mes réponses" }).getAttribute("href")).toBe(
    "/fr/onboarding?step=role",
  );
  const verify = step("Obtenir votre Green Tick");
  expect(within(verify).getByText("À faire")).toBeTruthy();
  expect(within(verify).getByRole("link", { name: "Commencer la vérification" }).getAttribute("href")).toBe("/fr/verification");
});

test("with an attempt under way, the step leads back to where it stands", async () => {
  const attempt = { attempts_used: 1, attempts_remaining: 2, latest_status: "awaiting_review" };
  signedInAs({ roles: [{ ...role("backend-engineer", "Backend & Systems Engineer"), verification: attempt }] });
  render(<Village lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(within(step("Earn your Green Tick")).getByRole("link", { name: "See where it stands" }).getAttribute("href")).toBe("/en/verification");
});

test("a verified role shows as verified, and its step is done", async () => {
  signedInAs({ roles: [role("backend-engineer", "Backend & Systems Engineer", true)] });
  render(<Village lang="en" />);
  expect(await screen.findByText("Verified")).toBeTruthy();
  expect(within(step("Earn your Green Tick")).getByText("Done")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Start verification" })).toBeNull();
  expect(screen.getByRole("link", { name: "Review attempts in your role" }).getAttribute("href")).toBe("/en/reviews");
});

test("a role the web app does not know keeps the API's name", async () => {
  signedInAs({ roles: [role("game-engineer", "Game Engineer")] });
  render(<Village lang="fr" />);
  expect(await screen.findByText("Game Engineer")).toBeTruthy();
});

test("without a real name the username is shown once, linked to GitHub", async () => {
  signedInAs({ display_name: "aminata-n" });
  render(<Village lang="en" />);
  const link = await screen.findByRole("link", { name: "aminata-n (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/aminata-n");
  expect(screen.queryByText("@aminata-n")).toBeNull();
});

test("the header leads home to the village and switches language on the same screen", async () => {
  signedInAs({});
  render(<Village lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe("/en/village");
  expect(screen.getByRole("link", { name: "Français" }).getAttribute("href")).toBe("/fr/village");
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

test.each([
  ["en", "We couldn't open your village", "Try again"],
  ["fr", "Nous n'avons pas pu ouvrir votre village", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  route.lang = lang;
  const onRetry = vi.fn();
  render(<VillageError retry={onRetry} />);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
    : "text";

test("English and French say the same things, with no dashes and no exclamation marks", () => {
  expect(shape(copy.fr)).toEqual(shape(copy.en));
  // the en dash and the em dash, as character codes so this file holds no dash itself
  const banned = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}!]`);
  for (const text of strings(copy)) {
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(banned);
  }
});
