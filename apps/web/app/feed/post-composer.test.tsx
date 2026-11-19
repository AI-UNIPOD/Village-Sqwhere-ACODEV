import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { PostComposer } from "./post-composer";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "question",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.",
  link_url: "https://example.com/guide",
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

const me = (username: string) => ({ data: { username, display_name: "Someone", bio: null, roles: [], technologies: [] } });

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake.
function api(own: Record<string, unknown>) {
  const routes: Record<string, unknown> = { "GET /v1/me": me("wanjiru-kamau"), ...own };
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
// what the API was sent, for the one request of this method
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
  return call ? JSON.parse(String(call[1].body)) : undefined;
};
const requests = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method).length;

const typeInto = (name: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const kind = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp(`^${name}`) }));
const chip = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  nav.search = "";
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

// ---------- writing ----------

test("the form lists the seven kinds with general chosen, and never hub milestone", () => {
  api({});
  render(<PostComposer lang="en" />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Write a post");
  const kinds = within(screen.getByRole("radiogroup", { name: "Kind of post" })).getAllByRole("radio");
  expect(kinds.map((radio) => radio.parentElement!.textContent)).toEqual([
    "GeneralAnything you want to share.",
    "QuestionSomething you are stuck on or want opinions on.",
    "Architecture challengeA design decision you want to talk through.",
    "Code review requestCode you would like another developer to read.",
    "Open source releaseA new version or project you are releasing.",
    "RFCA proposal for comments. It needs a title.",
    "Research noteWhat you found out while studying something.",
  ]);
  expect((kinds[0] as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText("Plain text. Line breaks are kept, and nothing is formatted.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/en/feed");
  expect(asked().filter((call) => call !== "GET /v1/me")).toEqual([]);
});

test("a post with only text sends no title and no link, then opens on its own page", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-1" }) }) });
  render(<PostComposer lang="en" />);
  typeInto("Text", "Line one\nLine two");
  press("Publish");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=new-1&done=published"));
  expect(sent("POST")).toEqual({ type: "general", body: "Line one\nLine two", topics: [] });
});

test("publishing sends exactly what was chosen: the kind, a trimmed title and link, topics as slugs", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-2" }) }) });
  render(<PostComposer lang="en" />);
  kind("Question");
  typeInto(/^Title/, "  Why does my pool starve?  ");
  typeInto("Text", "  We use asyncpg.  ");
  typeInto(/^Link/, " https://example.com/pool ");
  fireEvent.click(chip("Python"));
  fireEvent.click(chip("PostgreSQL"));
  press("Publish");
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(sent("POST")).toEqual({
    type: "question",
    title: "Why does my pool starve?",
    body: "  We use asyncpg.  ",
    link_url: "https://example.com/pool",
    topics: ["python", "postgresql"],
  });
});

test("after publishing, the form is empty again, so coming back cannot send the post twice", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-3" }) }) });
  render(<PostComposer lang="en" />);
  typeInto("Text", "Something worth sharing");
  press("Publish");
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("");
  press("Publish");
  expect(requests("POST")).toBe(1);
  expect(screen.getByText("Write something in the text. A post cannot be empty.")).toBeTruthy();
});

