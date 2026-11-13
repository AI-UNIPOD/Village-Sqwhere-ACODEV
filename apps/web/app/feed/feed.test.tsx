import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { Feed } from "./feed";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
// a 204 has no body; PUT /like and PUT /save answer 200 with their new state
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });

// a made-up post, as the API answers it
const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.\nLatency halved.",
  link_url: null,
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [],
  like_count: 2,
  comment_count: 3,
  created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
  ...over,
});
const page = (data: unknown[], next_offset: number | null = null) => ({ data, next_offset });

const me = { username: "kwabena-owusu", display_name: "Kwabena Owusu", bio: null, roles: [], technologies: [] };

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake. Every
// tab asks for the profile.
function api(own: Record<string, unknown>) {
  const routes: Record<string, unknown> = { "GET /v1/me": { data: me }, ...own };
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
const card = (title: string) => screen.getByRole("heading", { name: title }).closest("li")!;

// A request that stays out until the test lets it answer.
function held() {
  let release: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => (release = resolve));
  return { response, release };
}

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

// ---------- the three tabs ----------

test("For you shows the feed, and the tabs lead to the other two", async () => {
  api({ "GET /v1/feed": page([post()]) });
  render(<Feed lang="en" tab="for-you" />);
  expect(await screen.findByRole("heading", { name: "Pooling with asyncpg" })).toBeTruthy();
  expect(asked()).toContain("GET /v1/feed?offset=0&limit=20");
  // the places bar needs the profile to know whether to offer Reviews
  expect(asked()).toContain("GET /v1/me");
  const tabs = within(screen.getByRole("navigation", { name: "Feed pages" }));
  expect(tabs.getByRole("link", { name: "For you" }).getAttribute("aria-current")).toBe("page");
  expect(tabs.getByRole("link", { name: "Saved" }).getAttribute("href")).toBe("/en/feed/saved");
  expect(tabs.getByRole("link", { name: "Yours" }).getAttribute("href")).toBe("/en/feed/mine");
});

