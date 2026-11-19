import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe, keepMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { IdeaComposer } from "./composer";
import { MyIdeas } from "./my-ideas";

const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { push, replace, router: { push, replace }, search: "" };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

// a made-up idea, as the API answers it
const idea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Offline farm ledger",
  summary: "A shared ledger that works offline for farming co-operatives in Kano.",
  details: "Start with two co-operatives.",
  stage: "concept",
  status: "draft",
  roles_needed: [],
  published_at: null,
  updated_at: "2026-11-12T10:00:00Z",
  ...over,
});

const deletes = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => String(url).replace("http://localhost:8000", ""));

// opens the composer on a saved idea, then answers the delete with `answer`
async function open(answer: Response, over: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=idea-1";
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(init?.method === "DELETE" ? answer.clone() : reply(200, { data: idea(over) })),
  );
  render(<IdeaComposer lang={lang} />);
  await screen.findByLabelText(lang === "en" ? "Title" : "Titre");
}

const confirm = () => {
  fireEvent.click(screen.getByRole("button", { name: "Delete this idea" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this idea?" })).getByRole("button", { name: "Delete the idea" }));
};

beforeEach(() => {
  keepMe({ username: "aminata-n", display_name: "Aminata Ndiaye", bio: null, country_code: null, roles: [], technologies: [], feed_topics: [], sectors: [] });
  nav.search = "";
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  forgetMe();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("a new idea has nothing to delete", async () => {
  render(<IdeaComposer lang="en" />);
  await screen.findByLabelText("Title");
  expect(screen.queryByRole("heading", { name: "Delete the idea" })).toBeNull();
});

test("deleting asks first, then goes back to your ideas, which say it was deleted", async () => {
  await open(reply(204));
  fireEvent.click(screen.getByRole("button", { name: "Delete this idea" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this idea?" })).getByRole("button", { name: "Keep it" }));
  expect(deletes()).toEqual([]);
  confirm();
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/ideas/mine?done=deleted"));
  expect(deletes()).toEqual(["/v1/me/ideas/idea-1"]);

  cleanup();
  nav.search = "done=deleted";
  fetchMock.mockResolvedValue(reply(200, { data: [], next_offset: null }));
  render(<MyIdeas lang="en" />);
  expect((await screen.findByText("Your idea was deleted.")).closest("[role=status]")).toBeTruthy();
});

test("a closed idea can still be deleted", async () => {
  await open(reply(204), { status: "closed" });
  confirm();
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/ideas/mine?done=deleted"));
});

test("an idea with a hub is refused, says to close it instead, and the button goes", async () => {
  await open(refusal(409, "IDEA_HAS_HUB"), { status: "open" });
  confirm();
  expect((await screen.findByText(/can't be deleted\. Close it instead\./)).getAttribute("role")).toBe("alert");
  expect(screen.queryByRole("button", { name: "Delete this idea" })).toBeNull();
  expect(nav.push).not.toHaveBeenCalled();
});

test("an idea already deleted elsewhere goes back to your ideas", async () => {
  await open(refusal(404, "NOT_FOUND"));
  confirm();
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/ideas/mine?done=deleted"));
});

test("a failed delete says so and keeps the idea", async () => {
  await open(reply(500));
  confirm();
  expect(await screen.findByText("We couldn't delete the idea. Nothing changed, so try again.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete this idea" })).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();
});

test("the demo's refused delete says nothing was saved as a status, with no alert, and keeps the idea", async () => {
  await open(refusal(403, "DEMO_READ_ONLY"));
  confirm();
  expect((await screen.findByText("Nothing was saved. The demo cannot be changed.")).getAttribute("role")).toBe("status");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Delete this idea" })).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();
});

test("deleting speaks French", async () => {
  await open(reply(204), {}, "fr");
  expect(screen.getByRole("heading", { name: "Supprimer l'idée" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Supprimer cette idée" })).toBeTruthy();
});
