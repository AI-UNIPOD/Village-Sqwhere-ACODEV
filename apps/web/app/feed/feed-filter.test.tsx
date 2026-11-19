import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { Feed } from "./feed";
import { PostPage } from "./post-page";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

// a made-up post, as the API answers it
const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "question",
  title: "Pooling with asyncpg",
  body: "How large should the pool be?",
  link_url: null,
  attachments: [],
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [
    { slug: "python", name: "Python" },
    { slug: "vector-databases", name: "Vector databases" },
  ],
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

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake.
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
const kinds = (name = "Kinds of post") => within(screen.getByRole("navigation", { name }));
const href = (link: HTMLElement) => link.getAttribute("href");

beforeEach(() => {
  nav.search = "";
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

// ---------- the address reaches the request ----------

test.each([
  ["type=question", "GET /v1/posts?type=question&offset=0&limit=20"],
  ["topic=vector-databases", "GET /v1/posts?topic=vector-databases&offset=0&limit=20"],
  ["type=rfc&topic=python", "GET /v1/posts?type=rfc&topic=python&offset=0&limit=20"],
  // the order in the address does not matter, and neither does the message of another screen
  ["done=deleted&topic=python&type=rfc", "GET /v1/posts?type=rfc&topic=python&offset=0&limit=20"],
])("?%s asks for everyone's posts with it, not for the For you feed", async (search, request) => {
  nav.search = search;
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain(request);
  expect(asked().some((call) => call.startsWith("GET /v1/feed"))).toBe(false);
});

test.each([["type=nonsense"], ["topic=cobol"], ["type=hub_milestone"], ["type=&topic="], ["topic=Not%20a%20slug"]])(
  "?%s is not a kind or a topic the feed knows, so the feed shows as it is",
  async (search) => {
    nav.search = search;
    api();
    render(<Feed lang="en" tab="for-you" />);
    await loaded();
    expect(asked()).toContain("GET /v1/feed?offset=0&limit=20");
    expect(asked().some((call) => call.startsWith("GET /v1/posts"))).toBe(false);
    expect(screen.queryByRole("link", { name: "Clear the filter" })).toBeNull();
    expect(kinds().getByRole("link", { name: "All kinds" }).getAttribute("aria-current")).toBe("true");
  },
);

test("a known kind is kept when the topic beside it is not known", async () => {
  nav.search = "type=question&topic=cobol";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(asked()).toContain("GET /v1/posts?type=question&offset=0&limit=20");
  expect(screen.getByText("Showing: Questions. Posts from every developer.")).toBeTruthy();
});

test("Saved and Yours take no kind or topic from the address", async () => {
  nav.search = "type=question&topic=python";
  api({ "GET /v1/me/saved-posts": page([post()]) });
  const saved = render(<Feed lang="en" tab="saved" />);
  await loaded();
  expect(asked()).toContain("GET /v1/me/saved-posts?offset=0&limit=20");
  expect(screen.queryByRole("navigation", { name: "Kinds of post" })).toBeNull();
  expect(screen.getByRole("link", { name: "Saved" }).getAttribute("aria-current")).toBe("page");
  saved.unmount();

  render(<Feed lang="en" tab="mine" />);
  await loaded();
  expect(asked()).toContain("GET /v1/posts?author=kwabena-owusu&offset=0&limit=20");
  expect(screen.queryByRole("link", { name: "Clear the filter" })).toBeNull();
});

test("Show more asks for the next page with the same kind and topic", async () => {
  nav.search = "type=question&topic=python";
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith("/v1/me")) return Promise.resolve(reply(200, me()));
    if (String(url).includes("offset=0")) return Promise.resolve(reply(200, page([post()], 20)));
    return Promise.resolve(reply(200, page([post({ id: "post-2", title: "Second question" })])));
  });
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByRole("heading", { name: "Second question" })).toBeTruthy();
  expect(asked()).toContain("GET /v1/posts?type=question&topic=python&offset=20&limit=20");
  expect(asked().some((call) => call.startsWith("GET /v1/feed"))).toBe(false);
});

// ---------- what is showing, and the way back ----------

