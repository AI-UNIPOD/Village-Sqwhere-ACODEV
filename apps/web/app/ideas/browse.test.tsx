import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { hub } from "../hubs/test-support";
import { SESSION_KEY } from "../session/session";
import { BrowseIdeas } from "./browse";
import { IdeaPage } from "./idea-page";
import { MyIdeas } from "./my-ideas";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const backend = { slug: "backend-engineer", name: "Backend & Systems Engineer" };
const mobile = { slug: "mobile-engineer", name: "Mobile Engineer" };

// a made-up open idea, as the API answers it
const idea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Clinic queue for Kano",
  summary: "Patients wait for hours without knowing their turn.\nA queue on a shared tablet.",
  stage: "prototype",
  roles_needed: [backend, mobile],
  author: { username: "ama-mensah", display_name: "Ama Mensah", is_verified: true },
  hub_id: "hub-1",
  published_at: "2026-11-12T10:00:00Z",
  ...over,
});

const me = (roles: unknown[] = [], username = "kwabena-owusu") => ({
  username,
  display_name: "Kwabena Owusu",
  roles,
  technologies: [],
});
const role = (slug: string, verified = false) => ({
  slug,
  name: slug,
  is_primary: true,
  verified_at: verified ? "2026-11-06T18:00:00Z" : null,
});

// Answers each address the pages ask for; anything else is a mistake in the page.
function api(routes: Record<string, unknown>) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url).replace("http://localhost:8000", "");
    // the longest address first, so /v1/me/ideas is not taken for /v1/me
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const answer = routes[match];
    return Promise.resolve(answer instanceof Response ? answer.clone() : reply(200, answer));
  });
}

const asked = () => fetchMock.mock.calls.map(([url]) => String(url).replace("http://localhost:8000", ""));
const card = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;

