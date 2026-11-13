import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import IdeasError from "../[lang]/ideas/error";
import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { BrowseIdeas } from "./browse";
import { ForYouIdeas } from "./for-you";
import { MyIdeas } from "./my-ideas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const backend = { slug: "backend-engineer", name: "Backend & Systems Engineer" };
const mobile = { slug: "mobile-engineer", name: "Mobile Engineer" };

const idea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Clinic queue for Kano",
  summary: "Patients wait for hours without knowing their turn.",
  stage: "prototype",
  roles_needed: [backend, mobile],
  author: { username: "ama-mensah", display_name: "Ama Mensah", is_verified: true },
  published_at: "2026-11-12T10:00:00Z",
  ...over,
});
const match = (over: Record<string, unknown> = {}, roles = [backend]) => ({ idea: idea(over), matched_roles: roles });

const role = (slug: string, verified = false) => ({
  slug,
  name: slug,
  is_primary: true,
  verified_at: verified ? "2026-11-06T18:00:00Z" : null,
});
const me = (roles: unknown[]) => ({ username: "wanjiru-kamau", display_name: "Wanjiru Kamau", roles, technologies: [] });

// Answers each address by its longest matching start; anything else is a mistake in the page.
function api(routes: Record<string, unknown>) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url).replace("http://localhost:8000", "");
    const found = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!found) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const answer = routes[found];
    return Promise.resolve(answer instanceof Response ? answer.clone() : reply(200, answer));
  });
}

const asked = () => fetchMock.mock.calls.map(([url]) => String(url).replace("http://localhost:8000", ""));
const verifiedMe = { data: me([role("backend-engineer", true)]) };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  forgetMe();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("each idea says which of your verified roles it needs, and opens its page", async () => {
  api({ "/v1/me/matches": { data: [match()], next_offset: null }, "/v1/me": verifiedMe });
  render(<ForYouIdeas lang="en" />);
  const link = await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(link.getAttribute("href")).toBe("/en/ideas/view?id=idea-1");
  const shown = link.closest("li")!;
  expect(within(shown).getByText("Needs your verified role: Backend and Systems Engineer")).toBeTruthy();
  // the card is the one the open ideas list draws
  expect(within(shown).getByText(/Patients wait for hours/)).toBeTruthy();
  expect(shown.textContent).toContain("by Ama Mensah");
  // no score and no claim to be AI
  expect(screen.queryByText(/\d%|\bscore\b|\bAI\b/)).toBeNull();
});

test("several roles are listed by name, in the page's language", async () => {
  api({
    "/v1/me/matches": { data: [match({}, [backend, mobile])], next_offset: null },
    "/v1/me": { data: me([role("backend-engineer", true), role("mobile-engineer", true)]) },
  });
  render(<ForYouIdeas lang="fr" />);
  const link = await screen.findByRole("link", { name: "Clinic queue for Kano" });
  // Testing Library reads the narrow no-break space as a plain one, so the text is checked as it is written too
  const shown = link.closest("li")!;
  expect(within(shown).getByText("Recherche vos rôles vérifiés : Ingénieur backend et systèmes, Ingénieur mobile")).toBeTruthy();
  expect(shown.textContent).toContain("vérifiés\u202f: Ingénieur");
  expect(link.getAttribute("href")).toBe("/fr/ideas/view?id=idea-1");
  expect(screen.getByRole("heading", { level: 1, name: "Idées qui ont besoin de vous" })).toBeTruthy();
});

test("one role in French uses the singular", async () => {
  api({ "/v1/me/matches": { data: [match()], next_offset: null }, "/v1/me": verifiedMe });
  render(<ForYouIdeas lang="fr" />);
  const line = await screen.findByText("Recherche votre rôle vérifié : Ingénieur backend et systèmes");
  expect(line.textContent).toContain("vérifié\u202f: Ingénieur");
});

test("a developer with a role that is not verified is told ideas match verified roles, and sent to verify", async () => {
  api({ "/v1/me": { data: me([role("backend-engineer")]) }, "/v1/me/matches": { data: [match()], next_offset: null } });
  render(<ForYouIdeas lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "Verify a role to see the ideas that need you" })).toBeTruthy();
  expect(screen.getByText(/Ideas are matched to verified roles/)).toBeTruthy();
  const links = screen.getAllByRole("link", { name: "Verify my role" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/en/verification");
  expect(screen.queryByRole("link", { name: "Clinic queue for Kano" })).toBeNull();
  expect(asked().some((path) => path.startsWith("/v1/me/matches"))).toBe(false);
});

