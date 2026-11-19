import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { loadFeed } from "./feed-api";
import { feedHref, readFilter } from "./feed-filter";
import { Feed } from "./feed";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "question",
  title: "Pooling with asyncpg",
  body: "How large should the pool be?",
  link_url: null,
  attachments: [],
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [{ slug: "python", name: "Python" }],
  like_count: 0,
  comment_count: 0,
  created_at: new Date().toISOString(),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
  ...over,
});
const page = (data: unknown[], next_offset: number | null = null) => ({ data, next_offset });
const me = (feed_topics: unknown[] = []) => ({ data: { username: "kwabena-owusu", display_name: "Kwabena Owusu", bio: null, roles: [], technologies: [], feed_topics } });

function api(own: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = { "GET /v1/me": me(), "GET /v1/feed": page([post()]), "GET /v1/posts": page([post()]), ...own };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    return Promise.resolve(reply(200, routes[match]));
  });
}

const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`);
const loaded = () => screen.findByRole("heading", { name: "Pooling with asyncpg" });
const sorts = (name = "Order") => within(screen.getByRole("navigation", { name }));
const href = (link: HTMLElement) => link.getAttribute("href");
const current = (nav: ReturnType<typeof sorts>) => nav.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "true").map((link) => link.textContent);

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
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

// ---------- the address ----------

test.each([
  ["", {}],
  ["q=pool", { q: "pool" }],
  ["q=%20%20connection%20%20pool%20", { q: "connection pool" }],
  ["q=pool&sort=newest", { q: "pool", sort: "newest" }],
  // the order a view starts with is not kept
  ["q=pool&sort=relevance", { q: "pool" }],
  ["sort=for_you", {}],
  // relevance is the best match for words, so it means nothing without them
  ["sort=relevance", {}],
  ["sort=active", { sort: "active" }],
  ["sort=sideways", {}],
  ["q=%20%20", {}],
  ["type=question&q=pool&topic=python", { type: "question", topic: "python", q: "pool" }],
])("the address ?%s means %j", (search, filter) => {
  expect(readFilter(new URLSearchParams(search))).toEqual({ type: undefined, topic: undefined, q: undefined, sort: undefined, ...filter });
});

test("search words longer than the API takes are cut to its limit", () => {
  expect(readFilter(new URLSearchParams({ q: "a".repeat(150) })).q).toBe("a".repeat(100));
});

test("an address is built from the words the request uses, and a view's own order is left out", () => {
  expect(feedHref("en", { q: "pool" })).toBe("/en/feed?q=pool");
  expect(feedHref("en", { q: "pool", sort: "relevance" })).toBe("/en/feed?q=pool");
  expect(feedHref("fr", { q: "base de données", sort: "newest" })).toBe("/fr/feed?q=base+de+donn%C3%A9es&sort=newest");
  expect(feedHref("en", { sort: "for_you" })).toBe("/en/feed");
  expect(feedHref("en", { type: "rfc", topic: "go", sort: "active" })).toBe("/en/feed?type=rfc&topic=go&sort=active");
});

// ---------- the requests ----------

test.each([
  [{}, "/v1/feed?offset=0&limit=20"],
  [{ sort: "newest" }, "/v1/feed?sort=newest&offset=0&limit=20"],
  [{ sort: "active" }, "/v1/feed?sort=active&offset=0&limit=20"],
  [{ q: "pool" }, "/v1/posts?q=pool&sort=relevance&offset=0&limit=20"],
  [{ q: "pool", sort: "newest" }, "/v1/posts?q=pool&sort=newest&offset=0&limit=20"],
  [{ q: "base de données" }, "/v1/posts?q=base+de+donn%C3%A9es&sort=relevance&offset=0&limit=20"],
  [{ type: "question" }, "/v1/posts?type=question&sort=for_you&offset=0&limit=20"],
  [{ type: "rfc", topic: "go", q: "pool", sort: "active" }, "/v1/posts?type=rfc&topic=go&q=pool&sort=active&offset=0&limit=20"],
] as const)("loading the feed for %j asks for %s", async (filter, path) => {
  fetchMock.mockResolvedValue(reply(200, page([])));
  await loadFeed(0, filter);
  expect(String(fetchMock.mock.calls[0][0])).toBe(`http://localhost:8000${path}`);
});

// ---------- the page ----------

test("the feed says how it is ordered, without a word about what it does not do", async () => {
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain("GET /v1/feed?offset=0&limit=20");
  expect(
    screen.getByText(
      "Ordered by how recent, liked and discussed each post is. Posts on your topics, or on the technologies of your profile, rank higher. It does not use what you read or click.",
    ),
  ).toBeTruthy();
  expect(current(sorts())).toEqual(["Ranked"]);
  expect(sorts().getAllByRole("link").map((link) => link.textContent)).toEqual(["Ranked", "Newest", "Most active"]);
  expect(document.body.textContent).not.toMatch(/personali[sz]ed|\bAI\b|recommend/i);
  // the topics line of the For you feed is still there: an order alone does not narrow the feed
  expect(screen.getByRole("button", { name: "Choose topics" })).toBeTruthy();
});

