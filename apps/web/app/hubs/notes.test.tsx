import { Activity } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, fetchMock, hub, idea, owner, phasesAt, posted, refusal, saidNotSaved } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asMember = { viewer: { membership_status: "active", member_role: "member" } };
const asOutsider = { viewer: { membership_status: null, member_role: null } };
const asInvited = { viewer: { membership_status: "invited", member_role: "member" } };
// a hub the owner has confirmed, now at `phase`
const at = (phase: string, over: Record<string, unknown> = {}) => ({
  phase,
  team_confirmed_at: "2026-11-14T09:00:00Z",
  phases: phasesAt(phase),
  ...over,
});
const brainstorm = { ...asMember, ...at("brainstorm") };

// a note written three hours ago, so its date reads the same on any day
const note = (id: string, body: string, over: Record<string, unknown> = {}) => ({
  id,
  body,
  author: { id: "id-amina", username: "amina-ndiaye", display_name: "Amina Ndiaye", avatar_url: null, is_verified: false },
  created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  can_delete: false,
  ...over,
});
const list = (...data: unknown[]) => ({ data, next_offset: null });
const NOTES = "GET /v1/hubs/hub-1/notes?offset=0&limit=50";

async function open(over: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    [NOTES]: list(),
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const section = () => document.querySelector<HTMLElement>("section#brainstorm")!;
const ready = () => screen.findByRole("heading", { name: /^(Brainstorm notes|Notes de brainstorm)$/ });
const field = () => within(section()).getByRole<HTMLTextAreaElement>("textbox", { name: /^(A new note|Une nouvelle note)$/ });
const write = (value: string) => fireEvent.change(field(), { target: { value } });
const add = () => fireEvent.click(within(section()).getByRole("button", { name: "Add the note" }));
const cards = () => within(section()).queryAllByRole("listitem");
const requests = (method: string) => asked().filter((line) => line.startsWith(`${method} `));
const deleteButton = (name = "Delete the note by Amina Ndiaye") => within(section()).getByRole("button", { name });
const confirmDelete = () => fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this note?" })).getByRole("button", { name: "Delete the note" }));
const alertText = () => within(section()).getByRole("alert").textContent;
const gone = new Response(null, { status: 204 });

beforeEach(() => {
  nav.search = "";
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test.each([
  ["a member", brainstorm],
  ["the owner", { ...asOwner, ...at("brainstorm") }],
  ["a member after brainstorm", { ...asMember, ...at("build") }],
])("%s of a confirmed hub sees the notes", async (_who, over) => {
  await open(over, { [NOTES]: list(note("n-1", "Ask the borehole fitters first")) });
  await ready();
  expect(await within(section()).findByText("Ask the borehole fitters first")).toBeTruthy();
});

test.each([
  ["someone outside the hub", { ...asOutsider, ...at("brainstorm") }],
  ["someone who was only invited", { ...asInvited, ...at("brainstorm") }],
  ["a member before the team is confirmed", asMember],
  ["the owner before the team is confirmed", asOwner],
])("%s sees no notes and no request is made for them", async (_who, over) => {
  await open(over);
  await screen.findByRole("heading", { name: "Phases" });
  expect(section()).toBeNull();
  expect(asked().filter((line) => line.includes("/notes"))).toEqual([]);
});

test("a skeleton stands in while the notes load", async () => {
  let finish: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (finish = resolve));
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(brainstorm) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
  });
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    String(url).includes("/notes") ? pending : route(url, init),
  );
  render(<HubPage lang="en" />);
  expect((await screen.findByText("Getting the notes")).getAttribute("role")).toBe("status");
  finish(new Response(JSON.stringify(list(note("n-1", "First"))), { status: 200 }));
  await waitFor(() => expect(within(section()).getByText("First")).toBeTruthy());
  expect(within(section()).queryByText("Getting the notes")).toBeNull();
});

