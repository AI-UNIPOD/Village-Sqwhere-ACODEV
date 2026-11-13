import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { PostPage } from "./post-page";

const nav = vi.hoisted(() => ({ search: "id=post-1", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
// a 204 has no body, as the API sends it
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.\n\nLatency halved, and the second paragraph is kept.\nA long post is shown whole here.",
  link_url: null,
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [{ slug: "python", name: "Python" }],
  like_count: 2,
  comment_count: 3,
  created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
  ...over,
});

const me = (username: string) => ({ data: { username, display_name: "Someone", bio: null, roles: [], technologies: [] } });

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake.
function api(routes: Record<string, unknown>) {
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

const places = (name: string) => within(screen.getByRole("navigation", { name }));
const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`);

beforeEach(() => {
  nav.search = "id=post-1";
  nav.push.mockReset();
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

// ---------- reading ----------

test("the post is shown whole, with its title as the page's heading, in English", async () => {
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": { data: post({ link_url: "https://example.com/guide" }) } });
  render(<PostPage lang="en" />);
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Pooling with asyncpg");
  expect(screen.getByText(/the second paragraph is kept/).textContent).toContain("ten.\n\nLatency");
  expect(screen.getByText("3 hours ago")).toBeTruthy();
  expect(screen.getByText("Python")).toBeTruthy();
  expect(screen.getByRole("link", { name: /example\.com/ }).getAttribute("rel")).toBe("noopener noreferrer");
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Feed" }).getAttribute("href")).toBe("/en/feed");
  expect(screen.getByText("3 comments")).toBeTruthy();
  expect(screen.getByText("Comments are coming soon. Until then, you can only see how many there are.")).toBeTruthy();
  expect(screen.queryByText(/^Edited/)).toBeNull();
  // the feed is the place this page belongs to
  expect(places("Main").getByRole("link", { name: "Feed" }).getAttribute("aria-current")).toBe("page");
});

test("a post with no title is headed by its author, and an edited one says when", async () => {
  const edited = new Date(Date.now() - 2 * 3_600_000).toISOString();
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": { data: post({ title: null, type: "question", edited_at: edited }) } });
  render(<PostPage lang="fr" />);
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Publication de Wanjiru Kamau");
  expect(screen.getByText("Modifiée il y a 2 heures")).toBeTruthy();
  expect(screen.getByText("Question")).toBeTruthy();
  expect(screen.getByText("Les commentaires arrivent bientôt. D'ici là, vous pouvez seulement voir leur nombre.")).toBeTruthy();
  expect(places("Principale").getByRole("link", { name: "Fil" }).getAttribute("aria-current")).toBe("page");
});

test("like and save work on the page as on a card", async () => {
  api({
    "GET /v1/me": me("kwabena-owusu"),
    "GET /v1/posts/post-1": { data: post() },
    "PUT /v1/posts/post-1/like": reply(200, { data: { liked: true, like_count: 3 } }),
    "PUT /v1/posts/post-1/save": reply(500),
  });
  render(<PostPage lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Like (2)" }));
  expect(screen.getByRole("button", { name: "Like (3)" }).getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(asked()).toContain("PUT /v1/posts/post-1/like"));

  // a failed save goes back without touching the like beside it
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The save did not go through. Try again.");
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("button", { name: "Like (3)" }).getAttribute("aria-pressed")).toBe("true");
});

// ---------- delete ----------

test("only the author is offered Delete", async () => {
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(asked()).toContain("GET /v1/me"));
  expect(screen.queryByRole("button", { name: "Delete post" })).toBeNull();
});

test("the author is offered Edit beside Delete, which opens the composer on this post", async () => {
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="en" />);
  const edit = await screen.findByRole("link", { name: "Edit post" });
  expect(edit.getAttribute("href")).toBe("/en/posts/compose?id=post-1");
  expect(screen.getByRole("button", { name: "Delete post" })).toBeTruthy();
});

test("nobody else is offered Edit", async () => {
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(asked()).toContain("GET /v1/me"));
  expect(screen.queryByRole("link", { name: "Edit post" })).toBeNull();
});

test.each([
  ["published", "Post published", "Publication mise en ligne"],
  ["saved", "Changes saved", "Modifications enregistrées"],
])("?done=%s shows its message from the address, in both languages", async (done, english, french) => {
  nav.search = `id=post-1&done=${done}`;
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() } });
  const page = render(<PostPage lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByRole("status").textContent).toBe(english);
  page.unmount();
  render(<PostPage lang="fr" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByRole("status").textContent).toBe(french);
});

test("with no message in the address, or one that is not known, there is none", async () => {
  nav.search = "id=post-1&done=whatever";
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByRole("status")).toBeNull();
});

test("the author confirms, the post is deleted with no reason, and the person lands on Yours", async () => {
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "DELETE /v1/posts/post-1": reply(204) });
  render(<PostPage lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete post" }));
  const dialog = screen.getByRole("dialog", { name: "Delete this post?" });
  expect(asked().some((call) => call.startsWith("DELETE"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete post" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/feed/mine?done=deleted"));
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE")!;
  expect(String(request[0])).toMatch(/\/v1\/posts\/post-1$/);
  expect(request[1].body).toBeUndefined();
  // opened again from memory, the page shows it as gone
  expect(screen.getByRole("heading", { name: "This post is gone" })).toBeTruthy();
});

test("backing out of the confirmation deletes nothing", async () => {
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete post" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep post" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(asked().some((call) => call.startsWith("DELETE"))).toBe(false);
  expect(nav.push).not.toHaveBeenCalled();
});

test("a refused delete says why and keeps the post", async () => {
  api({
    "GET /v1/me": me("wanjiru-kamau"),
    "GET /v1/posts/post-1": { data: post() },
    "DELETE /v1/posts/post-1": refusal(403, "NOT_POST_AUTHOR"),
  });
  render(<PostPage lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete post" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete post" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Only the author can delete this post.");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pooling with asyncpg");
  expect(nav.push).not.toHaveBeenCalled();
});

test("a delete that fails otherwise says nothing was changed", async () => {
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "DELETE /v1/posts/post-1": reply(500) });
  render(<PostPage lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete post" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete post" }));
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't delete the post. Nothing was changed, so try again.");
});

// ---------- gone, failure, loading ----------

test.each([
  ["a deleted post", reply(404, { detail: { code: "POST_NOT_FOUND", message: "English" } }), "id=post-1"],
  ["an id that is not an id", reply(422, { detail: [{ type: "uuid_parsing", loc: ["path", "post_id"], msg: "bad" }] }), "id=nonsense"],
])("%s is a post that is gone, with the way back to the feed", async (_name, answer, search) => {
  nav.search = search;
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/": answer });
  render(<PostPage lang="fr" />);
  expect(await screen.findByRole("heading", { name: "Cette publication n'existe plus" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Retour au fil" }).getAttribute("href")).toBe("/fr/feed");
});

test("an address with no id is a post that is gone, without asking the API", async () => {
  nav.search = "";
  api({ "GET /v1/me": me("kwabena-owusu") });
  render(<PostPage lang="en" />);
  expect(await screen.findByRole("heading", { name: "This post is gone" })).toBeTruthy();
  expect(asked().some((call) => call.includes("/v1/posts"))).toBe(false);
});

test("a post that cannot load is handed to the page's error screen", async () => {
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": reply(500) });
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
      <PostPage lang="en" />
    </Boundary>,
  );
  expect(await screen.findByText("error screen")).toBeTruthy();
});

test("while the post loads there is a spoken status", () => {
  api({ "GET /v1/me": me("kwabena-owusu"), "GET /v1/posts/post-1": { data: post() } });
  render(<PostPage lang="fr" />);
  expect(screen.getByRole("status").textContent).toBe("Chargement de la publication");
});