test("Saved asks for the saved posts", async () => {
  api({ "GET /v1/me/saved-posts": page([post({ saved_by_me: true })]) });
  render(<Feed lang="en" tab="saved" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect(asked()).toContain("GET /v1/me/saved-posts?offset=0&limit=20");
  expect(screen.getByRole("link", { name: "Saved" }).getAttribute("aria-current")).toBe("page");
});

test("Yours asks for the posts whose author is you, once it knows your username", async () => {
  api({ "GET /v1/posts": page([post()]) });
  render(<Feed lang="en" tab="mine" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  expect(asked()).toContain("GET /v1/posts?author=kwabena-owusu&offset=0&limit=20");
  expect(asked().indexOf("GET /v1/me")).toBeLessThan(asked().indexOf("GET /v1/posts?author=kwabena-owusu&offset=0&limit=20"));
});

// ---------- a card ----------

test("a card shows who wrote it, when, its title, its body with line breaks, its link and its topics", async () => {
  api({
    "GET /v1/feed": page([
      post({
        type: "rfc",
        link_url: "https://github.com/example-org/rfcs/pull/12",
        topics: [
          { slug: "python", name: "Python" },
          { slug: "vector-databases", name: "Vector databases" },
        ],
      }),
    ]),
  });
  render(<Feed lang="fr" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  const shown = card("Pooling with asyncpg");
  expect(within(shown).getByText("Wanjiru Kamau")).toBeTruthy();
  expect(within(shown).getByText("il y a 3 heures")).toBeTruthy();
  expect(within(shown).getByText("RFC")).toBeTruthy();
  expect(shown.textContent).toContain("We moved to a pool of ten.\nLatency halved.");
  const link = within(shown).getByRole("link", { name: /github\.com/ });
  expect(link.getAttribute("href")).toBe("https://github.com/example-org/rfcs/pull/12");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.textContent).toContain("s'ouvre dans un nouvel onglet");
  expect(within(shown).getByText("Python")).toBeTruthy();
  expect(within(shown).getByText("Bases de données vectorielles")).toBeTruthy();
});

test("a plain post with no title, link or topics shows only its text, and no type", async () => {
  api({ "GET /v1/feed": page([post({ title: null, body: "Cache the dependency layer first." })]) });
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByText("Cache the dependency layer first.");
  const shown = screen.getByText("Cache the dependency layer first.").closest("li")!;
  expect(within(shown).queryByRole("heading")).toBeNull();
  // the author is the only link
  expect(within(shown).getAllByRole("link").length).toBe(1);
  expect(shown.querySelector("ul")).toBeNull();
  expect(shown.querySelectorAll("[data-state]").length).toBe(0);
});

test("a post's words are text, never markup", async () => {
  api({ "GET /v1/feed": page([post({ title: "<b>Bold</b> title", body: "<img src=x onerror=alert(1)> [a link](http://example.com)" })]) });
  const { container } = render(<Feed lang="en" tab="for-you" />);
  await screen.findByText("<b>Bold</b> title");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("li b")).toBeNull();
  expect(screen.getByText(/\[a link\]\(http:\/\/example.com\)/)).toBeTruthy();
});

test("an author with no real name is shown by username, and a post can be a few minutes old", async () => {
  api({
    "GET /v1/feed": page([
      post({ author: { username: "danladi", display_name: "danladi", is_verified: false }, created_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
    ]),
  });
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });
  const shown = card("Pooling with asyncpg");
  expect(within(shown).getByRole("link", { name: /danladi/ })).toBeTruthy();
  expect(within(shown).getByText("5 minutes ago")).toBeTruthy();
});

// ---------- like and save ----------

test("a like shows at once, sends one request, and keeps the count", async () => {
  const request = held();
  api({ "GET /v1/feed": page([post()]) });
  render(<Feed lang="en" tab="for-you" />);
  const like = await screen.findByRole("button", { name: "Like (2)" });
  expect(like.getAttribute("aria-pressed")).toBe("false");

  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method === "PUT" ? request.response : base(url, init)));
  fireEvent.click(like);
  // changed before the API has answered
  expect(screen.getByRole("button", { name: "Like (3)" }).getAttribute("aria-pressed")).toBe("true");
  // a second press while the first is out sends nothing more
  fireEvent.click(screen.getByRole("button", { name: "Like (3)" }));
  await waitFor(() => expect(asked()).toContain("PUT /v1/posts/post-1/like"));

  request.release(reply(200, { data: { liked: true, like_count: 3 } }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Like (3)" }).getAttribute("aria-pressed")).toBe("true"));
  expect(asked().filter((call) => call.startsWith("PUT")).length).toBe(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a like reconciles with the count from the server response", async () => {
  api({ "GET /v1/feed": page([post({ like_count: 2 })]), "PUT /v1/posts/post-1/like": reply(200, { data: { liked: true, like_count: 5 } }) });
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Like (2)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Like (5)" }).getAttribute("aria-pressed")).toBe("true"));
});

test("pressing a liked post's like takes it back with DELETE", async () => {
  api({ "GET /v1/feed": page([post({ liked_by_me: true, like_count: 5 })]), "DELETE /v1/posts/post-1/like": reply(204) });
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Like (5)" }));
  expect(screen.getByRole("button", { name: "Like (4)" }).getAttribute("aria-pressed")).toBe("false");
  await waitFor(() => expect(asked()).toContain("DELETE /v1/posts/post-1/like"));
});

test("a like that fails goes back and says so", async () => {
  api({ "GET /v1/feed": page([post()]), "PUT /v1/posts/post-1/like": reply(500, { detail: { code: "UNKNOWN", message: "English" } }) });
  render(<Feed lang="en" tab="for-you" />);
  fireEvent.click(await screen.findByRole("button", { name: "Like (2)" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The like did not go through. Try again.");
  expect(screen.getByRole("button", { name: "Like (2)" }).getAttribute("aria-pressed")).toBe("false");
});

test("a save shows at once and sends one request; a failed one goes back and says so", async () => {
  api({ "GET /v1/feed": page([post()]), "PUT /v1/posts/post-1/save": reply(200, { data: { saved: true } }) });
  render(<Feed lang="en" tab="for-you" />);
  const save = await screen.findByRole("button", { name: "Save" });
  fireEvent.click(save);
  expect(save.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(save);
  await waitFor(() => expect(asked().filter((call) => call === "PUT /v1/posts/post-1/save").length).toBe(1));

  api({ "GET /v1/feed": page([post()]), "DELETE /v1/posts/post-1/save": reply(500) });
  fireEvent.click(save);
  expect(save.getAttribute("aria-pressed")).toBe("false");
  await waitFor(() => expect(save.getAttribute("aria-pressed")).toBe("true"));
  expect((await screen.findByRole("alert")).textContent).toBe("The save did not go through. Try again.");
});

test("the buttons say what they do and their state in French", async () => {
  api({ "GET /v1/feed": page([post({ liked_by_me: true, saved_by_me: true })]) });
  render(<Feed lang="fr" tab="for-you" />);
  expect((await screen.findByRole("button", { name: "J'aime (2)" })).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Enregistrer" }).getAttribute("aria-pressed")).toBe("true");
});

test("the comment count is read as text with its word", async () => {
  api({ "GET /v1/feed": page([post({ comment_count: 1 }), post({ id: "post-2", title: "Second", comment_count: 0 })]) });
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "Second" });
  expect(within(card("Pooling with asyncpg")).getByText("1 comment")).toBeTruthy();
  expect(within(card("Second")).getByText("0 comments")).toBeTruthy();
});

test("on Saved, a post you un-save stays until the list loads again, with Save showing", async () => {
  api({ "GET /v1/me/saved-posts": page([post({ saved_by_me: true })]), "DELETE /v1/posts/post-1/save": reply(204) });
  const first = render(<Feed lang="en" tab="saved" />);
  const save = await screen.findByRole("button", { name: "Save" });
  fireEvent.click(save);
  await waitFor(() => expect(asked()).toContain("DELETE /v1/posts/post-1/save"));
  expect(screen.getByRole("heading", { name: "Pooling with asyncpg" })).toBeTruthy();
  expect(save.getAttribute("aria-pressed")).toBe("false");

  // opened again: the API no longer lists it
  first.unmount();
  api({ "GET /v1/me/saved-posts": page([]) });
  render(<Feed lang="en" tab="saved" />);
  expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
});

// ---------- empty, paging, failure ----------

test.each([
  ["for-you", "Nobody has posted yet", "See open ideas", "/en/ideas"],
  ["saved", "Nothing saved yet", "Go to For you", "/en/feed"],
  ["mine", "You have not posted yet", "Go to For you", "/en/feed"],
] as const)("the %s tab with no posts says so, with a way on", async (tab, title, action, href) => {
  api({ "GET /v1/feed": page([]), "GET /v1/me/saved-posts": page([]), "GET /v1/posts": page([]) });
  render(<Feed lang="en" tab={tab} />);
  expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
  expect(screen.getByRole("link", { name: action }).getAttribute("href")).toBe(href);
});

test("Show more adds the next page, skips a post it already has, and a failed page keeps the list", async () => {
  const second = post({ id: "post-2", title: "Second post" });
  const nextAnswers = [reply(500), reply(200, page([post(), second]))];
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith("/v1/me")) return Promise.resolve(reply(200, { data: me }));
    if (String(url).includes("offset=0")) return Promise.resolve(reply(200, page([post()], 20)));
    return Promise.resolve((nextAnswers.shift() ?? reply(500)).clone());
  });
  render(<Feed lang="en" tab="for-you" />);
  await screen.findByRole("heading", { name: "Pooling with asyncpg" });

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't load more posts. The ones above are still here, so try again.");
  expect(screen.getByRole("heading", { name: "Pooling with asyncpg" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByRole("heading", { name: "Second post" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { name: "Pooling with asyncpg" }).length).toBe(1);
  expect(asked().some((call) => call.includes("offset=20"))).toBe(true);
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
});

test("a feed that cannot load is handed to the page's error screen", async () => {
  api({ "GET /v1/feed": reply(500) });
  vi.spyOn(console, "error").mockImplementation(() => {});
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? <p>error screen</p> : this.props.children;
    }
  }
  render(
    <Boundary>
      <Feed lang="en" tab="for-you" />
    </Boundary>,
  );
  expect(await screen.findByText("error screen")).toBeTruthy();
});

test("while the posts load there are blocks and a spoken status, then the title in French", async () => {
  api({ "GET /v1/feed": page([]) });
  render(<Feed lang="fr" tab="for-you" />);
  expect(screen.getByRole("status").textContent).toBe("Chargement du fil");
  expect(await screen.findByRole("heading", { name: "Fil" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Pour vous" })).toBeTruthy();
});