test("every page of the notes is read, oldest first, as plain text with the author and a date", async () => {
  await open(brainstorm, {
    [NOTES]: { data: [note("n-1", "First <b>idea</b>")], next_offset: 1 },
    "GET /v1/hubs/hub-1/notes?offset=1&limit=50": { data: [note("n-2", "Second idea", { author: { ...note("x", "").author, display_name: "Tendai Moyo" } })], next_offset: null },
  });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(cards().map((card) => card.textContent)).toEqual(["First <b>idea</b>Amina Ndiaye3 hours ago", "Second ideaTendai Moyo3 hours ago"]);
  expect(section().querySelector("b")).toBeNull();
  expect(requests("GET").filter((line) => line.includes("/notes"))).toHaveLength(2);
});

test("a note is added: the request, the new card at the end, the status line, the emptied field and the count", async () => {
  await open(brainstorm, {
    [NOTES]: list(note("n-1", "First")),
    "POST /v1/hubs/hub-1/notes": new Response(JSON.stringify({ data: note("n-2", "Reuse the SMS format", { can_delete: true }) }), { status: 201 }),
  });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(within(section()).getByText("Characters left: 280")).toBeTruthy();
  write("  Reuse the SMS format  ");
  expect(within(section()).getByText("Characters left: 260")).toBeTruthy();
  add();
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/notes", { body: "Reuse the SMS format" }]]));
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toContain("Your note was added."));
  expect(cards().map((card) => card.querySelector("p")?.textContent)).toEqual(["First", "Reuse the SMS format"]);
  expect(field().value).toBe("");
  expect(within(section()).getByText("Characters left: 280")).toBeTruthy();
  // no reload of the list
  expect(requests("GET").filter((line) => line.includes("/notes"))).toHaveLength(1);
});

test("an empty or too long note is caught before sending, with an error the field points to", async () => {
  await open(brainstorm);
  await ready();
  const textarea = await waitFor(field);
  add();
  expect(alertText()).toBe("Write a note before adding it.");
  expect(textarea.getAttribute("aria-describedby")).toContain(within(section()).getByRole("alert").id);
  expect(document.activeElement).toBe(textarea);
  write("   ");
  add();
  expect(alertText()).toBe("Write a note before adding it.");
  write("é".repeat(280));
  expect(within(section()).queryByRole("alert")).toBeNull();
  write("é".repeat(281));
  expect(within(section()).getByText("Characters left: -1")).toBeTruthy();
  add();
  expect(alertText()).toBe("A note can have at most 280 characters. Shorten it and try again.");
  expect(posted()).toEqual([]);
  // the error goes as soon as the text is fixed
  write("é".repeat(280));
  expect(within(section()).queryByRole("alert")).toBeNull();
});

test("the limit counts characters as people see them: 200 emoji fit, 281 do not", async () => {
  const many = "😀".repeat(200);
  await open(brainstorm, { "POST /v1/hubs/hub-1/notes": new Response(JSON.stringify({ data: note("n-1", many) }), { status: 201 }) });
  await ready();
  await waitFor(field);
  write(many);
  expect(within(section()).getByText("Characters left: 80")).toBeTruthy();
  add();
  expect(within(section()).queryByRole("alert")).toBeNull();
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/notes", { body: many }]]));
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toContain("Your note was added."));
  write("😀".repeat(281));
  expect(within(section()).getByText("Characters left: -1")).toBeTruthy();
  add();
  expect(alertText()).toBe("A note can have at most 280 characters. Shorten it and try again.");
  expect(posted()).toHaveLength(1);
});

test("Refresh does nothing while a note is on its way, so the new card shows once", async () => {
  let finish: (value: Response) => void = () => {};
  await open(brainstorm);
  await ready();
  await waitFor(field);
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? new Promise<Response>((resolve) => (finish = resolve)) : route(url, init),
  );
  write("One note");
  add();
  const refresh = within(section()).getByRole("button", { name: "Refresh" });
  await waitFor(() => expect(refresh.getAttribute("aria-disabled")).toBe("true"));
  fireEvent.click(refresh);
  expect(requests("GET").filter((line) => line.includes("/notes"))).toHaveLength(1);
  finish(new Response(JSON.stringify({ data: note("n-1", "One note") }), { status: 201 }));
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(refresh.getAttribute("aria-disabled")).toBeNull();
});

