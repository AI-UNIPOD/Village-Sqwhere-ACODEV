import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe, keepMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { IdeaComposer } from "./composer";
import { copy } from "./copy";
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
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

// a made-up idea, as the API answers it
const idea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Offline farm ledger",
  summary: "A shared ledger that works offline for farming co-operatives in Kano.",
  details: "Start with two co-operatives.",
  stage: "concept",
  status: "draft",
  roles_needed: [{ slug: "backend-engineer", name: "Backend & Systems Engineer" }],
  published_at: null,
  updated_at: "2026-11-12T10:00:00Z",
  ...over,
});

// what the API received after the page's own loading: method, path and parsed body
const sent = () =>
  fetchMock.mock.calls
    .map(([url, init]) => [init?.method ?? "GET", String(url).replace("http://localhost:8000", ""), init?.body && JSON.parse(init.body)])
    .filter(([method]) => method !== "GET");

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const SUMMARY = "A shared ledger that works offline for co-operatives.";

beforeEach(() => {
  // the frame already knows who is signed in, as it does after the first screen of a visit
  keepMe({ username: "aminata-n", display_name: "Aminata Ndiaye", bio: null, roles: [], technologies: [], feed_topics: [] });
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

// ---------- your ideas ----------

test("with no ideas, the page says how to start and offers one way in", async () => {
  fetchMock.mockResolvedValue(reply(200, { data: [], next_offset: null }));
  render(<MyIdeas lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "No ideas yet" })).toBeTruthy();
  const links = screen.getAllByRole("link", { name: "Share an idea" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/en/ideas/compose");
});

test("each idea shows its state, its roles in the page's language and a way to open it", async () => {
  fetchMock.mockResolvedValue(
    reply(200, { data: [idea(), idea({ id: "idea-2", title: "Clinic queue", status: "open" })], next_offset: null }),
  );
  render(<MyIdeas lang="fr" />);
  const draft = (await screen.findByRole("link", { name: "Offline farm ledger" })).closest("li")!;
  expect(within(draft).getByText("Brouillon")).toBeTruthy();
  expect(within(draft).getByText("Ingénieur backend et systèmes")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Offline farm ledger" }).getAttribute("href")).toBe("/fr/ideas/compose?id=idea-1");
  expect(within(screen.getByRole("link", { name: "Clinic queue" }).closest("li")!).getByText("Ouverte")).toBeTruthy();
});

test("after publishing, the list says the idea is open", async () => {
  nav.search = "done=published";
  fetchMock.mockResolvedValue(reply(200, { data: [idea({ status: "open" })], next_offset: null }));
  render(<MyIdeas lang="en" />);
  await screen.findByRole("link", { name: "Offline farm ledger" });
  expect(screen.getByText("Your idea is open. Signed-in developers can now find it.")).toBeTruthy();
});

test("Show more adds the next page under the first", async () => {
  // answered by address: the page also asks for the developer's hubs
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes("offset=20")
        ? reply(200, { data: [idea({ id: "idea-2", title: "Clinic queue" })], next_offset: null })
        : reply(200, { data: [idea()], next_offset: String(url).includes("/v1/me/ideas") ? 20 : null }),
    ),
  );
  render(<MyIdeas lang="en" />);
  await screen.findByRole("link", { name: "Offline farm ledger" });
  press("Show more");
  expect(await screen.findByRole("link", { name: "Clinic queue" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Offline farm ledger" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

// ---------- the composer ----------

test("an empty idea is not sent: the form says what is missing", async () => {
  render(<IdeaComposer lang="en" />);
  press("Save draft");
  expect(screen.getByText("Give the title at least 5 characters.")).toBeTruthy();
  expect(screen.getByText("Write at least 20 characters, so developers know what the idea is.")).toBeTruthy();
  expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
  expect(fetchMock).not.toHaveBeenCalled();

  // an error leaves as soon as its field is fixed
  type("Title", "Offline farm ledger");
  expect(screen.queryByText("Give the title at least 5 characters.")).toBeNull();
});

test("a new idea is saved as a draft, then the page reopens on the idea's own address", async () => {
  fetchMock.mockResolvedValue(reply(201, { data: idea({ id: "new-id", details: null, roles_needed: [] }) }));
  render(<IdeaComposer lang="en" />);
  type("Title", "  Offline farm ledger ");
  type("Public summary", SUMMARY);
  fireEvent.click(screen.getByRole("radio", { name: /Prototype/ }));
  press("Mobile Engineer");
  press("Save draft");
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/ideas/compose?id=new-id&saved=1"));
  expect(sent()).toEqual([
    ["POST", "/v1/me/ideas", { title: "Offline farm ledger", summary: SUMMARY, details: null, stage: "prototype", roles_needed: ["mobile-engineer"] }],
  ]);
});

test("saving an existing idea sends only what changed", async () => {
  nav.search = "id=idea-1";
  fetchMock.mockResolvedValueOnce(reply(200, { data: idea() })).mockResolvedValueOnce(reply(200, { data: idea({ summary: SUMMARY }) }));
  render(<IdeaComposer lang="en" />);
  expect(((await screen.findByLabelText("Title")) as HTMLInputElement).value).toBe("Offline farm ledger");
  expect((screen.getByLabelText("Private brief (optional)") as HTMLTextAreaElement).value).toBe("Start with two co-operatives.");
  type("Public summary", SUMMARY);
  press("Save draft");
  expect(await screen.findByText("Saved")).toBeTruthy();
  expect(sent()).toEqual([["PATCH", "/v1/me/ideas/idea-1", { summary: SUMMARY }]]);
});

test("publishing asks first, warns when no role is chosen, then opens the idea", async () => {
  nav.search = "id=idea-1";
  fetchMock
    .mockResolvedValueOnce(reply(200, { data: idea({ roles_needed: [] }) }))
    .mockResolvedValueOnce(reply(200, { data: idea({ roles_needed: [], status: "open" }) }));
  render(<IdeaComposer lang="en" />);
  await screen.findByLabelText("Title");
  press("Publish");
  const dialog = screen.getByRole("dialog", { name: "Publish this idea?" });
  expect(within(dialog).getByText(/The private brief stays private/)).toBeTruthy();
  expect(within(dialog).getByText(/the matcher cannot suggest anyone yet/)).toBeTruthy();
  expect(sent()).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Publish the idea" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/ideas/mine?done=published"));
  expect(sent()).toEqual([["POST", "/v1/me/ideas/idea-1/publish", undefined]]);
});

test("an open idea can be changed or closed, and closing asks first", async () => {
  nav.search = "id=idea-1";
  fetchMock
    .mockResolvedValueOnce(reply(200, { data: idea({ status: "open" }) }))
    .mockResolvedValueOnce(reply(200, { data: idea({ status: "closed" }) }));
  render(<IdeaComposer lang="en" />);
  await screen.findByLabelText("Title");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();

  press("Close this idea");
  const dialog = screen.getByRole("dialog", { name: "Close this idea?" });
  expect(within(dialog).getByText(/cannot be opened again/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close the idea" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/ideas/mine?done=closed"));
  expect(sent()).toEqual([["POST", "/v1/me/ideas/idea-1/close", undefined]]);
});

test("a closed idea can be read but not changed", async () => {
  nav.search = "id=idea-1";
  fetchMock.mockResolvedValue(reply(200, { data: idea({ status: "closed" }) }));
  render(<IdeaComposer lang="fr" />);
  expect(await screen.findByText("Cette idée est fermée. Elle ne peut plus être modifiée ni rouverte.")).toBeTruthy();
  expect((screen.getByLabelText("Titre") as HTMLInputElement).closest("fieldset")!.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Enregistrer les modifications" })).toBeNull();
});

test("an idea that is not there, or not yours, says so and leads back", async () => {
  nav.search = "id=someone-elses";
  fetchMock.mockResolvedValue(reply(404, { detail: { code: "NOT_FOUND", message: "Idea not found." } }));
  render(<IdeaComposer lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this idea" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");
});

test("a failed save says so and keeps every word", async () => {
  fetchMock.mockResolvedValue(reply(500, { detail: "boom" }));
  render(<IdeaComposer lang="en" />);
  type("Title", "Offline farm ledger");
  type("Public summary", SUMMARY);
  press("Save draft");
  expect(await screen.findByText(/We couldn't save your idea. Your text is still here/)).toBeTruthy();
  expect((screen.getByLabelText("Public summary") as HTMLTextAreaElement).value).toBe(SUMMARY);
  expect(nav.replace).not.toHaveBeenCalled();
});

test("a role the API no longer offers is reported on the roles field", async () => {
  fetchMock.mockResolvedValue(reply(422, { detail: { code: "UNKNOWN_ROLE", message: "Unknown role." } }));
  render(<IdeaComposer lang="en" />);
  type("Title", "Offline farm ledger");
  type("Public summary", SUMMARY);
  press("Save draft");
  expect(await screen.findByText("One of these roles is no longer offered. Untick it and save again.")).toBeTruthy();
});

// ---------- copy ----------

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