test("pressing Publish twice while it is sending sends one post", async () => {
  let release: (response: Response) => void = () => {};
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-4" }) }) });
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? new Promise<Response>((resolve) => (release = resolve)) : base(url, init),
  );
  render(<PostComposer lang="en" />);
  typeInto("Text", "Once only");
  press("Publish");
  await waitFor(() => expect(requests("POST")).toBe(1));
  press("Publish");
  expect(screen.getByRole("button", { name: "Publish" }).getAttribute("aria-busy")).toBe("true");
  release(reply(201, { data: post({ id: "new-4" }) }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
  expect(requests("POST")).toBe(1);
});

// ---------- the rules, said before anything is sent ----------

test("an empty text, or one of spaces, is not sent", () => {
  api({});
  render(<PostComposer lang="en" />);
  press("Publish");
  expect(screen.getByRole("alert").textContent).toBe("Write something in the text. A post cannot be empty.");
  expect(document.activeElement).toBe(screen.getByLabelText("Text"));
  typeInto("Text", "   \n  ");
  press("Publish");
  expect(screen.getByText("Write something in the text. A post cannot be empty.")).toBeTruthy();
  expect(requests("POST")).toBe(0);
  // the error goes the moment the text is fixed
  typeInto("Text", "Now it has words");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a text over 20,000 characters, a title over 200 and a link over 2,048 are not sent", () => {
  api({});
  render(<PostComposer lang="en" />);
  typeInto("Text", "a".repeat(20001));
  typeInto(/^Title/, "t".repeat(201));
  typeInto(/^Link/, `https://example.com/${"l".repeat(2040)}`);
  press("Publish");
  const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
  expect(alerts).toEqual([
    "Shorten the title to 200 characters or fewer.",
    "Shorten the text to 20,000 characters or fewer.",
    "Shorten the link to 2,048 characters or fewer.",
  ]);
  expect(document.activeElement).toBe(screen.getByLabelText(/^Title/));
  expect(requests("POST")).toBe(0);
});

test("a counter shows once the text is close to its limit", () => {
  api({});
  render(<PostComposer lang="en" />);
  expect(screen.queryByText("100 of 20000")).toBeNull();
  typeInto("Text", "a".repeat(18500));
  expect(screen.getByText("18500 of 20000")).toBeTruthy();
});

test("a link that does not start with http:// or https:// says so in words and is not sent", () => {
  api({});
  render(<PostComposer lang="en" />);
  typeInto("Text", "Read this");
  typeInto(/^Link/, "example.com/guide");
  press("Publish");
  expect(screen.getByRole("alert").textContent).toBe("Start the link with http:// or https://, like https://github.com/your-team/your-project.");
  expect(requests("POST")).toBe(0);
  typeInto(/^Link/, "https://example.com/guide");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("choosing RFC makes the title required, at once and next to the field, and another kind takes it back", () => {
  api({});
  render(<PostComposer lang="en" />);
  expect(screen.getByLabelText("Title (optional)")).toBeTruthy();
  kind("RFC");
  expect(screen.getByLabelText("Title (required for an RFC)")).toBeTruthy();
  expect(screen.getByText("An RFC is a proposal for comments, so it needs a title.")).toBeTruthy();
  typeInto("Text", "The proposal");
  press("Publish");
  expect(screen.getByRole("alert").textContent).toBe("Add a title. An RFC cannot be posted without one.");
  expect(requests("POST")).toBe(0);
  // the error goes with the kind
  kind("General");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("Title (optional)")).toBeTruthy();
});

test("an RFC with a title is sent as an RFC", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-5", type: "rfc" }) }) });
  render(<PostComposer lang="en" />);
  kind("RFC");
  typeInto(/^Title/, "Retry budget for the gateway");
  typeInto("Text", "Proposal");
  press("Publish");
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(sent("POST")).toMatchObject({ type: "rfc", title: "Retry budget for the gateway" });
});

test("five topics at most: at five the others cannot be chosen, and a line says why", () => {
  api({});
  render(<PostComposer lang="en" />);
  for (const name of ["React", "Vue", "Go", "Rust", "Python"]) fireEvent.click(chip(name));
  expect(screen.getByText("You chose 5 topics, the most a post can have. Remove one to choose another.")).toBeTruthy();
  fireEvent.click(chip("Java"));
  expect(chip("Java").getAttribute("aria-pressed")).toBe("false");
  expect(chip("Java").getAttribute("aria-disabled")).toBe("true");
  // a chosen one can still be taken back, which makes room
  fireEvent.click(chip("Go"));
  expect(screen.getByText("Up to 5 technologies your post is about.")).toBeTruthy();
  fireEvent.click(chip("Java"));
  expect(chip("Java").getAttribute("aria-pressed")).toBe("true");
});

// ---------- the API says no ----------

test.each([
  ["UNKNOWN_TOPIC", "One of the topics is not known. Remove it and try again."],
  ["TOO_MANY_TOPICS", "A post can have 5 topics at most. Remove some."],
  ["DUPLICATE_TOPICS", "A topic was chosen twice. Remove one."],
  ["HUB_MILESTONE_NOT_SUPPORTED", "This kind of post cannot be written here. Choose another kind."],
])("%s is said next to its own field, and what was typed is kept", async (code, sentence) => {
  api({ "POST /v1/posts": refusal(422, code) });
  render(<PostComposer lang="en" />);
  typeInto("Text", "Keep me");
  fireEvent.click(chip("Go"));
  press("Publish");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(sentence);
  // the sentence sits in the field it is about
  expect(alert.closest("div")!.textContent).toContain(code.includes("TOPIC") ? "Topics" : "Kind of post");
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Keep me");
  expect(chip("Go").getAttribute("aria-pressed")).toBe("true");
  expect(nav.push).not.toHaveBeenCalled();
});

test("a field the API turns down on its own, such as a null character, is said at that field", async () => {
  api({ "POST /v1/posts": reply(422, { detail: [{ loc: ["body", "body"], msg: "Value error, body must not contain a null character" }] }) });
  render(<PostComposer lang="en" />);
  typeInto("Text", "bad\u0000text");
  press("Publish");
  expect((await screen.findByRole("alert")).textContent).toBe("This could not be accepted. Look for an unusual character and try again.");
});

test("any other failure says nothing was lost, keeps the text and lets the person try again", async () => {
  api({ "POST /v1/posts": reply(500) });
  render(<PostComposer lang="en" />);
  typeInto(/^Title/, "A title");
  typeInto("Text", "Keep me");
  press("Publish");
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't publish your post. Nothing was lost, so try again.");
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Keep me");
  expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("A title");
  expect(nav.push).not.toHaveBeenCalled();
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-6" }) }) });
  press("Publish");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=new-6&done=published"));
});

test.each([
  ["en", "Text", "Publish", "Nothing was saved. The demo cannot be changed."],
  ["fr", "Texte", "Publier", "Rien n'a été enregistré. La démo ne peut pas être modifiée."],
] as const)("in the demo a refused post says nothing was saved beside the button, in %s", async (lang, body, publish, line) => {
  api({ "POST /v1/posts": refusal(403, "DEMO_READ_ONLY") });
  render(<PostComposer lang={lang} />);
  typeInto(body, "Keep me");
  press(publish);
  const said = await screen.findByText(line);
  expect(said.getAttribute("role")).toBe("status");
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByLabelText(body) as HTMLTextAreaElement).value).toBe("Keep me");
  // it goes when the text is edited, and when the button is pressed again
  typeInto(body, "Keep me please");
  expect(screen.queryByText(line)).toBeNull();
  press(publish);
  await screen.findByText(line);
  expect(requests("POST")).toBe(2);
});