test("while a note is sent the button keeps its label, is busy and a second press sends nothing", async () => {
  let finish: (value: Response) => void = () => {};
  await open(brainstorm);
  await ready();
  await waitFor(field);
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? new Promise<Response>((resolve) => (finish = resolve)) : route(url, init),
  );
  write("One note");
  add();
  const button = within(section()).getByRole("button", { name: "Add the note" });
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  fireEvent.click(button);
  expect(posted()).toHaveLength(1);
  finish(new Response(JSON.stringify({ data: note("n-1", "One note") }), { status: 201 }));
  await waitFor(() => expect(within(section()).getByRole("status")).toBeTruthy());
});

test("what was typed stays when the request fails", async () => {
  await open(brainstorm, { "POST /v1/hubs/hub-1/notes": refusal(500, "INTERNAL") });
  await ready();
  await waitFor(field);
  write("Keep this text");
  add();
  await waitFor(() => expect(alertText()).toBe("We couldn't save that. Nothing changed, so try again."));
  expect(field().value).toBe("Keep this text");
  expect(cards()).toHaveLength(0);
});

test("the demo's refusal to add says nothing was saved as a status, with no alert, and keeps the text", async () => {
  await open(brainstorm, { "POST /v1/hubs/hub-1/notes": refusal(403, "DEMO_READ_ONLY") });
  await ready();
  await waitFor(field);
  write("A demo note");
  add();
  await waitFor(() => expect(posted()).toHaveLength(1));
  await waitFor(() => expect(within(section()).getByRole("button", { name: "Add the note" }).getAttribute("aria-busy")).toBeNull());
  await saidNotSaved(section());
  expect(field().value).toBe("A demo note");
});

test("the demo's refusal to delete says nothing was saved as a status, with no alert, and keeps the card", async () => {
  await open(brainstorm, { [NOTES]: list(note("n-1", "Mine", { can_delete: true })), "DELETE /v1/hubs/hub-1/notes/n-1": refusal(403, "DEMO_READ_ONLY") });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  fireEvent.click(deleteButton());
  confirmDelete();
  await waitFor(() => expect(requests("DELETE")).toHaveLength(1));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await saidNotSaved(section());
  expect(cards()).toHaveLength(1);
});

test.each(["PHASE_CLOSED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED"])(
  "%s on adding means the hub moved on: it is loaded again, the form goes and the page says so",
  async (code) => {
    await open(brainstorm, {
      "POST /v1/hubs/hub-1/notes": refusal(409, code),
      "GET /v1/hubs/hub-1": [{ data: hub(brainstorm) }, { data: hub({ ...asMember, ...at("design") }) }],
    });
    await ready();
    await waitFor(field);
    write("Too late");
    add();
    await waitFor(() => expect(alertText()).toBe("This hub has moved on, so notes can no longer be changed."));
    await waitFor(() => expect(within(section()).queryByRole("textbox")).toBeNull());
    expect(within(section()).getByText("Brainstorm is over. The notes stay here to read.")).toBeTruthy();
    expect(within(section()).queryByText("English text from the API")).toBeNull();
    // the button that was pressed is gone, so the line takes the focus
    await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("alert")));
  },
);

test("NOT_HUB_MEMBER loads the hub again, and the section goes with the membership", async () => {
  await open(brainstorm, {
    "POST /v1/hubs/hub-1/notes": refusal(403, "NOT_HUB_MEMBER"),
    "GET /v1/hubs/hub-1": [{ data: hub(brainstorm) }, { data: hub({ ...asOutsider, ...at("brainstorm") }) }],
  });
  await ready();
  await waitFor(field);
  write("Hello");
  add();
  await waitFor(() => expect(section()).toBeNull());
});