test.each([
  ["en", "type=question", "Showing: Questions. Posts from every developer.", "Clear the filter"],
  ["en", "topic=python", "Showing: Topic: Python. Posts from every developer.", "Clear the filter"],
  ["en", "type=general&topic=vector-databases", "Showing: General, Topic: Vector Databases. Posts from every developer.", "Clear the filter"],
  ["fr", "type=code_review_request", "Publications affichées : Demandes de revue de code. Elles viennent de tous les développeurs.", "Retirer le filtre"],
  [
    "fr",
    "type=rfc&topic=vector-databases",
    "Publications affichées : RFC, Sujet : Bases de données vectorielles. Elles viennent de tous les développeurs.",
    "Retirer le filtre",
  ],
] as const)("in %s, ?%s says what is showing, with one link that clears it", async (lang, search, sentence, clear) => {
  nav.search = search;
  api();
  render(<Feed lang={lang} tab="for-you" />);
  await loaded();
  const links = screen.getAllByRole("link", { name: clear });
  expect(links).toHaveLength(1);
  expect(href(links[0])).toBe(`/${lang}/feed`);
  // the line beside the link, read as it is written: French keeps its narrow spaces
  const line = links[0].parentElement!.querySelector("p")!;
  expect(line.textContent).toBe(sentence);
  expect(line.getAttribute("role")).toBe("status");
});

test("without the parameters the line and the clear link are gone, and the For you feed is asked for again", async () => {
  nav.search = "type=question";
  api({ "GET /v1/posts": page([post({ title: "A question" })]) });
  const filtered = render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "A question" });
  expect(screen.getByRole("link", { name: "Clear the filter" })).toBeTruthy();
  // narrowed to a kind, the list is not the For you page
  expect(screen.getByRole("link", { name: "For you" }).hasAttribute("aria-current")).toBe(false);
  expect(href(screen.getByRole("link", { name: "For you" }))).toBe("/en/feed");

  // what the clear link opens: the same page with no parameters
  nav.search = "";
  filtered.rerender(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(screen.queryByRole("heading", { name: "A question" })).toBeNull();
  expect(asked()).toContain("GET /v1/feed?offset=0&limit=20");
  expect(screen.queryByText(/^Showing:/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Clear the filter" })).toBeNull();
  expect(screen.getByRole("link", { name: "For you" }).getAttribute("aria-current")).toBe("page");
});

test("the language link keeps the kind and the topic", async () => {
  nav.search = "type=question&topic=python";
  api();
  const { container } = render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(container.querySelector('a[hreflang="fr"]')?.getAttribute("href")).toBe("/fr/feed?type=question&topic=python");
});

// ---------- choosing a kind ----------

test("every kind a person can post is a link above the list, and the one showing is marked", async () => {
  nav.search = "type=rfc";
  api();
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(
    kinds()
      .getAllByRole("link")
      .map((link) => [link.textContent, href(link), link.getAttribute("aria-current")]),
  ).toEqual([
    ["All kinds", "/en/feed", null],
    ["General", "/en/feed?type=general", null],
    ["Questions", "/en/feed?type=question", null],
    ["Architecture challenges", "/en/feed?type=architecture_challenge", null],
    ["Code review requests", "/en/feed?type=code_review_request", null],
    ["Open source releases", "/en/feed?type=oss_release", null],
    ["RFCs", "/en/feed?type=rfc", "true"],
    ["Research notes", "/en/feed?type=research_note", null],
  ]);
});

test("the kinds are there before any filter, in French, and choosing one keeps the topic", async () => {
  api();
  const plain = render(<Feed lang="fr" tab="for-you" />);
  await loaded();
  const row = kinds("Types de publication");
  expect(row.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Tous les types",
    "Général",
    "Questions",
    "Défis d'architecture",
    "Demandes de revue de code",
    "Versions open source",
    "RFC",
    "Notes de recherche",
  ]);
  expect(row.getByRole("link", { name: "Tous les types" }).getAttribute("aria-current")).toBe("true");
  expect(href(row.getByRole("link", { name: "Questions" }))).toBe("/fr/feed?type=question");
  plain.unmount();

  nav.search = "topic=python";
  render(<Feed lang="fr" tab="for-you" />);
  await loaded();
  expect(href(kinds("Types de publication").getByRole("link", { name: "Questions" }))).toBe("/fr/feed?type=question&topic=python");
  expect(href(kinds("Types de publication").getByRole("link", { name: "Tous les types" }))).toBe("/fr/feed?topic=python");
});

// ---------- no posts ----------