test("a developer with no role at all is sent to set up their profile first", async () => {
  api({ "/v1/me": { data: me([]) } });
  render(<ForYouIdeas lang="fr" />);
  expect(await screen.findByRole("heading", { level: 2, name: "Configurez d'abord votre profil" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Configurer mon profil" }).getAttribute("href")).toBe("/fr/onboarding?step=role");
  expect(screen.queryByRole("link", { name: "Faire vérifier mon rôle" })).toBeNull();
});

test("verified, but no open idea needs the role: it says so and leads to all open ideas", async () => {
  api({ "/v1/me/matches": { data: [], next_offset: null }, "/v1/me": verifiedMe });
  render(<ForYouIdeas lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "No open idea needs your role yet" })).toBeTruthy();
  const links = screen.getAllByRole("link", { name: "See all open ideas" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/en/ideas");
});

test("while the list loads there is a skeleton, and nothing is claimed yet", async () => {
  api({ "/v1/me": verifiedMe, "/v1/me/matches": { data: [match()], next_offset: null } });
  render(<ForYouIdeas lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Getting your ideas");
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  await screen.findByRole("link", { name: "Clinic queue for Kano" });
});

test("Show more adds the next page, and a failed one keeps the list and says so", async () => {
  const second = match({ id: "idea-2", title: "Matatu fare tracker" });
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.endsWith("/v1/me")) return Promise.resolve(reply(200, verifiedMe));
    if (path.includes("offset=0")) return Promise.resolve(reply(200, { data: [match()], next_offset: 20 }));
    return Promise.resolve(fetchMock.mock.calls.filter(([u]) => String(u).includes("offset=20")).length === 1 ? reply(500) : reply(200, { data: [second], next_offset: null }));
  });
  render(<ForYouIdeas lang="en" />);
  await screen.findByRole("link", { name: "Clinic queue for Kano" });

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByText(/We couldn't load more ideas/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Clinic queue for Kano" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByRole("link", { name: "Matatu fare tracker" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  expect(asked().filter((path) => path.startsWith("/v1/me/matches"))).toHaveLength(3);
});

class Catcher extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <IdeasError retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

test("a list that cannot load shows the ideas error screen, and Try again asks again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let calls = 0;
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith("/v1/me")) return Promise.resolve(reply(200, verifiedMe));
    calls += 1;
    return Promise.resolve(calls === 1 ? reply(500) : reply(200, { data: [match()], next_offset: null }));
  });
  render(
    <Catcher>
      <ForYouIdeas lang="en" />
    </Catcher>,
  );
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't show your ideas" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: "Clinic queue for Kano" })).toBeTruthy();
  vi.restoreAllMocks();
});

test("the three idea pages point at each other and mark where you are, in both languages", async () => {
  api({
    "/v1/me/matches": { data: [], next_offset: null },
    "/v1/me/ideas": { data: [], next_offset: null },
    "/v1/ideas": { data: [], next_offset: null },
    "/v1/me": verifiedMe,
  });
  const pages = [
    ["en", <BrowseIdeas key="o" lang="en" />, "Open ideas", ["Open ideas", "For you", "Your ideas"]],
    ["en", <ForYouIdeas key="f" lang="en" />, "For you", ["Open ideas", "For you", "Your ideas"]],
    ["en", <MyIdeas key="m" lang="en" />, "Your ideas", ["Open ideas", "For you", "Your ideas"]],
    ["fr", <ForYouIdeas key="ff" lang="fr" />, "Pour vous", ["Idées ouvertes", "Pour vous", "Vos idées"]],
  ] as const;
  for (const [lang, page, current, names] of pages) {
    const view = render(page);
    const tabs = within(await screen.findByRole("navigation", { name: lang === "en" ? "Ideas" : "Idées" }));
    expect(tabs.getAllByRole("link").map((link) => link.textContent)).toEqual([...names]);
    expect(tabs.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual([current]);
    expect(tabs.getByRole("link", { name: names[1] }).getAttribute("href")).toBe(`/${lang}/ideas/for-you`);
    view.unmount();
  }
});