test("a full hub says so and keeps the form", async () => {
  await open(brainstorm, { "POST /v1/hubs/hub-1/notes": refusal(409, "NOTES_FULL") });
  await ready();
  await waitFor(field);
  write("One more");
  add();
  await waitFor(() => expect(alertText()).toBe("This hub has 200 notes, the most it can hold. Delete one to add another."));
  expect(field().value).toBe("One more");
});

test("only a card the person may delete has a button, named for the author, behind a dialog", async () => {
  await open(brainstorm, {
    [NOTES]: list(note("n-1", "Mine", { can_delete: true }), note("n-2", "Theirs", { author: { ...note("x", "").author, display_name: "Tendai Moyo" } })),
    "DELETE /v1/hubs/hub-1/notes/n-1": gone,
  });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).getAllByRole("button", { name: /^Delete the note by/ })).toHaveLength(1);
  fireEvent.click(deleteButton());
  const dialog = screen.getByRole("dialog", { name: "Delete this note?" });
  expect(within(dialog).getByText("The note is removed for everyone in the hub. This cannot be undone.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(requests("DELETE")).toEqual([]);
  fireEvent.click(deleteButton());
  confirmDelete();
  await waitFor(() => expect(requests("DELETE")).toEqual(["DELETE /v1/hubs/hub-1/notes/n-1"]));
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(within(section()).queryByText("Mine")).toBeNull();
  expect(within(section()).getByRole("status").textContent).toContain("The note was deleted.");
  // the card and its button are gone, so the line takes the focus
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("status")));
});

test("deleting a note that is already gone removes the card and says so", async () => {
  await open(brainstorm, { [NOTES]: list(note("n-1", "Mine", { can_delete: true })), "DELETE /v1/hubs/hub-1/notes/n-1": refusal(404, "NOTE_NOT_FOUND") });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  fireEvent.click(deleteButton());
  confirmDelete();
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toContain("That note was already deleted."));
  expect(cards()).toHaveLength(0);
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("status")));
});

test("a delete the API refuses for the author rule says who may delete, and the card stays", async () => {
  await open(brainstorm, { [NOTES]: list(note("n-1", "Mine", { can_delete: true })), "DELETE /v1/hubs/hub-1/notes/n-1": refusal(403, "NOT_NOTE_AUTHOR") });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  fireEvent.click(deleteButton());
  confirmDelete();
  await waitFor(() => expect(alertText()).toBe("Only the note's author or the hub's owner can delete it."));
  expect(cards()).toHaveLength(1);
});

test("a delete on a hub that moved on loads the hub again and says so", async () => {
  await open(brainstorm, {
    [NOTES]: list(note("n-1", "Mine", { can_delete: true })),
    "DELETE /v1/hubs/hub-1/notes/n-1": refusal(409, "PHASE_CLOSED"),
    "GET /v1/hubs/hub-1": [{ data: hub(brainstorm) }, { data: hub({ ...asMember, ...at("build") }) }],
  });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  fireEvent.click(deleteButton());
  confirmDelete();
  await waitFor(() => expect(alertText()).toBe("This hub has moved on, so notes can no longer be changed."));
  await waitFor(() => expect(within(section()).queryByRole("button", { name: /^Delete the note/ })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("alert")));
});

test.each([
  ["design", { ...asMember, ...at("design") }, "Brainstorm is over. The notes stay here to read."],
  ["build", { ...asOwner, ...at("build") }, "Brainstorm is over. The notes stay here to read."],
  ["review", { ...asMember, ...at("review") }, "Brainstorm is over. The notes stay here to read."],
  ["an archived hub", { ...asOwner, ...at("brainstorm"), status: "archived" }, "This hub is archived. The notes stay here to read."],
])("in %s the notes are for reading: no form, no delete buttons, one line says so", async (_name, over, line) => {
  await open(over, { [NOTES]: list(note("n-1", "Mine", { can_delete: true })) });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(within(section()).getByText(line)).toBeTruthy();
  expect(within(section()).queryByRole("textbox")).toBeNull();
  expect(within(section()).queryByRole("button", { name: /^Delete the note|^Add the note/ })).toBeNull();
});

