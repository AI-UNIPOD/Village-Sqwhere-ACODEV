import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { Feed } from "./feed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const topic = (slug: string, name: string) => ({ slug, name });
const react = topic("react", "React");
const vue = topic("vue", "Vue");
const go = topic("go", "Go");
const python = topic("python", "Python");
const llms = topic("llms", "LLMs");

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.",
  link_url: null,
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [],
  like_count: 0,
  comment_count: 0,
  created_at: new Date().toISOString(),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
  ...over,
});
const page = (data: unknown[]) => ({ data, next_offset: null });

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake.
function api(feedTopics: unknown[], own: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    "GET /v1/me": { data: { username: "kwabena-owusu", display_name: "Kwabena", bio: null, roles: [], technologies: [], feed_topics: feedTopics } },
    "GET /v1/feed": page([post()]),
    "GET /v1/me/saved-posts": page([]),
    "GET /v1/posts": page([]),
    ...own,
  };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const answer = routes[match];
    return Promise.resolve(answer instanceof Response ? answer.clone() : reply(200, answer));
  });
}

const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`);
const toggle = (name: string) => screen.getByRole("button", { name });
const panel = () => document.getElementById("feed-topics")!;
const chip = (name: string) => within(panel()).getByRole("button", { name });

beforeEach(() => {
  forgetMe();
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

// ---------- the line ----------

test.each([
  [[], "Showing every post", "Choose topics"],
  [[go], "Showing posts about Go. Your own posts always show too.", "Change topics"],
  // in the order of the list, not the order the API sent them
  [[python, go], "Showing posts about Go and Python. Your own posts always show too.", "Change topics"],
  [[python, react, go], "Showing posts about React, Go and Python. Your own posts always show too.", "Change topics"],
  [[python, react, go, vue], "Showing posts about React, Vue and 2 more. Your own posts always show too.", "Change topics"],
  [[python, react, go, vue, llms], "Showing posts about React, Vue and 3 more. Your own posts always show too.", "Change topics"],
])("the line for %j in English", async (held, sentence, action) => {
  api(held);
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect((await screen.findByText(sentence)).textContent).toBe(sentence);
  expect(toggle(action)).toBeTruthy();
});

test.each([
  [[], "Toutes les publications sont affichées", "Choisir des sujets"],
  [[go], "Publications affichées sur Go. Vos propres publications s'affichent toujours.", "Changer les sujets"],
  [[python, go], "Publications affichées sur Go et Python. Vos propres publications s'affichent toujours.", "Changer les sujets"],
  [[react, go, python], "Publications affichées sur React, Go et Python. Vos propres publications s'affichent toujours.", "Changer les sujets"],
  [[react, vue, go, python], "Publications affichées sur React, Vue et 2 autres. Vos propres publications s'affichent toujours.", "Changer les sujets"],
])("the line for %j in French", async (held, sentence, action) => {
  api(held);
  render(<Feed lang="fr" tab="for-you" />);
  expect(await screen.findByText(sentence)).toBeTruthy();
  expect(toggle(action)).toBeTruthy();
});

test("a topic is named in the page's language", async () => {
  api([llms]);
  render(<Feed lang="fr" tab="for-you" />);
  expect(await screen.findByText(/Publications affichées sur LLM\./)).toBeTruthy();
});

test("only For you has the line", async () => {
  for (const tab of ["saved", "mine"] as const) {
    api([go]);
    const view = render(<Feed lang="en" tab={tab} />);
    await waitFor(() => expect(asked()).toContain("GET /v1/me"));
    await waitFor(() => expect(screen.getByRole("link", { name: "Write a post" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Change topics" })).toBeNull();
    expect(document.getElementById("feed-topics")).toBeNull();
    view.unmount();
    forgetMe();
    fetchMock.mockReset();
  }
});

// ---------- opening, choosing, saving ----------

test("the button opens the choice in place, with the topics now held already chosen, and focus goes in", async () => {
  api([go]);
  render(<Feed lang="en" tab="for-you" />);
  const button = await screen.findByRole("button", { name: "Change topics" });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(button.getAttribute("aria-controls")).toBe("feed-topics");
  expect(panel().hidden).toBe(true);
  // closed, its chips are not offered
  expect(screen.queryByRole("group", { name: "Topics for your feed" })).toBeNull();

  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(panel().hidden).toBe(false);
  expect(screen.getByRole("group", { name: "Topics for your feed" })).toBeTruthy();
  expect(chip("Go").getAttribute("aria-pressed")).toBe("true");
  expect(chip("Python").getAttribute("aria-pressed")).toBe("false");
  await waitFor(() => expect(document.activeElement).toBe(within(panel()).getAllByRole("button")[0]));
  // the page's one main button is still the way to write
  expect(screen.getByRole("link", { name: "Write a post" }).className).toMatch(/btn/);
  expect(within(panel()).getByRole("button", { name: "Save" }).className).toMatch(/ghost/);
});

test("saving sends every chosen slug under the key technologies, keeps the answer, closes and loads the feed again", async () => {
  api([], { "PUT /v1/me/feed-topics": { data: [go, python] } });
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect(await screen.findByText("Showing every post")).toBeTruthy();
  const button = toggle("Choose topics");
  fireEvent.click(button);
  fireEvent.click(chip("Python"));
  fireEvent.click(chip("Go"));
  fireEvent.click(within(panel()).getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Showing posts about Go and Python. Your own posts always show too.")).toBeTruthy();
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(String(put[0])).toMatch(/\/v1\/me\/feed-topics$/);
  expect(JSON.parse(String(put[1].body))).toEqual({ technologies: ["go", "python"] });
  expect(panel().hidden).toBe(true);
  expect(screen.getByRole("button", { name: "Change topics" }).getAttribute("aria-expanded")).toBe("false");
  // focus comes back to the button that opened it
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change topics" })));
  // the feed loads again from the top
  await waitFor(() => expect(asked().filter((call) => call === "GET /v1/feed?offset=0&limit=20")).toHaveLength(2));
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
});

test("choosing nothing and saving shows every post", async () => {
  api([go], { "PUT /v1/me/feed-topics": { data: [] } });
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Change topics" }));
  fireEvent.click(chip("Go"));
  fireEvent.click(within(panel()).getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Showing every post")).toBeTruthy();
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(JSON.parse(String(put[1].body))).toEqual({ technologies: [] });
  expect(screen.getByRole("button", { name: "Choose topics" })).toBeTruthy();
});

test("Cancel closes it, throws the choice away, sends nothing and gives focus back", async () => {
  api([go]);
  render(<Feed lang="en" tab="for-you" />);
  const button = await screen.findByRole("button", { name: "Change topics" });
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  fireEvent.click(button);
  fireEvent.click(chip("Python"));
  fireEvent.click(within(panel()).getByRole("button", { name: "Cancel" }));
  expect(panel().hidden).toBe(true);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => expect(document.activeElement).toBe(button));
  expect(asked().some((call) => call.startsWith("PUT"))).toBe(false);
  expect(asked().filter((call) => call.startsWith("GET /v1/feed"))).toHaveLength(1);
  // reopening starts from what is held, not from the abandoned choice
  fireEvent.click(button);
  expect(chip("Python").getAttribute("aria-pressed")).toBe("false");
  expect(chip("Go").getAttribute("aria-pressed")).toBe("true");
});

test("Escape closes it and gives focus back", async () => {
  api([]);
  render(<Feed lang="en" tab="for-you" />);
  const button = await screen.findByRole("button", { name: "Choose topics" });
  fireEvent.click(button);
  fireEvent.keyDown(chip("Go"), { key: "Escape" });
  expect(panel().hidden).toBe(true);
  await waitFor(() => expect(document.activeElement).toBe(button));
});

test("the button closes it again", async () => {
  api([]);
  render(<Feed lang="en" tab="for-you" />);
  const button = await screen.findByRole("button", { name: "Choose topics" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(panel().hidden).toBe(true);
});

test("a failed save keeps the choice open, says so, and leaves the feed and the line alone", async () => {
  api([go], { "PUT /v1/me/feed-topics": reply(500) });
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Change topics" }));
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  fireEvent.click(chip("Python"));
  fireEvent.click(within(panel()).getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't save your topics. Nothing was changed, so try again.");
  expect(panel().hidden).toBe(false);
  expect(chip("Python").getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Showing posts about Go. Your own posts always show too.")).toBeTruthy();
  expect(asked().filter((call) => call.startsWith("GET /v1/feed"))).toHaveLength(1);

  // and trying again can work
  api([go], { "PUT /v1/me/feed-topics": { data: [go, python] } });
  fireEvent.click(within(panel()).getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Showing posts about Go and Python. Your own posts always show too.")).toBeTruthy();
});

test("Save pressed twice while it is sending sends one request", async () => {
  let release: (response: Response) => void = () => {};
  api([]);
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "PUT" ? new Promise<Response>((resolve) => (release = resolve)) : base(url, init),
  );
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Choose topics" }));
  fireEvent.click(chip("Go"));
  const save = within(panel()).getByRole("button", { name: "Save" });
  fireEvent.click(save);
  await waitFor(() => expect(asked().filter((call) => call.startsWith("PUT"))).toHaveLength(1));
  fireEvent.click(save);
  expect(save.getAttribute("aria-busy")).toBe("true");
  release(reply(200, { data: [go] }));
  await screen.findByText(/Showing posts about Go/);
  expect(asked().filter((call) => call.startsWith("PUT"))).toHaveLength(1);
});

test("the choice is in French too", async () => {
  api([]);
  render(<Feed lang="fr" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Choisir des sujets" }));
  expect(screen.getByRole("group", { name: "Sujets de votre fil" })).toBeTruthy();
  expect(screen.getByText("Choisissez les sujets que vous voulez voir. Enregistrez sans rien choisir pour tout voir.")).toBeTruthy();
  expect(within(panel()).getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  expect(within(panel()).getByRole("button", { name: "Annuler" })).toBeTruthy();
  expect(chip("Vision par ordinateur")).toBeTruthy();
});