beforeEach(() => {
  nav.search = "";
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

// ---------- open ideas ----------

test("each open idea shows what it is, what it needs and who shared it, and opens its page", async () => {
  api({ "/v1/me": { data: me() }, "/v1/ideas": { data: [idea()], next_offset: null } });
  render(<BrowseIdeas lang="fr" />);
  const link = await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(link.getAttribute("href")).toBe("/fr/ideas/view?id=idea-1");
  const shown = card("Clinic queue for Kano");
  expect(within(shown).getByText(/Patients wait for hours/)).toBeTruthy();
  expect(within(shown).getByText("Ingénieur backend et systèmes")).toBeTruthy();
  expect(within(shown).getByText("Ingénieur mobile")).toBeTruthy();
  expect(shown.textContent).toContain("par Ama Mensah");
  expect(within(shown).getByText("Vérifié")).toBeTruthy();
});

test("an idea that needs a role you are verified in says so, with nothing left to do", async () => {
  api({ "/v1/me": { data: me([role("backend-engineer", true)]) }, "/v1/ideas": { data: [idea()], next_offset: null } });
  render(<BrowseIdeas lang="en" />);
  await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(screen.getByText("Needs your role: Backend and Systems Engineer")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Verify it" })).toBeNull();
});

test("an idea that needs a role you have not verified says how to be suggested", async () => {
  api({ "/v1/me": { data: me([role("mobile-engineer")]) }, "/v1/ideas": { data: [idea()], next_offset: null } });
  render(<BrowseIdeas lang="en" />);
  await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(card("Clinic queue for Kano").textContent).toContain("Needs your role: Mobile Engineer. Verify it to be suggested to the owner.");
  expect(screen.getByRole("link", { name: "Verify it" }).getAttribute("href")).toBe("/en/verification");
});

test("an idea that needs other roles makes no claim about you", async () => {
  api({ "/v1/me": { data: me([role("security-engineer", true)]) }, "/v1/ideas": { data: [idea()], next_offset: null } });
  render(<BrowseIdeas lang="en" />);
  await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(screen.queryByText(/Needs your role/)).toBeNull();
});

test("your own idea is marked as yours and opens in the composer", async () => {
  const mine = idea({ author: { username: "kwabena-owusu", display_name: "Kwabena Owusu", is_verified: false } });
  api({ "/v1/me": { data: me([role("backend-engineer", true)]) }, "/v1/ideas": { data: [mine], next_offset: null } });
  render(<BrowseIdeas lang="en" />);
  const link = await screen.findByRole("link", { name: "Clinic queue for Kano" });
  expect(link.getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
  expect(within(card("Clinic queue for Kano")).getByText("Yours")).toBeTruthy();
  expect(screen.queryByText(/Needs your role/)).toBeNull();
});

test("Show more adds the next page, and a failed one keeps the list and says so", async () => {
  const second = idea({ id: "idea-2", title: "Matatu fare tracker" });
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.endsWith("/v1/me")) return Promise.resolve(reply(200, { data: me() }));
    if (path.includes("offset=0")) return Promise.resolve(reply(200, { data: [idea()], next_offset: 20 }));
    return Promise.resolve(fetchMock.mock.calls.filter(([u]) => String(u).includes("offset=20")).length === 1 ? reply(500) : reply(200, { data: [second], next_offset: null }));
  });
  render(<BrowseIdeas lang="en" />);
  await screen.findByRole("link", { name: "Clinic queue for Kano" });

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByText(/We couldn't load more ideas/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Clinic queue for Kano" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByRole("link", { name: "Matatu fare tracker" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

test("with no open ideas, the page offers the one way to start", async () => {
  api({ "/v1/me": { data: me() }, "/v1/ideas": { data: [], next_offset: null } });
  render(<BrowseIdeas lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "No open ideas yet" })).toBeTruthy();
  const links = screen.getAllByRole("link", { name: "Share an idea" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/en/ideas/compose");
});

test("the two idea pages point at each other and mark where you are", async () => {
  api({ "/v1/me": { data: me() }, "/v1/ideas": { data: [], next_offset: null }, "/v1/me/ideas": { data: [], next_offset: null } });
  const open = render(<BrowseIdeas lang="en" />);
  await screen.findByRole("heading", { level: 2, name: "No open ideas yet" });
  let tabs = within(screen.getByRole("navigation", { name: "Ideas" }));
  expect(tabs.getByRole("link", { name: "Open ideas" }).getAttribute("aria-current")).toBe("page");
  expect(tabs.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");
  open.unmount();

  render(<MyIdeas lang="en" />);
  await screen.findByRole("heading", { level: 2, name: "No ideas yet" });
  tabs = within(screen.getByRole("navigation", { name: "Ideas" }));
  expect(tabs.getByRole("link", { name: "Your ideas" }).getAttribute("aria-current")).toBe("page");
  expect(tabs.getByRole("link", { name: "Open ideas" }).getAttribute("href")).toBe("/en/ideas");
});

// ---------- one open idea ----------

function view(roles: unknown[], over: Record<string, unknown> = {}, username?: string) {
  nav.search = "id=idea-1";
  const noPlace = { viewer: { membership_status: null, member_role: null } };
  api({ "/v1/me": { data: me(roles, username) }, "/v1/ideas/idea-1": { data: idea(over) }, "/v1/hubs/hub-1": { data: hub(noPlace) } });
  render(<IdeaPage lang="en" />);
  return screen.findByRole("heading", { level: 1, name: "Clinic queue for Kano" });
}

test("the idea page shows the public part in full and its author, and never asks for the brief", async () => {
  await view([]);
  expect(screen.getByText(/A queue on a shared tablet/)).toBeTruthy();
  expect(screen.getByText("Backend and Systems Engineer")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ama Mensah" }).getAttribute("href")).toBe("/en/people/view?username=ama-mensah");
  expect(screen.getByText("@ama-mensah")).toBeTruthy();
  expect(asked().some((path) => path.startsWith("/v1/me/ideas"))).toBe(false);
});

test("the idea's roles come with a line on the developer's own fit, and the way to verify", async () => {
  await view([role("backend-engineer")]);
  expect(screen.getByText(/Needs your role: Backend and Systems Engineer/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Verify it" }).getAttribute("href")).toBe("/en/verification");
});

test("the idea's own author is offered the composer", async () => {
  await view([role("backend-engineer", true)], {}, "ama-mensah");
  expect(screen.getByRole("link", { name: "Edit your idea" }).getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
  // the owner has their own links: no ask, and no need to read the hub's card
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(asked().some((path) => path.startsWith("/v1/hubs"))).toBe(false);
});

test("an idea with no roles says the owner has not chosen any", async () => {
  await view([], { roles_needed: [] });
  expect(screen.getByText("The owner has not said which roles are needed yet.")).toBeTruthy();
});

test.each([
  ["a closed or unknown idea", "id=idea-1", reply(404, { detail: { code: "NOT_FOUND", message: "Idea not found." } })],
  ["an address that is not an id", "id=nope", reply(422, { detail: [{ loc: ["path", "idea_id"], msg: "bad" }] })],
  ["an address with no id", "", reply(500)],
])("%s says the idea is not open and leads back", async (_name, search, answer) => {
  nav.search = search;
  api({ "/v1/me": { data: me() }, "/v1/ideas/": answer });
  render(<IdeaPage lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "This idea is not open" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open ideas" }).getAttribute("href")).toBe("/en/ideas");
});