test.each([
  ["en", "No posts here yet", "Nobody has shared a post that matches this filter. Clear the filter to see the rest of the feed.", "Clear the filter"],
  [
    "fr",
    "Aucune publication ici pour l'instant",
    "Personne n'a encore partagé de publication qui correspond à ce filtre. Retirez le filtre pour voir le reste du fil.",
    "Retirer le filtre",
  ],
] as const)("in %s, a kind and topic with no posts say so, with the way back", async (lang, title, text, clear) => {
  nav.search = "type=research_note&topic=rust";
  api({ "GET /v1/posts": page([]) });
  render(<Feed lang={lang} tab="for-you" />);
  const heading = await screen.findByRole("heading", { name: title });
  const empty = within(heading.parentElement!);
  expect(empty.getByText(text)).toBeTruthy();
  expect(href(empty.getByRole("link", { name: clear }))).toBe(`/${lang}/feed`);
  // not the words of a feed nobody has posted in
  expect(screen.queryByText(lang === "en" ? "Nobody has posted yet" : "Personne n'a encore publié")).toBeNull();
});

// ---------- nothing is saved ----------

test("a filtered view sends no change, and leaves the saved topics and their choice alone", async () => {
  nav.search = "topic=python";
  api({ "GET /v1/me": me([{ slug: "go", name: "Go" }]) });
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  // the profile has answered: the saved topics are known, and still their line is not offered
  await waitFor(() => expect(asked()).toContain("GET /v1/me"));
  await screen.findByText("Showing: Topic: Python. Posts from every developer.");
  expect(screen.queryByRole("button", { name: /topics/ })).toBeNull();
  expect(screen.queryByText(/Showing posts about Go/)).toBeNull();
  expect(asked().every((call) => call.startsWith("GET "))).toBe(true);
  expect(asked().some((call) => call.includes("/v1/me/feed-topics"))).toBe(false);
});

test("with no filter the saved topics keep their line and their choice", async () => {
  api({ "GET /v1/me": me([{ slug: "go", name: "Go" }]) });
  render(<Feed lang="en" tab="for-you" />);
  await loaded();
  expect(await screen.findByText("Showing posts about Go. Your own posts always show too.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Change topics" })).toBeTruthy();
});

// ---------- the links on a post ----------

test.each([
  ["en", "Question: see posts of this kind", "Python: see posts on this topic", "Vector Databases: see posts on this topic"],
  [
    "fr",
    "Question : voir les publications de ce type",
    "Python : voir les publications sur ce sujet",
    "Bases de données vectorielles : voir les publications sur ce sujet",
  ],
] as const)("in %s, a card's kind and each of its topics are links to the feed narrowed to them", async (lang, kind, python, vectors) => {
  api();
  render(<Feed lang={lang} tab="for-you" />);
  const card = within((await loaded()).closest("li")!);
  const pill = card.getByRole("link", { name: kind });
  expect(pill.textContent).toBe("Question");
  expect(href(pill)).toBe(`/${lang}/feed?type=question`);
  expect(href(card.getByRole("link", { name: python }))).toBe(`/${lang}/feed?topic=python`);
  expect(card.getByRole("link", { name: vectors }).textContent).toBe(lang === "en" ? "Vector Databases" : "Bases de données vectorielles");
  expect(href(card.getByRole("link", { name: vectors }))).toBe(`/${lang}/feed?topic=vector-databases`);
});

test("a hub's milestone keeps its kind as text, and so does a topic the app has no name for", async () => {
  api({ "GET /v1/feed": page([post({ type: "hub_milestone", topics: [{ slug: "cobol", name: "COBOL" }] })]) });
  render(<Feed lang="en" tab="for-you" />);
  const card = within((await loaded()).closest("li")!);
  expect(card.getByText("Hub milestone").closest("a")).toBeNull();
  expect(card.getByText("COBOL").closest("a")).toBeNull();
});

test("on a post's own page the kind and the topics lead back to the narrowed feed", async () => {
  nav.search = "id=post-1";
  api({ "GET /v1/posts/post-1": { data: post() }, "GET /v1/posts/post-1/comments": page([]) });
  render(<PostPage lang="en" />);
  await loaded();
  expect(href(screen.getByRole("link", { name: "Question: see posts of this kind" }))).toBe("/en/feed?type=question");
  expect(href(screen.getByRole("link", { name: "Python: see posts on this topic" }))).toBe("/en/feed?topic=python");
});
