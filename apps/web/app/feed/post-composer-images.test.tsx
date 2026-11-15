import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const MB = 1024 * 1024;

const image = (n: number) => ({
  id: `img-${n}`,
  url: `/v1/post-images/img-${n}`,
  mime_type: "image/png",
  byte_size: 1000,
  width: 800,
  height: 600,
  position: n - 1,
  created_at: "2026-11-15T10:00:00Z",
});

const post = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.",
  link_url: null,
  attachments: [],
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

const me = { data: { username: "wanjiru-kamau", display_name: "Someone", bio: null, roles: [], technologies: [] } };

// Answers each "METHOD /path" by its longest matching start; anything else is a mistake.
function api(own: Record<string, unknown>) {
  const routes: Record<string, unknown> = { "GET /v1/me": me, ...own };
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

const uploaded = (n: number) => reply(201, { data: image(n) });
const requests = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method).length;
const uploadCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/v1/uploads") && init?.method === "POST");
const uploadedNames = () => uploadCalls().map(([, init]) => ((init.body as FormData).get("file") as File).name);

// Answers the uploads one by one, in the order they come, and anything else as `api` was told to.
function answerUploads(...answers: (Response | Promise<Response>)[]) {
  const rest = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    String(url).endsWith("/v1/uploads") && init?.method === "POST" ? Promise.resolve(answers.shift()!) : rest(url, init),
  );
}

const file = (name: string, type = "image/png", size = 1000) => {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
};
const choose = (label: string, ...picked: File[]) => fireEvent.change(screen.getByLabelText(label), { target: { files: picked } });
const typeInto = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const removers = () => screen.queryAllByRole("button", { name: /^Remove (?!image \d)/ }).map((button) => button.getAttribute("aria-label"));
const edit = (attachments: unknown[], over: Record<string, unknown> = {}) => {
  nav.search = "id=post-1";
  api({ "GET /v1/posts/post-1": { data: post({ attachments }) }, ...over });
  return render(<PostComposer lang="en" />);
};

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn((made: Blob) => `blob:${(made as File).name}`);
  URL.revokeObjectURL = vi.fn();
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

// ---------- choosing ----------

test("the form offers a labelled file input for JPEG, PNG and WebP, several at a time", () => {
  api({});
  render(<PostComposer lang="en" />);
  const input = screen.getByLabelText("Add images") as HTMLInputElement;
  expect(input.type).toBe("file");
  expect(input.multiple).toBe(true);
  expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  expect(screen.getByText("JPEG, PNG or WebP, up to 4 MB each. A post can have 10 images.")).toBeTruthy();
  expect(input.getAttribute("aria-describedby")).toBe("post-images-help");
});

test("a file of the wrong type or over 4 MB is refused by name and the others are kept", () => {
  api({});
  render(<PostComposer lang="en" />);
  choose("Add images", file("loop.gif", "image/gif"), file("huge.jpg", "image/jpeg", 4 * MB + 1), file("exact.webp", "image/webp", 4 * MB), file("map.png"));
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    "loop.gif was not added. Only JPEG, PNG and WebP images can be uploaded.",
    "huge.jpg was not added. It is over 4 MB.",
  ]);
  expect(removers()).toEqual(["Remove exact.webp", "Remove map.png"]);
  // the next choice replaces the sentences
  choose("Add images", file("more.png"));
  expect(screen.queryByRole("alert")).toBeNull();
});

test("an eleventh image is refused", () => {
  api({});
  render(<PostComposer lang="en" />);
  choose("Add images", ...Array.from({ length: 11 }, (_, n) => file(`p${n + 1}.png`)));
  expect(removers()).toHaveLength(10);
  expect(screen.getByRole("alert").textContent).toBe("p11.png was not added. A post can have 10 images at most.");
});

test("the ten counts the images the post already has", async () => {
  edit(Array.from({ length: 9 }, (_, n) => image(n + 1)));
  await screen.findByRole("heading", { level: 1 });
  choose("Add images", file("a.png"), file("b.png"));
  expect(removers()).toContain("Remove a.png");
  expect(removers()).not.toContain("Remove b.png");
  expect(screen.getByRole("alert").textContent).toBe("b.png was not added. A post can have 10 images at most.");
});