test("the empty list says what is true for the phase", async () => {
  await open(brainstorm);
  await ready();
  expect(await within(section()).findByText("No notes yet. Write the first one.")).toBeTruthy();
  cleanup();
  await open({ ...asMember, ...at("design") });
  await ready();
  expect(await within(section()).findByText("No notes were written during brainstorm.")).toBeTruthy();
});

test("a list that cannot load says so with Try again, which loads it and says so", async () => {
  await open(brainstorm, { [NOTES]: [refusal(500, "INTERNAL"), list(note("n-1", "Back again"))] });
  await ready();
  await waitFor(() => expect(alertText()).toContain("We couldn't load the notes."));
  expect(within(section()).queryByRole("textbox")).toBeNull();
  fireEvent.click(within(section()).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(within(section()).getByText("Back again")).toBeTruthy());
  expect(within(section()).queryByRole("alert")).toBeNull();
  // Try again went away with the error, so the line takes the focus
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("status")));
  expect(within(section()).getByRole("status").textContent).toContain("The notes are up to date.");
});

test("Refresh reads the list again, keeps the focus on the button and says so", async () => {
  await open(brainstorm, { [NOTES]: [list(note("n-1", "First")), list(note("n-1", "First"), note("n-2", "Written elsewhere"))] });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  const refresh = within(section()).getByRole("button", { name: "Refresh" });
  refresh.focus();
  fireEvent.click(refresh);
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).getByRole("status").textContent).toContain("The notes are up to date.");
  expect(document.activeElement).toBe(refresh);
});

test("showing the page again reads the notes again and drops the line from the last visit", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(brainstorm) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    [NOTES]: [list(), list(note("n-9", "Written meanwhile"))],
    "POST /v1/hubs/hub-1/notes": new Response(JSON.stringify({ data: note("n-1", "Mine") }), { status: 201 }),
  });
  const page = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <HubPage lang="en" />
    </Activity>
  );
  const { rerender } = render(page("visible"));
  await ready();
  await waitFor(field);
  write("Mine");
  add();
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toContain("Your note was added."));
  rerender(page("hidden"));
  rerender(page("visible"));
  await waitFor(() => expect(within(section()).getByText("Written meanwhile")).toBeTruthy());
  expect(within(section()).queryByRole("status")).toBeNull();
});

test("in French the heading, the form, the dates, the dialog and the refusals are French", async () => {
  await open(
    { ...asMember, ...at("brainstorm") },
    { [NOTES]: list(note("n-1", "Première idée", { can_delete: true })), "POST /v1/hubs/hub-1/notes": refusal(409, "NOTES_FULL") },
    "fr",
  );
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(within(cards()[0]).getByText("Première idée")).toBeTruthy();
  expect(cards()[0].querySelector("time")?.textContent).toMatch(/^il y a 3\s+heures$/);
  expect(within(section()).getByText(/^Caractères restants\s: 280$/)).toBeTruthy();
  write("Une de plus");
  fireEvent.click(within(section()).getByRole("button", { name: "Ajouter la note" }));
  await waitFor(() => expect(alertText()).toBe("Cet espace compte 200 notes, le maximum possible. Supprimez-en une pour en ajouter une autre."));
  fireEvent.click(within(section()).getByRole("button", { name: "Supprimer la note écrite par Amina Ndiaye" }));
  expect(screen.getByRole("dialog", { name: "Supprimer cette note\u202f?" })).toBeTruthy();
  expect(within(section()).getByRole("button", { name: "Actualiser" })).toBeTruthy();
});