// ---------- leaving ----------

test("closing the tab with unsent text asks first, as the idea composer does, and not when nothing was typed", () => {
  api({});
  render(<PostComposer lang="en" />);
  const leave = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(leave()).toBe(false);
  typeInto("Text", "Not sent yet");
  expect(leave()).toBe(true);
});

// ---------- editing ----------

function edit(own: Record<string, unknown> = {}, who = "wanjiru-kamau") {
  nav.search = "id=post-1";
  api({ "GET /v1/me": me(who), "GET /v1/posts/post-1": { data: post(own) }, "PATCH /v1/posts/post-1": { data: post(own) } });
  return render(<PostComposer lang="en" />);
}

test("editing loads the post, shows its kind and topics as fixed, and says so", async () => {
  edit();
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Edit your post");
  expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Pooling with asyncpg");
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("We moved to a pool of ten.");
  expect((screen.getByLabelText(/^Link/) as HTMLInputElement).value).toBe("https://example.com/guide");
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("button", { name: "Python" })).toBeNull();
  expect(screen.getByText("The kind cannot be changed after you post.")).toBeTruthy();
  expect(screen.getByText("The topics cannot be changed after you post.")).toBeTruthy();
  expect(screen.getByText("Question", { selector: "p" })).toBeTruthy();
  // text, not a link to the feed: a press must not leave the form
  expect(screen.getByText("Python").closest("a")).toBeNull();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/en/posts/view?id=post-1");
});

test("saving sends only what changed, never the kind or the topics, and opens the post with a message", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  typeInto("Text", "We moved to a pool of twenty.");
  press("Save changes");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=post-1&done=saved"));
  expect(asked()).toContain("PATCH /v1/posts/post-1");
  expect(sent("PATCH")).toEqual({ body: "We moved to a pool of twenty." });
});

test("clearing the title or the link sends null for it", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  typeInto(/^Title/, "");
  typeInto(/^Link/, "  ");
  press("Save changes");
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(sent("PATCH")).toEqual({ title: null, link_url: null });
});

test("saving with nothing changed sends no request", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  press("Save changes");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=post-1&done=saved"));
  expect(requests("PATCH")).toBe(0);
});

test("an RFC keeps its title: clearing it is refused before anything is sent", async () => {
  edit({ type: "rfc" });
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByLabelText("Title (required for an RFC)")).toBeTruthy();
  typeInto(/^Title/, "");
  press("Save changes");
  expect(screen.getByRole("alert").textContent).toBe("Add a title. An RFC cannot be posted without one.");
  expect(requests("PATCH")).toBe(0);
});

