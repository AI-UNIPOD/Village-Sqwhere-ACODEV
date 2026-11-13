import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

type Answer = unknown | ((init?: RequestInit) => unknown);

// Answers each "METHOD /path" by its longest matching start. A function answers each time it is
// asked, so a list can change between two requests; anything not listed is a mistake.
function api(routes: Record<string, Answer>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const given = routes[match];
    const answer = typeof given === "function" ? given(init) : given;
    return Promise.resolve(answer).then((done) => (done instanceof Response ? done.clone() : reply(200, done)));
  });
}

const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`);
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
  return call ? { url: String(call[0]).replace("http://localhost:8000", ""), body: JSON.parse(call[1].body ?? "null") } : null;
};

const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const person = (username: string, name: string, verified = false) => ({ username, display_name: name, is_verified: verified });
const KWABENA = person("kwabena-owusu", "Kwabena Owusu", true);
const AMA = person("ama-mensah", "Ama Mensah");

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.",
  link_url: null,
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [],
  like_count: 0,
  comment_count: 2,
  created_at: minutes(180),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
  ...over,
});

let age = 100;
const comment = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  post_id: "post-1",
  parent_id: null,
  depth: 0,
  deleted: false,
  author: KWABENA,
  body: `Body of ${id}`,
  like_count: 0,
  reply_count: 0,
  created_at: minutes(age--),
  edited_at: null,
  liked_by_me: false,
  ...over,
});
const top = (id: string, over: Record<string, unknown> = {}, replies: unknown[] = []) => ({ ...comment(id, over), replies });
const page = (data: unknown[], next_offset: number | null = null) => ({ data, next_offset });

// The signed-in person is Ama Mensah unless a test says otherwise.
function open(routes: Record<string, Answer>, lang: "en" | "fr" = "en", username = "ama-mensah") {
  api({
    "GET /v1/me": { data: { username, display_name: "Someone", bio: null, roles: [], technologies: [], feed_topics: [] } },
    "GET /v1/posts/post-1": { data: post() },
    "GET /v1/posts/post-1/comments": page([]),
    ...routes,
  });
  return render(<PostPage lang={lang} />);
}

const section = async () => within(await screen.findByRole("region", { name: /comment|Aucun/i }));
const box = (name: string | RegExp = "Write a comment") => screen.getByRole("textbox", { name });
const type = (name: string | RegExp, value: string) => fireEvent.change(box(name), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const save = () => fireEvent.click(within(document.getElementById("comment-c1-editing-form")!).getByRole("button", { name: "Save" }));
const quiet = (text: string) => screen.getAllByRole("status").some((status) => status.textContent?.trim() === text);

beforeEach(() => {
  nav.search = "id=post-1";
  age = 100;
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
  window.location.hash = "";
});

// ---------- reading ----------

test("each comment says who wrote it, when, and shows its text as plain text with its line breaks", async () => {
  const hostile = "line one\n<b>line two</b> <img src=x onerror=alert(1)>";
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { body: hostile, edited_at: minutes(2) })]) });
  const list = await section();
  const body = await list.findByText(/line one/);
  expect(body.textContent).toBe(hostile);
  expect(body.querySelector("b, img")).toBeNull();
  expect(list.getByText("Kwabena Owusu")).toBeTruthy();
  expect(list.getByText("Verified")).toBeTruthy();
  expect(list.getByText("KO")).toBeTruthy();
  expect(list.getByText("1 hour ago")).toBeTruthy();
  expect(list.getByText("Edited")).toBeTruthy();
});

test("the heading carries the count, with one line to start a conversation at zero", async () => {
  open({ "GET /v1/posts/post-1": { data: post({ comment_count: 0 }) } });
  expect((await screen.findByRole("heading", { name: "No comments yet" })).tagName).toBe("H2");
  expect(await screen.findByText(/Be the first to answer/)).toBeTruthy();
  cleanup();
  open({ "GET /v1/posts/post-1": { data: post({ comment_count: 1 }) }, "GET /v1/posts/post-1/comments": page([top("c1")]) });
  expect(await screen.findByRole("heading", { name: "1 comment" })).toBeTruthy();
  expect(screen.queryByText(/Be the first/)).toBeNull();
});

test("a comment shows its first replies, and Show all loads the rest without repeating them", async () => {
  const [r1, r2, r3] = ["r1", "r2", "r3"].map((id) => comment(id, { parent_id: "c1", depth: 1, author: AMA }));
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { reply_count: 3 }, [r1, r2])]),
    "GET /v1/comments/c1/replies": page([r1, r2, r3]),
  });
  await screen.findByText("Body of r2");
  expect(screen.queryByText("Body of r3")).toBeNull();
  press("Show all 3 replies");
  await screen.findByText("Body of r3");
  expect(asked()).toContain("GET /v1/comments/c1/replies?offset=0&limit=20");
  expect(screen.getAllByText("Body of r1").length).toBe(1);
  expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  // the button is gone, so focus goes to the first reply it brought
  await waitFor(() => expect(document.activeElement?.id).toBe("comment-r3"));
});

test("replies of replies open one level at a time, and a deep one says who it answers", async () => {
  const r1 = comment("r1", { parent_id: "c1", depth: 1, reply_count: 1 });
  const r2 = comment("r2", { parent_id: "r1", depth: 2, reply_count: 1 });
  const r3 = comment("r3", { parent_id: "r2", depth: 3, reply_count: 1, author: AMA });
  const r4 = comment("r4", { parent_id: "r3", depth: 4 });
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { reply_count: 1 }, [r1])]),
    "GET /v1/comments/r1/replies": page([r2]),
    "GET /v1/comments/r2/replies": page([r3]),
    "GET /v1/comments/r3/replies": page([r4]),
  });
  await screen.findByText("Body of r1");
  press("Show 1 reply");
  await screen.findByText("Body of r2");
  press("Show 1 reply");
  await screen.findByText("Body of r3");
  expect(screen.queryByText("Body of r4")).toBeNull();
  press("Show 1 reply");
  await screen.findByText("Body of r4");
  expect(asked().filter((call) => call.includes("/replies")).length).toBe(3);

  // the fourth level and deeper do not move right again, and say who they answer
  const indented = (id: string) => document.getElementById(`comment-${id}`)!.querySelector(":scope > [data-flat]");
  expect(indented("c1")).toBeNull();
  expect(indented("r1")).toBeNull();
  expect(indented("r2")).not.toBeNull();
  expect(screen.getAllByText(/In reply to/).map((note) => note.textContent)).toEqual(["In reply to Kwabena Owusu", "In reply to Ama Mensah"]);
  expect(document.getElementById("comment-r4")!.querySelector(":scope > p")?.textContent).toBe("In reply to Ama Mensah");
  expect(document.getElementById("comment-r2")!.querySelector(":scope > p")?.textContent).not.toMatch(/In reply to/);
});

test("more than one page of replies loads page by page", async () => {
  const replies = (ids: string[]) => ids.map((id) => comment(id, { parent_id: "c1", depth: 1 }));
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { reply_count: 3 }, replies(["r1", "r2"]))]),
    "GET /v1/comments/c1/replies?offset=0": page(replies(["r1", "r2"]), 2),
    "GET /v1/comments/c1/replies?offset=2": page(replies(["r3"])),
  });
  await screen.findByText("Body of r2");
  press("Show all 3 replies");
  await screen.findByText("Body of r2");
  press("Show more replies");
  await screen.findByText("Body of r3");
  expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
});

test("replies that cannot load say so and keep the button", async () => {
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { reply_count: 3 }, [comment("r1", { parent_id: "c1", depth: 1 })])]),
    "GET /v1/comments/c1/replies": reply(500),
  });
  await screen.findByText("Body of r1");
  press("Show all 3 replies");
  expect((await screen.findByText("We couldn't load the replies. Try again.")).closest("[role=alert]")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show all 3 replies" })).toBeTruthy();
});

test("a deleted comment that still has replies is a quiet note with no buttons, and keeps its replies", async () => {
  open({
    "GET /v1/posts/post-1/comments": page([
      top("c1", { deleted: true, author: null, body: null, reply_count: 1 }, [comment("r1", { parent_id: "c1", depth: 1 })]),
    ]),
  });
  const note = await screen.findByText("This comment was deleted");
  const row = note.closest("li")!;
  expect(within(row).getByText("Body of r1")).toBeTruthy();
  // only the reply has buttons: Reply, and nothing of Edit or Delete (it is not Ama's)
  expect(within(row).getAllByRole("button", { name: /^Reply/ }).length).toBe(1);
  expect(note.closest("li")!.querySelector(":scope > p")).toBe(note);
});

test("liking a comment changes it at once, sends the request, and can be undone", async () => {
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { like_count: 2 }), top("c2")]),
    "PUT /v1/comments/c1/like": reply(204, null),
    "DELETE /v1/comments/c1/like": reply(204, null),
  });
  await screen.findByText("Body of c1");
  const row = (id: string) => within(document.getElementById(`comment-${id}`)!);
  const like = () => row("c1").getByRole("button", { name: /^Like/ });
  expect(like().getAttribute("aria-pressed")).toBe("false");
  expect(row("c2").getByRole("button", { name: "Like (0)" })).toBeTruthy();

  fireEvent.click(like());
  expect(like().getAttribute("aria-pressed")).toBe("true");
  expect(like().getAttribute("aria-label")).toBe("Like (3)");
  await waitFor(() => expect(asked()).toContain("PUT /v1/comments/c1/like"));

  await waitFor(() => {
    fireEvent.click(like());
    expect(like().getAttribute("aria-pressed")).toBe("false");
  });
  expect(like().getAttribute("aria-label")).toBe("Like (2)");
  await waitFor(() => expect(asked()).toContain("DELETE /v1/comments/c1/like"));
});

test("a like that fails goes back and says so, and a second press while sending sends nothing", async () => {
  let fail: (response: Response) => void = () => {};
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { like_count: 2 })]),
    "PUT /v1/comments/c1/like": new Promise<Response>((resolve) => (fail = resolve)),
  });
  await screen.findByText("Body of c1");
  const like = () => within(document.getElementById("comment-c1")!).getByRole("button", { name: /^Like/ });

  fireEvent.click(like());
  fireEvent.click(like());
  expect(like().getAttribute("aria-label")).toBe("Like (3)");
  await waitFor(() => expect(asked().filter((call) => call === "PUT /v1/comments/c1/like")).toHaveLength(1));
  expect(asked().some((call) => call.startsWith("DELETE"))).toBe(false);

  fail(refusal(500, "BOOM"));
  expect((await screen.findByRole("alert")).textContent).toContain("The like did not go through. Try again.");
  expect(like().getAttribute("aria-pressed")).toBe("false");
  expect(like().getAttribute("aria-label")).toBe("Like (2)");
});

// ---------- writing ----------

test("a comment is sent as typed, appears after the others, empties the box, and is announced", async () => {
  const made = comment("new", { author: AMA, body: "Hello\nworld", created_at: minutes(0) });
  open({
    "GET /v1/posts/post-1/comments": page([top("c1"), top("c2")]),
    "POST /v1/posts/post-1/comments": reply(201, { data: made }),
  });
  await screen.findByText("Body of c2");
  expect(screen.getAllByText("2 comments").length).toBe(2);
  type("Write a comment", "Hello\nworld");
  press("Comment");
  await waitFor(() => expect(document.getElementById("comment-new")).not.toBeNull());
  const posted = document.getElementById("comment-new")!;
  expect(sent("POST")).toEqual({ url: "/v1/posts/post-1/comments", body: { body: "Hello\nworld" } });
  expect((box() as HTMLTextAreaElement).value).toBe("");
  // after the two before it, as the API orders them, and it rises in
  const items = [...document.querySelectorAll("#comments > ul > li")].map((li) => li.id);
  expect(items).toEqual(["comment-c1", "comment-c2", "comment-new"]);
  expect(posted.hasAttribute("data-arrived")).toBe(true);
  expect(within(posted).getByText("Hello\nworld", { normalizer: (text) => text })).toBeTruthy();
  expect(quiet("Comment posted")).toBe(true);
  // the post's count in its action row and the heading both went up
  expect(screen.getAllByText("3 comments").length).toBe(2);
});

test("a reply is sent with the comment it answers, opens in place with focus, and returns focus when sent", async () => {
  const made = comment("new", { parent_id: "c1", depth: 1, author: AMA, body: "Good point", created_at: minutes(0) });
  open({
    "GET /v1/posts/post-1/comments": page([top("c1")]),
    "POST /v1/posts/post-1/comments": reply(201, { data: made }),
  });
  await screen.findByText("Body of c1");
  const opener = screen.getByRole("button", { name: "Reply to Kwabena Owusu" });
  fireEvent.click(opener);
  expect(opener.getAttribute("aria-expanded")).toBe("true");
  const field = box("Reply to Kwabena Owusu");
  expect(document.activeElement).toBe(field);
  type("Reply to Kwabena Owusu", "Good point");
  press("Reply");
  await screen.findByText("Good point");
  expect(sent("POST")!.body).toEqual({ body: "Good point", parent_id: "c1" });
  expect(screen.queryByRole("textbox", { name: "Reply to Kwabena Owusu" })).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(within(document.getElementById("comment-c1")!).getByText("Good point")).toBeTruthy();
  expect(quiet("Reply posted")).toBe(true);
});

test("only one box is open at a time, and a draft is kept only for the one that is open", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1"), top("c2", { author: AMA })]) });
  await screen.findByText("Body of c2");
  press("Reply to Kwabena Owusu");
  type("Reply to Kwabena Owusu", "half a thought");
  fireEvent.click(screen.getByRole("button", { name: "Reply to Ama Mensah" }));
  expect(screen.queryByRole("textbox", { name: "Reply to Kwabena Owusu" })).toBeNull();
  expect((box("Reply to Ama Mensah") as HTMLTextAreaElement).value).toBe("");
  // an edit closes the reply box too, and Escape closes with focus back on its button
  press("Edit");
  expect(screen.queryByRole("textbox", { name: "Reply to Ama Mensah" })).toBeNull();
  fireEvent.keyDown(box("Edit your comment"), { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit" }));
});

test("an empty box sends nothing and says what to do", async () => {
  open({});
  await screen.findByRole("textbox", { name: "Write a comment" });
  press("Comment");
  press("Comment");
  expect((await screen.findByRole("alert")).textContent).toBe("Write something first. An empty comment cannot be sent.");
  expect(document.activeElement).toBe(box());
  expect(box().getAttribute("aria-invalid")).toBe("true");
  // spaces alone are empty too, and the message goes the moment there is text
  type("Write a comment", "   ");
  press("Comment");
  expect(screen.getByRole("alert")).toBeTruthy();
  type("Write a comment", "Now there is text");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(sent("POST")).toBeNull();
});

test("the limit shows as a counter near it, and a longer text is not sent", async () => {
  open({});
  await screen.findByRole("textbox", { name: "Write a comment" });
  type("Write a comment", "a".repeat(4000));
  expect(screen.queryByText(/of 5000/)).toBeNull();
  type("Write a comment", "a".repeat(4600));
  expect(screen.getByText("4600 of 5000")).toBeTruthy();
  type("Write a comment", "a".repeat(5001));
  press("Comment");
  expect((await screen.findByRole("alert")).textContent).toBe("Shorten the text to 5,000 characters or fewer.");
  expect(sent("POST")).toBeNull();
});

test("a comment that fails keeps what was typed and says nothing was lost", async () => {
  open({ "POST /v1/posts/post-1/comments": reply(500) });
  await screen.findByRole("textbox", { name: "Write a comment" });
  type("Write a comment", "Keep me");
  press("Comment");
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't post your comment. Nothing was lost, so try again.");
  expect((box() as HTMLTextAreaElement).value).toBe("Keep me");
  expect(screen.getAllByText("2 comments").length).toBe(2);
});

test("while a comment is being sent a second press sends nothing more", async () => {
  let release: (answer: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (release = resolve));
  open({ "POST /v1/posts/post-1/comments": () => pending });
  await screen.findByRole("textbox", { name: "Write a comment" });
  type("Write a comment", "Once");
  press("Comment");
  press("Comment");
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").length;
  await waitFor(() => expect(posts()).toBe(1));
  expect(screen.getByRole("button", { name: "Comment" }).getAttribute("aria-busy")).toBe("true");
  release(reply(201, { data: comment("new", { author: AMA, body: "Once" }) }));
  await waitFor(() => expect(document.getElementById("comment-new")).not.toBeNull());
  expect(posts()).toBe(1);
});

// ---------- refusals ----------

test.each([
  ["a reply to a comment that was deleted meanwhile", "PARENT_NOT_FOUND", 422],
  ["an edit of a comment that was deleted meanwhile", "COMMENT_NOT_FOUND", 404],
] as const)("%s says so and loads the list again", async (name, code, status) => {
  let lists = 0;
  open({
    "GET /v1/posts/post-1/comments": () => page(++lists === 1 ? [top("c1", { author: AMA })] : []),
    "POST /v1/posts/post-1/comments": refusal(status, code),
    "PATCH /v1/comments/c1": refusal(status, code),
  });
  await screen.findByText("Body of c1");
  if (name.includes("reply")) {
    press("Reply to Ama Mensah");
    type("Reply to Ama Mensah", "Too late");
    press("Reply");
  } else {
    press("Edit");
    type("Edit your comment", "Too late");
    save();
  }
  expect((await screen.findByText("That comment was deleted. We loaded the comments again.")).closest("[role=alert]")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Body of c1")).toBeNull());
  expect(asked().filter((call) => call === "GET /v1/posts/post-1/comments?offset=0&limit=20").length).toBe(2);
});

test("a reply to a comment at the deepest level says to reply higher up, and keeps the text", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1")]), "POST /v1/posts/post-1/comments": refusal(422, "MAX_DEPTH_EXCEEDED") });
  await screen.findByText("Body of c1");
  press("Reply to Kwabena Owusu");
  type("Reply to Kwabena Owusu", "Down here");
  press("Reply");
  expect((await screen.findByRole("alert")).textContent).toBe("This thread is too deep to answer here. Reply to a comment higher up instead.");
  expect((box("Reply to Kwabena Owusu") as HTMLTextAreaElement).value).toBe("Down here");
});

test("an edit of someone else's comment is refused in words, with the text kept", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA })]), "PATCH /v1/comments/c1": refusal(403, "NOT_COMMENT_AUTHOR") });
  await screen.findByText("Body of c1");
  press("Edit");
  type("Edit your comment", "Mine now");
  save();
  expect((await screen.findByRole("alert")).textContent).toBe("Only the author can change this comment.");
  expect((box("Edit your comment") as HTMLTextAreaElement).value).toBe("Mine now");
});

test("a text the API turns down is said to be the problem, in the box", async () => {
  const invalid = reply(422, { detail: [{ type: "value_error", loc: ["body", "body"], msg: "no null" }] });
  open({ "POST /v1/posts/post-1/comments": invalid });
  await screen.findByRole("textbox", { name: "Write a comment" });
  type("Write a comment", "odd text");
  press("Comment");
  expect((await screen.findByRole("alert")).textContent).toBe("This could not be accepted. Look for an unusual character and try again.");
  expect(document.activeElement).toBe(box());
});

test("a post that is gone, found out by a comment, is the page's own gone screen", async () => {
  open({ "POST /v1/posts/post-1/comments": refusal(404, "POST_NOT_FOUND") });
  await screen.findByRole("textbox", { name: "Write a comment" });
  type("Write a comment", "Late");
  press("Comment");
  expect(await screen.findByRole("heading", { name: "This post is gone" })).toBeTruthy();
});

// ---------- editing ----------

test("only the author is offered Edit and Delete, a moderator's right to delete is not offered", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA }), top("c2")]) });
  await screen.findByText("Body of c2");
  expect(within(document.getElementById("comment-c1")!).getByRole("button", { name: "Edit" })).toBeTruthy();
  expect(within(document.getElementById("comment-c1")!).getByRole("button", { name: "Delete" })).toBeTruthy();
  expect(within(document.getElementById("comment-c2")!).queryByRole("button", { name: /^(Edit|Delete)$/ })).toBeNull();
});

test("an edit replaces the text in place, says Edited, and returns focus to Edit", async () => {
  const saved = comment("c1", { author: AMA, body: "Better words", edited_at: minutes(0) });
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA })]), "PATCH /v1/comments/c1": { data: saved } });
  await screen.findByText("Body of c1");
  const opener = screen.getByRole("button", { name: "Edit" });
  fireEvent.click(opener);
  const field = box("Edit your comment") as HTMLTextAreaElement;
  expect(field.value).toBe("Body of c1");
  expect(document.activeElement).toBe(field);
  type("Edit your comment", "Better words");
  save();
  await screen.findByText("Better words");
  expect(sent("PATCH")).toEqual({ url: "/v1/comments/c1", body: { body: "Better words" } });
  expect(screen.getByText("Edited")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(quiet("Comment saved")).toBe(true);
});

test("saving an edit that changed nothing sends nothing", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA })]) });
  await screen.findByText("Body of c1");
  press("Edit");
  save();
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull());
  expect(sent("PATCH")).toBeNull();
});

// ---------- deleting ----------

test("deleting asks first, and a comment with replies stays as a note that keeps them", async () => {
  open({
    "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA, reply_count: 1 }, [comment("r1", { parent_id: "c1", depth: 1 })])]),
    "DELETE /v1/comments/c1": reply(204),
  });
  await screen.findByText("Body of r1");
  press("Delete");
  const dialog = screen.getByRole("dialog", { name: "Delete this comment?" });
  expect(within(dialog).getByText(/Its replies stay/)).toBeTruthy();
  expect(sent("DELETE")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete comment" }));
  await screen.findByText("This comment was deleted");
  expect(sent("DELETE")!.url).toBe("/v1/comments/c1");
  expect(screen.queryByText("Body of c1")).toBeNull();
  expect(screen.getByText("Body of r1")).toBeTruthy();
  expect(within(document.getElementById("comment-c1")!).queryByRole("button", { name: /^(Edit|Delete)$/ })).toBeNull();
  expect(quiet("Comment deleted")).toBe(true);
  expect(screen.getAllByText("1 comment").length).toBe(2);
  expect(document.activeElement?.id).toBe("comments-heading");
});

test("a comment with no replies is removed, and backing out of the question deletes nothing", async () => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA }), top("c2")]), "DELETE /v1/comments/c1": reply(204) });
  await screen.findByText("Body of c1");
  press("Delete");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep comment" }));
  expect(sent("DELETE")).toBeNull();
  expect(screen.getByText("Body of c1")).toBeTruthy();
  press("Delete");
  expect(within(screen.getByRole("dialog")).queryByText(/Its replies stay/)).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete comment" }));
  await waitFor(() => expect(screen.queryByText("Body of c1")).toBeNull());
  expect(screen.getByText("Body of c2")).toBeTruthy();
  expect(quiet("Comment deleted")).toBe(true);
  expect(screen.getAllByText("1 comment").length).toBe(2);
});

test.each([
  ["fails", reply(500), "We couldn't delete the comment. Nothing was changed, so try again."],
  ["is refused", refusal(403, "NOT_COMMENT_AUTHOR"), "Only the author can change this comment."],
])("a delete that %s says so and keeps the comment", async (_name, answer, sentence) => {
  open({ "GET /v1/posts/post-1/comments": page([top("c1", { author: AMA })]), "DELETE /v1/comments/c1": answer });
  await screen.findByText("Body of c1");
  press("Delete");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete comment" }));
  expect((await screen.findByRole("alert")).textContent).toBe(sentence);
  expect(screen.getByText("Body of c1")).toBeTruthy();
  expect(screen.getAllByText("2 comments").length).toBe(2);
});

test("deleting a comment that is already gone says so and loads the list again", async () => {
  let lists = 0;
  open({
    "GET /v1/posts/post-1/comments": () => page(++lists === 1 ? [top("c1", { author: AMA })] : []),
    "DELETE /v1/comments/c1": refusal(404, "COMMENT_NOT_FOUND"),
  });
  await screen.findByText("Body of c1");
  press("Delete");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete comment" }));
  expect((await screen.findByText("That comment was deleted. We loaded the comments again.")).closest("[role=alert]")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Body of c1")).toBeNull());
});

// ---------- paging, failing ----------

test("more comments load a page at a time, without repeating one", async () => {
  open({
    "GET /v1/posts/post-1/comments?offset=0": page([top("c1"), top("c2")], 20),
    "GET /v1/posts/post-1/comments?offset=20": page([top("c2"), top("c3")]),
  });
  await screen.findByText("Body of c2");
  press("Show more comments");
  await screen.findByText("Body of c3");
  expect(asked()).toContain("GET /v1/posts/post-1/comments?offset=20&limit=20");
  expect(screen.getAllByText("Body of c2").length).toBe(1);
  expect(screen.queryByRole("button", { name: "Show more comments" })).toBeNull();
});

test("a comment written while more pages wait sits after the loaded ones, and stays last when they arrive", async () => {
  const made = comment("new", { author: AMA, body: "Mine", created_at: minutes(0) });
  open({
    "GET /v1/posts/post-1/comments?offset=0": page([top("c1")], 20),
    "GET /v1/posts/post-1/comments?offset=20": page([top("c2")]),
    "POST /v1/posts/post-1/comments": reply(201, { data: made }),
  });
  await screen.findByText("Body of c1");
  type("Write a comment", "Mine");
  press("Comment");
  await screen.findByText("Mine");
  press("Show more comments");
  await screen.findByText("Body of c2");
  expect([...document.querySelectorAll("#comments > ul > li")].map((li) => li.id)).toEqual(["comment-c1", "comment-c2", "comment-new"]);
});

test("a next page that fails keeps the list and says so", async () => {
  open({ "GET /v1/posts/post-1/comments?offset=0": page([top("c1")], 20), "GET /v1/posts/post-1/comments?offset=20": reply(500) });
  await screen.findByText("Body of c1");
  press("Show more comments");
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't load more comments. The ones above are still here, so try again.");
  expect(screen.getByText("Body of c1")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show more comments" })).toBeTruthy();
});

test("comments that cannot load leave the post readable, with a way to try again", async () => {
  let tries = 0;
  open({ "GET /v1/posts/post-1/comments": () => (++tries === 1 ? reply(500) : page([top("c1")])) });
  expect((await screen.findByText("We couldn't load the comments. The post is still here, so try again.")).closest("[role=alert]")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pooling with asyncpg");
  expect(screen.queryByRole("textbox", { name: "Write a comment" })).toBeNull();
  press("Try again");
  await screen.findByText("Body of c1");
  expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeTruthy();
});

test("while the comments load they have a skeleton of their own, with a spoken status", async () => {
  open({ "GET /v1/posts/post-1/comments": () => new Promise(() => {}) });
  expect(await screen.findByText("Getting the comments")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pooling with asyncpg");
});

test("a post that is gone, found out by the comments, is the page's gone screen", async () => {
  open({ "GET /v1/posts/post-1/comments": refusal(404, "POST_NOT_FOUND") });
  expect(await screen.findByRole("heading", { name: "This post is gone" })).toBeTruthy();
});

test("a link from the feed's comment count lands on the section", async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.location.hash = "#comments";
  open({});
  await screen.findByRole("heading", { name: "2 comments" });
  await waitFor(() => expect(scroll.mock.contexts.some((element) => (element as HTMLElement).id === "comments")).toBe(true));
  // @ts-expect-error jsdom has no scrollIntoView to put back
  delete Element.prototype.scrollIntoView;
});

// ---------- French ----------

test("everything is in French, with the narrow space before a question mark", async () => {
  const mine = top("c1", { author: AMA, reply_count: 3 }, [comment("r1", { parent_id: "c1", depth: 1 })]);
  open({ "GET /v1/posts/post-1/comments": page([mine]) }, "fr");
  expect(await screen.findByRole("textbox", { name: "Écrire un commentaire" })).toBeTruthy();
  expect(screen.getAllByText("2 commentaires").length).toBe(2);
  expect(screen.getByRole("button", { name: "Commenter" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Afficher les 3 réponses" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Répondre à Ama Mensah" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Modifier" }).length).toBe(1);
  press("Supprimer");
  expect(screen.getByRole("dialog", { name: "Supprimer ce commentaire\u202f?" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Garder le commentaire" }));
  press("Commenter");
  expect((await screen.findByRole("alert")).textContent).toBe("Écrivez d'abord quelque chose. Un commentaire vide ne peut pas être envoyé.");
});

test("a post with no comments says so in French", async () => {
  open({ "GET /v1/posts/post-1": { data: post({ comment_count: 0 }) } }, "fr");
  expect(await screen.findByRole("heading", { name: "Aucun commentaire pour le moment" })).toBeTruthy();
});
