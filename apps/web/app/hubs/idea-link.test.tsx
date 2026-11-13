import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MyIdeas } from "../ideas/my-ideas";
import { SESSION_KEY } from "../session/session";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const idea = (id: string, title: string, status: string) => ({
  id,
  title,
  summary: "A made-up idea for the test, long enough to be a summary.",
  stage: "concept",
  status,
  roles_needed: [],
  published_at: null,
  updated_at: "2026-11-12T10:00:00Z",
});

const ideas = [idea("idea-1", "Borehole map", "open"), idea("idea-2", "Clinic queue", "open"), idea("idea-3", "Fare tracker", "draft")];

// The developer's ideas, and their hubs as `hubs` answers.
function signedIn(hubs: Response) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(String(url).includes("/v1/me/hubs") ? hubs.clone() : reply(200, { data: ideas, next_offset: null })),
  );
}

const card = (title: string) => within(screen.getByRole("link", { name: title }).closest("li")!);

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

test("an open idea leads to its hub: the one it has, or the form that creates it", async () => {
  signedIn(reply(200, { data: [{ id: "hub-9", idea: { id: "idea-1" } }], next_offset: null }));
  render(<MyIdeas lang="en" />);
  await screen.findByRole("link", { name: "Borehole map" });
  expect((await card("Borehole map").findByRole("link", { name: "Open the hub" })).getAttribute("href")).toBe("/en/hubs/view?id=hub-9");
  expect(card("Clinic queue").getByRole("link", { name: "Create the hub" }).getAttribute("href")).toBe("/en/hubs/new?idea=idea-2");
  // a draft has no hub to create yet
  expect(card("Fare tracker").queryByRole("link", { name: /hub/ })).toBeNull();
});

test("when the hubs cannot be loaded, the ideas still show, without a hub link", async () => {
  signedIn(reply(500));
  render(<MyIdeas lang="fr" />);
  expect(await screen.findByRole("link", { name: "Borehole map" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /espace/ })).toBeNull();
});