test("each chosen file has a thumbnail and a remove button that frees it and moves the focus on", () => {
  api({});
  render(<PostComposer lang="en" />);
  choose("Add images", file("one.png"), file("two.png"), file("three.png"));
  expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Remove one.png" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one.png");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove two.png" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove three.png" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove two.png" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove two.png" }));
  expect(removers()).toHaveLength(0);
  expect(document.activeElement).toBe(screen.getByLabelText("Add images"));
});

test("thumbnails are freed when the form goes away", () => {
  api({});
  render(<PostComposer lang="en" />);
  choose("Add images", file("one.png"));
  cleanup();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one.png");
});

// ---------- sending ----------

test("the post is made first, then the images go up one after another in order, with their progress told", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-1" }) }) });
  let release: (response: Response) => void = () => {};
  answerUploads(uploaded(1), new Promise<Response>((resolve) => (release = resolve)), uploaded(3));
  render(<PostComposer lang="en" />);
  typeInto("Text", "With pictures");
  choose("Add images", file("a.png"), file("b.png"), file("c.png"));
  press("Publish");
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Uploading image 2 of 3"));
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url).replace("http://localhost:8000", ""))).toEqual([
    "/v1/posts",
    "/v1/uploads",
    "/v1/uploads",
  ]);
  release(uploaded(2));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=new-1&done=published"));
  expect(uploadedNames()).toEqual(["a.png", "b.png", "c.png"]);
  expect((uploadCalls()[0][1].body as FormData).get("post_id")).toBe("new-1");
  // the browser writes the content type, with the form's boundary
  expect(uploadCalls()[0][1].headers["Content-Type"]).toBeUndefined();
  expect(screen.getByRole("status").textContent).toBe("");
});

test("an image that fails keeps the post, stays in edit mode with the rest and offers a retry", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-2" }) }) });
  answerUploads(uploaded(1), refusal(413, "IMAGE_TOO_LARGE"), uploaded(3));
  render(<PostComposer lang="en" />);
  typeInto("Text", "With pictures");
  choose("Add images", file("a.png"), file("b.png"), file("c.png"));
  press("Publish");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Your post is published, but 1 image did not upload. Try again or leave it out. b.png is over 4 MB.");
  expect(nav.push).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Edit your post");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  expect(removers()).toEqual(["Remove b.png"]);
  expect(screen.getAllByRole("img", { name: /attached to this post/ })).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Leave it out" }).getAttribute("href")).toBe("/en/posts/view?id=new-2&done=published");
  // the retry sends only what is left, to the same post, and the post is not made again
  answerUploads(uploaded(4));
  press("Try again");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=new-2&done=published"));
  expect(uploadedNames()).toEqual(["a.png", "b.png", "c.png", "b.png"]);
  expect(requests("POST") - uploadCalls().length).toBe(1);
});

test.each([
  [refusal(422, "INVALID_IMAGE"), "b.png is not a JPEG, PNG or WebP image the server can read."],
  [refusal(422, "EMPTY_IMAGE"), "b.png is not a JPEG, PNG or WebP image the server can read."],
  [reply(413), "b.png is over 4 MB."],
  [refusal(409, "POST_IMAGE_LIMIT"), "A post can have 10 images at most, so b.png did not fit."],
  [refusal(403, "NOT_POST_AUTHOR"), "Only the author of a post can add images to it."],
  [refusal(404, "POST_NOT_FOUND"), "The post could not be found."],
  [reply(500), "b.png could not be sent. Check your connection and try again."],
])("an upload refused as %#, says why in words", async (answer, sentence) => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-3" }) }) });
  answerUploads(answer);
  render(<PostComposer lang="en" />);
  typeInto("Text", "With a picture");
  choose("Add images", file("b.png"));
  press("Publish");
  expect((await screen.findByRole("alert")).textContent).toContain(sentence);
});

test("a dropped connection on an upload says the same and keeps the file", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-4" }) }) });
  const rest = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    String(url).endsWith("/v1/uploads") ? Promise.reject(new TypeError("Failed to fetch")) : rest(url, init),
  );
  render(<PostComposer lang="en" />);
  typeInto("Text", "With a picture");
  choose("Add images", file("b.png"));
  press("Publish");
  expect((await screen.findByRole("alert")).textContent).toContain("Your post is published, but 1 image did not upload.");
  expect(removers()).toEqual(["Remove b.png"]);
});

// ---------- editing ----------