test("choosing an order only changes the address, and keeps the kind, the topic and the words", async () => {
  nav.search = "type=question&topic=python&q=pool";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(sorts().getAllByRole("link").map((link) => link.textContent)).toEqual(["Best match", "Newest", "Most active"]);
  expect(current(sorts())).toEqual(["Best match"]);
  expect(href(sorts().getByRole("link", { name: "Newest" }))).toBe("/en/feed?type=question&topic=python&q=pool&sort=newest");
  expect(href(sorts().getByRole("link", { name: "Best match" }))).toBe("/en/feed?type=question&topic=python&q=pool");
  expect(href(within(screen.getByRole("navigation", { name: "Kinds of post" })).getByRole("link", { name: "RFCs" }))).toBe(
    "/en/feed?type=rfc&topic=python&q=pool",
  );
});

test("an order alone is still the For you feed, with its own request and its topics line", async () => {
  nav.search = "sort=newest";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain("GET /v1/feed?sort=newest&offset=0&limit=20");
  expect(asked().some((call) => call.startsWith("GET /v1/posts"))).toBe(false);
  expect(current(sorts())).toEqual(["Newest"]);
  expect(screen.getByText("Newest first.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "For you" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("button", { name: "Choose topics" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Clear the filter" })).toBeNull();
});

test("search words ask everyone's posts for the best match and say how it was decided", async () => {
  nav.search = "q=pool";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain("GET /v1/posts?q=pool&sort=relevance&offset=0&limit=20");
  expect(asked().some((call) => call.startsWith("GET /v1/feed"))).toBe(false);
  const box = screen.getByRole("searchbox", { name: "Search posts" }) as HTMLInputElement;
  expect(box.value).toBe("pool");
  expect(box.maxLength).toBe(100);
  expect(screen.getByText(/^Best match first: words in a title count most/)).toBeTruthy();
  expect(screen.getByText("Showing: Search: “pool”. Posts from every developer.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Choose topics" })).toBeNull();
  expect(screen.getByRole("link", { name: "For you" }).getAttribute("aria-current")).toBeNull();
  expect(href(screen.getByRole("link", { name: "Clear the filter" }))).toBe("/en/feed");
});

test("the most active matches are said to be matches", async () => {
  nav.search = "q=pool&sort=active";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain("GET /v1/posts?q=pool&sort=active&offset=0&limit=20");
  expect(screen.getByText("The matching posts with the most likes and comments.")).toBeTruthy();
});

test("sending the search goes to its address and keeps the kind and the topic, but not an old order", () => {
  nav.search = "type=question&topic=python&sort=newest";
  api();
  render(<Feed lang="en" tab="for-you" />);
  const box = screen.getByRole("searchbox", { name: "Search posts" });
  fireEvent.change(box, { target: { value: "  connection   pool " } });
  fireEvent.submit(screen.getByRole("search", { name: "Search posts" }));
  expect(nav.push).toHaveBeenCalledWith("/en/feed?type=question&topic=python&q=connection+pool");
});

test("sending an empty search takes the words away, and the order they made with them", () => {
  nav.search = "q=pool&sort=newest";
  api();
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search posts" }), { target: { value: "   " } });
  fireEvent.submit(screen.getByRole("search", { name: "Search posts" }));
  expect(nav.push).toHaveBeenCalledWith("/en/feed");
});

test("the words typed but not sent stay in the box, and a new address replaces them", async () => {
  nav.search = "q=pool";
  api();
  const view = render(<Feed lang="en" tab="for-you" />);
  await loaded();
  const box = screen.getByRole("searchbox", { name: "Search posts" }) as HTMLInputElement;
  fireEvent.change(box, { target: { value: "queue" } });
  expect(box.value).toBe("queue");
  nav.search = "q=cache";
  view.rerender(<Feed lang="en" tab="for-you" />);
  await waitFor(() => expect((screen.getByRole("searchbox", { name: "Search posts" }) as HTMLInputElement).value).toBe("cache"));
});

test("a search that finds nothing says so and offers the way back", async () => {
  nav.search = "q=zzzz";
  api({ "GET /v1/posts": page([]) });
  render(<Feed lang="en" tab="for-you" />);
  expect(await screen.findByRole("heading", { name: "No post matches" })).toBeTruthy();
  expect(screen.getByText(/Check the spelling, try fewer words/)).toBeTruthy();
  expect(href(screen.getByRole("link", { name: "Clear the search" }))).toBe("/en/feed");
});

test("Saved and Yours have no search and no order", async () => {
  nav.search = "q=pool&sort=newest";
  api({ "GET /v1/me/saved-posts": page([post()]) });
  render(<Feed lang="en" tab="saved" />);
  await loaded();
  expect(asked()).toContain("GET /v1/me/saved-posts?offset=0&limit=20");
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Order" })).toBeNull();
});

test("the search and the order are in French, with their words", async () => {
  nav.search = "q=pool";
  api();
  render(<Feed lang="fr" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect(screen.getByRole("searchbox", { name: "Rechercher des publications" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Rechercher" })).toBeTruthy();
  const order = within(screen.getByRole("navigation", { name: "Ordre" }));
  expect(order.getAllByRole("link").map((link) => link.textContent)).toEqual(["Meilleure correspondance", "Plus récentes", "Plus actives"]);
  expect(screen.getByText("Publications affichées : Recherche : « pool ». Elles viennent de tous les développeurs.")).toBeTruthy();
  expect(href(order.getByRole("link", { name: "Plus récentes" }))).toBe("/fr/feed?q=pool&sort=newest");
});

test("the For you line is in French too, and says nothing about reading or clicking being used", async () => {
  api();
  render(<Feed lang="fr" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect(screen.getByText(/Ce que vous lisez ou touchez n'est pas utilisé\./)).toBeTruthy();
});