test.each([
  ["RFC_TITLE_REQUIRED", 422, "Add a title. An RFC cannot be posted without one."],
  ["EMPTY_UPDATE", 422, "Nothing has changed, so there is nothing to save."],
])("an edit the API refuses with %s says so and keeps the text", async (code, status, sentence) => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "PATCH /v1/posts/post-1": refusal(status, code) });
  typeInto("Text", "Edited text");
  press("Save changes");
  expect((await screen.findByRole("alert")).textContent).toBe(sentence);
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Edited text");
  expect(nav.push).not.toHaveBeenCalled();
});

test("an edit that fails says nothing was lost and keeps the changes", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "PATCH /v1/posts/post-1": reply(500) });
  typeInto("Text", "Edited text");
  press("Save changes");
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't save your changes. Nothing was lost, so try again.");
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Edited text");
});

test("somebody else's post is not editable: a screen says so and leads to the post", async () => {
  edit({}, "kwabena-owusu");
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("This is not your post");
  expect(screen.getByText("Only its author can edit it.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the post" }).getAttribute("href")).toBe("/en/posts/view?id=post-1");
  expect(screen.queryByLabelText("Text")).toBeNull();
});

test("the API saying it is not the author's post shows the same screen", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "PATCH /v1/posts/post-1": refusal(403, "NOT_POST_AUTHOR") });
  typeInto("Text", "Edited text");
  press("Save changes");
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This is not your post"));
});

test.each([[404], [422]])("a post that is gone (%i) gets the gone screen, not a form", async (status) => {
  nav.search = "id=post-1";
  api({ "GET /v1/posts/post-1": refusal(status, "POST_NOT_FOUND") });
  render(<PostComposer lang="en" />);
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("This post is gone");
  expect(screen.getByRole("link", { name: "Back to the feed" }).getAttribute("href")).toBe("/en/feed");
});

test("a post that is deleted while it is being edited gets the gone screen on save", async () => {
  edit();
  await screen.findByRole("heading", { level: 1 });
  api({ "GET /v1/me": me("wanjiru-kamau"), "GET /v1/posts/post-1": { data: post() }, "PATCH /v1/posts/post-1": refusal(404, "POST_NOT_FOUND") });
  typeInto("Text", "Edited text");
  press("Save changes");
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This post is gone"));
});

test("a post that cannot load is handed to the page's error screen", async () => {
  nav.search = "id=post-1";
  api({ "GET /v1/posts/post-1": reply(500) });
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? <p>error screen</p> : this.props.children;
    }
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <Boundary>
      <PostComposer lang="en" />
    </Boundary>,
  );
  expect(await screen.findByText("error screen")).toBeTruthy();
  vi.restoreAllMocks();
});

test("the form is keyed by the post: another address shows another form, never what was typed", async () => {
  api({});
  const { rerender } = render(<PostComposer lang="en" />);
  typeInto("Text", "Half a post");
  nav.search = "id=post-1";
  api({ "GET /v1/posts/post-1": { data: post() } });
  rerender(<PostComposer lang="en" />);
  expect((await screen.findByLabelText("Text") as HTMLTextAreaElement).value).toBe("We moved to a pool of ten.");
});

// ---------- the page around it ----------

test("the places bar marks Feed on the composer", () => {
  api({});
  render(<PostComposer lang="en" />);
  expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Feed" }).getAttribute("aria-current")).toBe("page");
});

test("everything is in French too, and the RFC rule says so in French", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-7" }) }) });
  render(<PostComposer lang="fr" />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Écrire une publication");
  expect(screen.getByRole("radiogroup", { name: "Type de publication" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /^Général/ })).toBeTruthy();
  expect(screen.getByLabelText("Titre (facultatif)")).toBeTruthy();
  expect(screen.getByText("Texte brut. Les retours à la ligne sont conservés, rien n'est mis en forme.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /^RFC/ }));
  expect(screen.getByLabelText("Titre (obligatoire pour une RFC)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Publier" }));
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    "Ajoutez un titre. Une RFC ne peut pas être publiée sans titre.",
    "Écrivez quelque chose dans le texte. Une publication ne peut pas être vide.",
  ]);
  expect(screen.getByRole("link", { name: "Annuler" }).getAttribute("href")).toBe("/fr/feed");
  expect(screen.getByRole("button", { name: "Vue" })).toBeTruthy();
});