test("editing shows the post's images, removes one on request and adds more when saved", async () => {
  edit([image(1), image(2)], { "DELETE /v1/uploads/img-1": reply(204) });
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getAllByRole("img", { name: /attached to this post/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  await waitFor(() => expect(screen.getAllByRole("img", { name: /attached to this post/ })).toHaveLength(1));
  expect(requests("DELETE")).toBe(1);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove image 1" })));
  choose("Add images", file("new.webp", "image/webp"));
  answerUploads(uploaded(3));
  press("Save changes");
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/posts/view?id=post-1&done=saved"));
  expect(uploadedNames()).toEqual(["new.webp"]);
  expect((uploadCalls()[0][1].body as FormData).get("post_id")).toBe("post-1");
  // nothing was changed in the text, so the post itself is not sent again
  expect(requests("PATCH")).toBe(0);
});

test("an image that cannot be removed says so and stays in the list", async () => {
  edit([image(1)], { "DELETE /v1/uploads/img-1": reply(500) });
  await screen.findByRole("heading", { level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't remove the image. The post is unchanged, so try again.");
  expect(screen.getAllByRole("img", { name: /attached to this post/ })).toHaveLength(1);
});

test("an image the API no longer has leaves the list without a complaint", async () => {
  edit([image(1)], { "DELETE /v1/uploads/img-1": refusal(404, "IMAGE_NOT_FOUND") });
  await screen.findByRole("heading", { level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  await waitFor(() => expect(screen.queryAllByRole("img", { name: /attached to this post/ })).toHaveLength(0));
  expect(screen.queryByRole("alert")).toBeNull();
});

// ---------- the demo ----------

test("the demo's refusal of a new post says nothing was saved beside the button and sends no image", async () => {
  api({ "POST /v1/posts": refusal(403, "DEMO_READ_ONLY") });
  render(<PostComposer lang="en" />);
  typeInto("Text", "Keep me");
  choose("Add images", file("a.png"), file("b.png"));
  press("Publish");
  expect((await screen.findByText("Nothing was saved. The demo cannot be changed.")).getAttribute("role")).toBe("status");
  expect(uploadCalls()).toHaveLength(0);
  expect(removers()).toHaveLength(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("in the demo a refused removal, and a refused upload on an edit, say nothing was saved", async () => {
  edit([image(1)], { "DELETE /v1/uploads/img-1": refusal(403, "DEMO_READ_ONLY"), "POST /v1/uploads": refusal(403, "DEMO_READ_ONLY") });
  await screen.findByRole("heading", { level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  await screen.findByText("Nothing was saved. The demo cannot be changed.");
  expect(screen.getAllByRole("img", { name: /attached to this post/ })).toHaveLength(1);
  choose("Add images", file("a.png"), file("b.png"));
  press("Save changes");
  await waitFor(() => expect(uploadCalls()).toHaveLength(1));
  // the second file is not tried after the demo's refusal, and both are kept
  await waitFor(() => expect(screen.getAllByText("Nothing was saved. The demo cannot be changed.").length).toBeGreaterThan(0));
  expect(uploadCalls()).toHaveLength(1);
  expect(removers()).toContain("Remove b.png");
});

// ---------- French ----------

test("images are in French too: the field, the refusals, the progress and the partial failure", async () => {
  api({ "POST /v1/posts": reply(201, { data: post({ id: "new-5" }) }) });
  let release: (response: Response) => void = () => {};
  answerUploads(new Promise<Response>((resolve) => (release = resolve)), refusal(413, "IMAGE_TOO_LARGE"));
  render(<PostComposer lang="fr" />);
  expect(document.getElementById("post-images-help")!.textContent).toBe("JPEG, PNG ou WebP, 4 Mo au plus chacune. Une publication peut avoir 10 images.");
  typeInto("Texte", "Avec des images");
  choose("Ajouter des images", file("loop.gif", "image/gif"), file("a.png"), file("b.png"));
  expect(screen.getByRole("alert").textContent).toBe("Le fichier loop.gif n'a pas été ajouté. Seules les images JPEG, PNG et WebP sont acceptées.");
  expect(screen.getByRole("button", { name: "Retirer a.png" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Publier" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Envoi de l'image 1 sur 2"));
  release(uploaded(1));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Votre publication est en ligne, mais 1 image n'a pas été envoyée. Réessayez ou laissez-la de côté. Le fichier b.png dépasse 4 Mo.",
  );
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Laisser de côté" })).toBeTruthy();
});
