import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, fetchMock, hub, idea, owner, phasesAt, refusal } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asMember = { viewer: { membership_status: "active", member_role: "member" } };
// a hub the owner has confirmed, now at `phase`
const at = (phase: string, over: Record<string, unknown> = {}) => ({
  phase,
  team_confirmed_at: "2026-11-14T09:00:00Z",
  phases: phasesAt(phase),
  ...over,
});
const inDesign = { ...asMember, ...at("design") };

const person = { id: "id-amina", username: "amina-ndiaye", display_name: "Amina Ndiaye", avatar_url: null, is_verified: false };
const piece = (id: string, name: string, summary = "", can_delete = false) => ({
  id,
  name,
  summary,
  created_by: person,
  created_at: "2026-11-14T10:00:00Z",
  updated_at: "2026-11-14T10:00:00Z",
  can_delete,
});
const link = (id: string, from: string, to: string, label: string, can_delete = false) => ({
  id,
  from_piece_id: from,
  to_piece_id: to,
  label,
  created_by: person,
  created_at: "2026-11-14T10:05:00Z",
  can_delete,
});
const sketch = (pieces: unknown[] = [], links: unknown[] = []) => ({ data: { pieces, links } });
const created = (data: unknown) => new Response(JSON.stringify({ data }), { status: 201 });
const done = () => new Response(null, { status: 204 });

const DESIGN = "GET /v1/hubs/hub-1/design";
const mobile = piece("p-1", "Mobile app", "Where agents approve payouts.", true);
const payouts = piece("p-2", "Payouts API", "Holds the rules.");
const sms = piece("p-3", "SMS gateway");
const starting = sketch([mobile, payouts], [link("l-1", "p-1", "p-2", "approves a batch", true)]);

async function open(over: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    [DESIGN]: sketch(),
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await screen.findByRole("heading", { name: /^(Design sketch|Schéma de conception)$/ });
  await waitFor(() => expect(within(section()).queryByText(/^(Getting the sketch|Chargement du schéma)$/)).toBeNull());
}

const section = () => document.querySelector<HTMLElement>("section#design")!;
const cards = () =>
  within(section())
    .queryAllByRole("heading", { level: 3 })
    .map((heading) => heading.closest("li"))
    .filter((card) => card !== null);
const card = (name: string) => within(section()).getByRole("heading", { level: 3, name }).closest("li")!;
const pieceForm = () => within(section()).getByRole("form", { name: /^(Add a piece|Ajouter un composant)$/ });
const linkForm = () => within(section()).getByRole("form", { name: /^(Add a link|Ajouter un lien)$/ });
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const click = (root: HTMLElement, name: string | RegExp) => fireEvent.click(within(root).getByRole("button", { name }));
const alertText = () => within(section()).getByRole("alert").textContent;
const statusLine = () => within(section()).getByRole("status");
const strip = (url: unknown) => String(url).replace("http://localhost:8000", "");
// the requests of one method, as [address, body or null]
const sent = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([url, init]) => [strip(url), init.body ? JSON.parse(init.body) : null]);
const reads = () => asked().filter((line) => line === DESIGN);
const choose = (name: string, id: string) => type(within(linkForm()).getByLabelText(name), id);
const options = (name: string) => within(within(linkForm()).getByLabelText(name)).getAllByRole("option").map((option) => option.textContent);
const hold = () => {
  let finish: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (finish = resolve));
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method && init.method !== "GET" ? pending : route(url, init)));
  return (value: Response) => finish(value);
};

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

test("a member in design sees every form and button, and the link form waits for a second piece", async () => {
  await open(inDesign, { [DESIGN]: sketch([mobile]) });
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(pieceForm()).toBeTruthy();
  expect(within(section()).queryByRole("form", { name: "Add a link" })).toBeNull();
  expect(within(card("Mobile app")).getByRole("button", { name: "Edit the piece Mobile app" }).textContent).toBe("Edit");
  cleanup();
  await open(inDesign, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(linkForm()).toBeTruthy();
  // an empty sketch can take its first piece
  cleanup();
  await open(inDesign);
  await waitFor(() => expect(within(section()).getByText("No pieces yet.")).toBeTruthy());
  expect(pieceForm()).toBeTruthy();
});

test.each([
  ["a member in build", { ...asMember, ...at("build") }],
  ["a member in review", { ...asMember, ...at("review") }],
  ["an archived hub", { ...asMember, ...at("design"), status: "archived" }],
])("%s cannot change the sketch: no form, no Edit, no Delete", async (_who, over) => {
  await open(over, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).queryByRole("form")).toBeNull();
  expect(within(section()).queryByRole("button", { name: /^(Edit|Delete)/ })).toBeNull();
});

test("a piece is added: the request, the new card and drawing, the emptied fields and the status line", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 768px)", addEventListener: () => {}, removeEventListener: () => {} }));
  await open(inDesign, { [DESIGN]: starting, "POST /v1/hubs/hub-1/pieces": created(piece("p-3", "<b>SMS</b> gateway", "Sends texts.", true)) });
  await waitFor(() => expect(cards()).toHaveLength(2));
  const form = within(pieceForm());
  expect(form.getByText("Characters left: 60")).toBeTruthy();
  expect(form.getByText("Characters left: 280")).toBeTruthy();
  type(form.getByLabelText("Name"), "  <b>SMS</b> gateway  ");
  type(form.getByLabelText("Summary"), "Sends texts.");
  expect(form.getByText("Characters left: 42")).toBeTruthy();
  expect(form.getByText("Characters left: 268")).toBeTruthy();
  click(pieceForm(), "Add the piece");
  await waitFor(() => expect(sent("POST")).toEqual([["/v1/hubs/hub-1/pieces", { name: "<b>SMS</b> gateway", summary: "Sends texts." }]]));
  await waitFor(() => expect(cards()).toHaveLength(3));
  expect(within(card("<b>SMS</b> gateway")).getByText("Sends texts.")).toBeTruthy();
  expect(section().querySelector("b")).toBeNull();
  expect(section().querySelector("svg[width]")?.textContent).toContain("<b>SMS</b> gateway");
  expect(statusLine().textContent).toContain("The piece was added.");
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  expect((form.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("");
  // the new piece is offered in the link form, and nothing was read again
  expect(options("From")).toEqual(["Choose a piece", "Mobile app", "Payouts API", "<b>SMS</b> gateway"]);
  expect(reads()).toHaveLength(1);
});

test("an empty or too long piece is caught before sending, with errors the fields point to", async () => {
  await open(inDesign);
  const form = within(pieceForm());
  click(pieceForm(), "Add the piece");
  const name = form.getByLabelText("Name");
  expect(alertText()).toBe("Give the piece a name.");
  expect(name.getAttribute("aria-describedby")).toContain(within(section()).getByRole("alert").id);
  expect(document.activeElement).toBe(name);
  type(name, "   ");
  click(pieceForm(), "Add the piece");
  expect(alertText()).toBe("Give the piece a name.");
  type(name, "A".repeat(61));
  type(form.getByLabelText("Summary"), "é".repeat(281));
  click(pieceForm(), "Add the piece");
  expect(within(section()).getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    "This can have at most 60 characters. Shorten it and try again.",
    "This can have at most 280 characters. Shorten it and try again.",
  ]);
  expect(sent("POST")).toEqual([]);
  // each error goes the moment its text is fixed
  type(name, "A".repeat(60));
  expect(within(section()).getAllByRole("alert")).toHaveLength(1);
  type(form.getByLabelText("Summary"), "");
  expect(within(section()).queryByRole("alert")).toBeNull();
});

test("a name that is taken is a field error, the text stays and the field has the focus", async () => {
  await open(inDesign, { "POST /v1/hubs/hub-1/pieces": refusal(409, "PIECE_NAME_TAKEN") });
  const form = within(pieceForm());
  type(form.getByLabelText("Name"), "Mobile app");
  type(form.getByLabelText("Summary"), "Keep me");
  click(pieceForm(), "Add the piece");
  await waitFor(() => expect(alertText()).toBe("Another piece already has this name."));
  expect(form.getByLabelText("Name").getAttribute("aria-describedby")).toContain(within(section()).getByRole("alert").id);
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Mobile app");
  expect((form.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("Keep me");
  expect(document.activeElement).toBe(form.getByLabelText("Name"));
  expect(within(section()).queryByRole("status")).toBeNull();
});

test("Edit turns the card into filled fields and Save sends only the name that changed", async () => {
  await open(inDesign, { [DESIGN]: starting, "PATCH /v1/hubs/hub-1/pieces/p-1": { data: piece("p-1", "Agent app", "Where agents approve payouts.", true) } });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Mobile app");
  expect((form.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("Where agents approve payouts.");
  type(form.getByLabelText("Name"), " Agent app ");
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toEqual([["/v1/hubs/hub-1/pieces/p-1", { name: "Agent app" }]]));
  await waitFor(() => expect(card("Agent app")).toBeTruthy());
  expect(within(card("Agent app")).getByText("To Payouts API: approves a batch")).toBeTruthy();
  expect(within(section()).queryByRole("form", { name: /^Edit/ })).toBeNull();
  expect(statusLine().textContent).toContain("The piece was saved.");
  // Save went away with the form, so the line takes the focus
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(reads()).toHaveLength(1);
});

test("only the summary is sent when only the summary changed, and nothing is sent when nothing changed", async () => {
  await open(inDesign, { [DESIGN]: starting, "PATCH /v1/hubs/hub-1/pieces/p-2": { data: piece("p-2", "Payouts API", "Holds the payout rules.") } });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Payouts API"), "Edit the piece Payouts API");
  const form = within(screen.getByRole("form", { name: "Edit the piece Payouts API" }));
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  expect(sent("PATCH")).toEqual([]);
  await waitFor(() => expect(within(card("Payouts API")).getByRole("button", { name: "Edit the piece Payouts API" })).toBeTruthy());
  click(card("Payouts API"), "Edit the piece Payouts API");
  type(within(screen.getByRole("form", { name: "Edit the piece Payouts API" })).getByLabelText("Summary"), "Holds the payout rules.");
  fireEvent.click(within(screen.getByRole("form", { name: "Edit the piece Payouts API" })).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toEqual([["/v1/hubs/hub-1/pieces/p-2", { summary: "Holds the payout rules." }]]));
  await waitFor(() => expect(within(card("Payouts API")).getByText("Holds the payout rules.")).toBeTruthy());
});

test("a piece cannot be saved with an empty name, and a taken name stays a field error", async () => {
  await open(inDesign, { [DESIGN]: starting, "PATCH /v1/hubs/hub-1/pieces/p-1": refusal(409, "PIECE_NAME_TAKEN") });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  type(form.getByLabelText("Name"), " ");
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  expect(alertText()).toBe("Give the piece a name.");
  expect(sent("PATCH")).toEqual([]);
  type(form.getByLabelText("Name"), "Payouts API");
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(alertText()).toBe("Another piece already has this name."));
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Payouts API");
});

test("Cancel puts the card back unchanged and returns the focus to its Edit button", async () => {
  await open(inDesign, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  type(form.getByLabelText("Name"), "Something else");
  fireEvent.click(form.getByRole("button", { name: "Cancel" }));
  expect(sent("PATCH")).toEqual([]);
  expect(card("Mobile app")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(within(card("Mobile app")).getByRole("button", { name: "Edit the piece Mobile app" })));
});

test("a field the person did not touch follows the piece when the sketch is read again", async () => {
  await open(inDesign, { [DESIGN]: [starting, sketch([piece("p-1", "Mobile app", "Rewritten elsewhere."), payouts])] });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  type(form.getByLabelText("Name"), "Agent app");
  fireEvent.click(within(section()).getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect((form.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("Rewritten elsewhere."));
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Agent app");
});

test("only a card the person may delete has Delete, behind a dialog, and the sketch is read again after it", async () => {
  await open(inDesign, {
    [DESIGN]: [starting, sketch([payouts])],
    "DELETE /v1/hubs/hub-1/pieces/p-1": done(),
  });
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).getAllByRole("button", { name: /^Delete the piece/ })).toHaveLength(1);
  expect(within(card("Payouts API")).queryByRole("button", { name: /^Delete/ })).toBeNull();
  click(card("Mobile app"), "Delete the piece Mobile app");
  const dialog = screen.getByRole("dialog", { name: "Delete this piece?" });
  expect(within(dialog).getByText("The piece and its links are removed for everyone in the hub. This cannot be undone.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(sent("DELETE")).toEqual([]);
  click(card("Mobile app"), "Delete the piece Mobile app");
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this piece?" })).getByRole("button", { name: "Delete the piece" }));
  await waitFor(() => expect(sent("DELETE")).toEqual([["/v1/hubs/hub-1/pieces/p-1", null]]));
  await waitFor(() => expect(cards()).toHaveLength(1));
  // its link went with it, from the other card too
  expect(within(card("Payouts API")).queryByText(/From Mobile app/)).toBeNull();
  expect(reads()).toHaveLength(2);
  expect(statusLine().textContent).toContain("The piece and its links were deleted.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
});

test("a link is added: the selects exclude each other, and the link shows in both cards and the drawing", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 768px)", addEventListener: () => {}, removeEventListener: () => {} }));
  await open(inDesign, {
    [DESIGN]: sketch([mobile, payouts, sms]),
    "POST /v1/hubs/hub-1/links": created(link("l-9", "p-3", "p-1", "sends a text", true)),
  });
  await waitFor(() => expect(cards()).toHaveLength(3));
  expect(options("From")).toEqual(["Choose a piece", "Mobile app", "Payouts API", "SMS gateway"]);
  choose("From", "p-3");
  expect(options("To")).toEqual(["Choose a piece", "Mobile app", "Payouts API"]);
  choose("To", "p-1");
  expect(options("From")).toEqual(["Choose a piece", "Payouts API", "SMS gateway"]);
  expect(within(linkForm()).getByText("Characters left: 60")).toBeTruthy();
  type(within(linkForm()).getByLabelText("Label"), " sends a text ");
  click(linkForm(), "Add the link");
  await waitFor(() => expect(sent("POST")).toEqual([["/v1/hubs/hub-1/links", { from_piece_id: "p-3", to_piece_id: "p-1", label: "sends a text" }]]));
  await waitFor(() => expect(within(card("SMS gateway")).getByText("To Mobile app: sends a text")).toBeTruthy());
  expect(within(card("Mobile app")).getByText("From SMS gateway: sends a text")).toBeTruthy();
  expect(section().querySelectorAll("svg[width] path")).toHaveLength(1);
  expect(statusLine().textContent).toContain("The link was added.");
  expect((within(linkForm()).getByLabelText("From") as HTMLSelectElement).value).toBe("");
  expect((within(linkForm()).getByLabelText("To") as HTMLSelectElement).value).toBe("");
  expect((within(linkForm()).getByLabelText("Label") as HTMLInputElement).value).toBe("");
  expect(reads()).toHaveLength(1);
});

test("a link needs two pieces and a label of 1 to 60 characters, and the errors point to their fields", async () => {
  await open(inDesign, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(linkForm(), "Add the link");
  expect(within(section()).getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    "Choose the piece the link starts from.",
    "Choose the piece the link goes to.",
    "Write a few words on what the link is for.",
  ]);
  const from = within(linkForm()).getByLabelText("From");
  expect(from.getAttribute("aria-describedby")).toContain(within(linkForm()).getAllByRole("alert")[0].id);
  expect(document.activeElement).toBe(from);
  choose("From", "p-1");
  choose("To", "p-2");
  expect(within(section()).getAllByRole("alert")).toHaveLength(1);
  type(within(linkForm()).getByLabelText("Label"), "x".repeat(61));
  click(linkForm(), "Add the link");
  expect(alertText()).toBe("This can have at most 60 characters. Shorten it and try again.");
  expect(sent("POST")).toEqual([]);
});

test("a link that already exists says so with the two names, and keeps what was typed", async () => {
  await open(inDesign, { [DESIGN]: starting, "POST /v1/hubs/hub-1/links": refusal(409, "LINK_EXISTS") });
  await waitFor(() => expect(cards()).toHaveLength(2));
  choose("From", "p-1");
  choose("To", "p-2");
  type(within(linkForm()).getByLabelText("Label"), "again");
  click(linkForm(), "Add the link");
  await waitFor(() => expect(alertText()).toBe("There is already a link from Mobile app to Payouts API."));
  expect((within(linkForm()).getByLabelText("Label") as HTMLInputElement).value).toBe("again");
  expect((within(linkForm()).getByLabelText("From") as HTMLSelectElement).value).toBe("p-1");
});

test("a link has one delete button, on its outgoing line, named for the two pieces and behind a dialog", async () => {
  await open(inDesign, {
    [DESIGN]: starting,
    "DELETE /v1/hubs/hub-1/links/l-1": done(),
  });
  await waitFor(() => expect(cards()).toHaveLength(2));
  const name = "Delete the link from Mobile app to Payouts API";
  expect(within(section()).getAllByRole("button", { name: /^Delete the link/ })).toHaveLength(1);
  expect(within(card("Payouts API")).queryByRole("button", { name: /^Delete the link/ })).toBeNull();
  click(card("Mobile app"), name);
  const dialog = screen.getByRole("dialog", { name: "Delete this link?" });
  expect(within(dialog).getByText("The link is removed for everyone in the hub. This cannot be undone.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(sent("DELETE")).toEqual([]);
  click(card("Mobile app"), name);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this link?" })).getByRole("button", { name: "Delete the link" }));
  await waitFor(() => expect(sent("DELETE")).toEqual([["/v1/hubs/hub-1/links/l-1", null]]));
  await waitFor(() => expect(within(card("Mobile app")).queryByText(/approves a batch/)).toBeNull());
  expect(within(card("Payouts API")).queryByText(/approves a batch/)).toBeNull();
  expect(statusLine().textContent).toContain("The link was deleted.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
});

test("a link the person did not make has no delete button", async () => {
  await open(inDesign, { [DESIGN]: sketch([mobile, payouts], [link("l-1", "p-1", "p-2", "approves a batch")]) });
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).queryByRole("button", { name: /^Delete the link/ })).toBeNull();
});

test.each([
  ["a full sketch of pieces", "PIECES_FULL", 409, "This sketch has 30 pieces, the most it can hold. Delete one to add another."],
  ["a full sketch of links", "LINKS_FULL", 409, "This sketch has 60 links, the most it can hold. Delete one to add another."],
  ["anything else", "INTERNAL", 500, "We couldn't save that. Nothing changed, so try again."],
])("%s is a sentence in the page's language and the text stays", async (_name, code, status, text) => {
  await open(inDesign, { [DESIGN]: starting, "POST /v1/hubs/hub-1/pieces": refusal(status, code), "POST /v1/hubs/hub-1/links": refusal(status, code) });
  await waitFor(() => expect(cards()).toHaveLength(2));
  type(within(pieceForm()).getByLabelText("Name"), "Keep this");
  click(pieceForm(), "Add the piece");
  await waitFor(() => expect(alertText()).toBe(text));
  expect((within(pieceForm()).getByLabelText("Name") as HTMLInputElement).value).toBe("Keep this");
  choose("From", "p-1");
  choose("To", "p-2");
  type(within(linkForm()).getByLabelText("Label"), "keep");
  click(linkForm(), "Add the link");
  await waitFor(() => expect(sent("POST")).toHaveLength(2));
  await waitFor(() => expect(within(linkForm()).getByRole("button", { name: "Add the link" }).getAttribute("aria-busy")).toBeNull());
  expect(alertText()).toBe(text);
  expect((within(linkForm()).getByLabelText("Label") as HTMLInputElement).value).toBe("keep");
  expect(screen.queryByText("English text from the API")).toBeNull();
});

test.each([
  ["a piece", "NOT_PIECE_AUTHOR", "DELETE /v1/hubs/hub-1/pieces/p-1", "Delete the piece Mobile app", "Delete the piece"],
  ["a link", "NOT_LINK_AUTHOR", "DELETE /v1/hubs/hub-1/links/l-1", "Delete the link from Mobile app to Payouts API", "Delete the link"],
])("a refused delete of %s says who may delete and keeps the card", async (_name, code, route, button, confirm) => {
  await open(inDesign, { [DESIGN]: starting, [route]: refusal(403, code) });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), button);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: confirm }));
  await waitFor(() => expect(alertText()).toBe("Only the person who added it, or the hub's owner, can delete it."));
  expect(cards()).toHaveLength(2);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test.each([
  ["a piece deleted meanwhile", "DELETE /v1/hubs/hub-1/pieces/p-1", "PIECE_NOT_FOUND", "Delete the piece Mobile app", "Delete the piece"],
  ["a link deleted meanwhile", "DELETE /v1/hubs/hub-1/links/l-1", "LINK_NOT_FOUND", "Delete the link from Mobile app to Payouts API", "Delete the link"],
])("%s loads the sketch again and says it changed", async (_name, route, code, button, confirm) => {
  await open(inDesign, { [DESIGN]: [starting, sketch([payouts, sms])], [route]: refusal(404, code) });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), button);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: confirm }));
  await waitFor(() => expect(alertText()).toBe("Someone else changed the sketch. This is how it stands now."));
  await waitFor(() => expect(within(section()).getByRole("heading", { level: 3, name: "SMS gateway" })).toBeTruthy());
  expect(reads()).toHaveLength(2);
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("alert")));
});

test("a piece edited after it was deleted elsewhere loads the sketch again", async () => {
  await open(inDesign, { [DESIGN]: [starting, sketch([payouts])], "PATCH /v1/hubs/hub-1/pieces/p-1": refusal(404, "PIECE_NOT_FOUND") });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  type(form.getByLabelText("Name"), "Agent app");
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(alertText()).toBe("Someone else changed the sketch. This is how it stands now."));
  await waitFor(() => expect(cards()).toHaveLength(1));
});

test.each([
  ["PHASE_CLOSED", 409],
  ["PHASE_NOT_STARTED", 409],
  ["TEAM_NOT_CONFIRMED", 409],
  ["HUB_ARCHIVED", 409],
  ["NOT_HUB_MEMBER", 403],
])("%s means the hub moved on: it is loaded again, the forms go and the line says so", async (code, status) => {
  await open(inDesign, {
    [DESIGN]: starting,
    "POST /v1/hubs/hub-1/pieces": refusal(status, code),
    "GET /v1/hubs/hub-1": [{ data: hub(inDesign) }, { data: hub({ ...asMember, ...at("build") }) }],
  });
  await waitFor(() => expect(cards()).toHaveLength(2));
  type(within(pieceForm()).getByLabelText("Name"), "Too late");
  click(pieceForm(), "Add the piece");
  await waitFor(() => expect(alertText()).toBe("This hub has moved on, so the sketch can no longer be changed."));
  await waitFor(() => expect(within(section()).queryByRole("form")).toBeNull());
  expect(within(section()).getByText("Design and architecture is over. The sketch stays here to read.")).toBeTruthy();
  expect(within(section()).queryByRole("button", { name: /^(Edit|Delete)/ })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("alert")));
});

test("a hub that moved on while a delete was asked about says so", async () => {
  await open(inDesign, {
    [DESIGN]: starting,
    "DELETE /v1/hubs/hub-1/links/l-1": refusal(409, "PHASE_CLOSED"),
    "GET /v1/hubs/hub-1": [{ data: hub(inDesign) }, { data: hub({ ...asMember, ...at("build") }) }],
  });
  await waitFor(() => expect(cards()).toHaveLength(2));
  click(card("Mobile app"), "Delete the link from Mobile app to Payouts API");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete the link" }));
  await waitFor(() => expect(alertText()).toBe("This hub has moved on, so the sketch can no longer be changed."));
  await waitFor(() => expect(within(section()).queryByRole("button", { name: /^Delete/ })).toBeNull());
});

test("the demo's refusal adds no message of its own, keeps the text and keeps the cards", async () => {
  await open(inDesign, {
    [DESIGN]: starting,
    "POST /v1/hubs/hub-1/pieces": refusal(403, "DEMO_READ_ONLY"),
    "PATCH /v1/hubs/hub-1/pieces/p-1": refusal(403, "DEMO_READ_ONLY"),
    "DELETE /v1/hubs/hub-1/pieces/p-1": refusal(403, "DEMO_READ_ONLY"),
  });
  await waitFor(() => expect(cards()).toHaveLength(2));
  type(within(pieceForm()).getByLabelText("Name"), "Demo piece");
  click(pieceForm(), "Add the piece");
  await waitFor(() => expect(sent("POST")).toHaveLength(1));
  await waitFor(() => expect(within(pieceForm()).getByRole("button", { name: "Add the piece" }).getAttribute("aria-busy")).toBeNull());
  expect((within(pieceForm()).getByLabelText("Name") as HTMLInputElement).value).toBe("Demo piece");
  click(card("Mobile app"), "Edit the piece Mobile app");
  const form = within(screen.getByRole("form", { name: "Edit the piece Mobile app" }));
  type(form.getByLabelText("Name"), "Demo edit");
  fireEvent.click(form.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
  await waitFor(() => expect(form.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull());
  expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Demo edit");
  fireEvent.click(form.getByRole("button", { name: "Cancel" }));
  click(card("Mobile app"), "Delete the piece Mobile app");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete the piece" }));
  await waitFor(() => expect(sent("DELETE")).toHaveLength(1));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(within(section()).queryByRole("alert")).toBeNull();
  expect(within(section()).queryByRole("status")).toBeNull();
  expect(cards()).toHaveLength(2);
});

test("while a piece is sent the button keeps its label, is busy and a second press sends nothing", async () => {
  await open(inDesign);
  const finish = hold();
  type(within(pieceForm()).getByLabelText("Name"), "One piece");
  click(pieceForm(), "Add the piece");
  const button = within(pieceForm()).getByRole("button", { name: "Add the piece" });
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  fireEvent.click(button);
  fireEvent.submit(pieceForm());
  expect(sent("POST")).toHaveLength(1);
  finish(created(piece("p-1", "One piece")));
  await waitFor(() => expect(statusLine().textContent).toContain("The piece was added."));
  expect(button.getAttribute("aria-busy")).toBeNull();
});

test("Refresh does nothing while a link is on its way, so the new link shows once", async () => {
  await open(inDesign, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  const finish = hold();
  choose("From", "p-2");
  choose("To", "p-1");
  type(within(linkForm()).getByLabelText("Label"), "returns the status");
  click(linkForm(), "Add the link");
  const refresh = within(section()).getByRole("button", { name: "Refresh" });
  await waitFor(() => expect(refresh.getAttribute("aria-disabled")).toBe("true"));
  fireEvent.click(refresh);
  expect(reads()).toHaveLength(1);
  finish(created(link("l-2", "p-2", "p-1", "returns the status", true)));
  await waitFor(() => expect(within(card("Payouts API")).getByText("To Mobile app: returns the status")).toBeTruthy());
  expect(refresh.getAttribute("aria-disabled")).toBeNull();
  expect(reads()).toHaveLength(1);
});

test("a change is not sent while the sketch is being read again", async () => {
  await open(inDesign, { [DESIGN]: [starting, starting] });
  await waitFor(() => expect(cards()).toHaveLength(2));
  const route = fetchMock.getMockImplementation()!;
  let finish: (value: Response) => void = () => {};
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "GET" && strip(url).endsWith("/design") && reads().length > 1 ? new Promise<Response>((resolve) => (finish = resolve)) : route(url, init),
  );
  fireEvent.click(within(section()).getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(reads()).toHaveLength(2));
  type(within(pieceForm()).getByLabelText("Name"), "Early");
  click(pieceForm(), "Add the piece");
  expect(sent("POST")).toEqual([]);
  finish(new Response(JSON.stringify(starting), { status: 200 }));
  await waitFor(() => expect(statusLine().textContent).toContain("The sketch is up to date."));
});

test("the buttons that send show they wait while the sketch is being read again", async () => {
  await open(inDesign, { [DESIGN]: [starting, starting] });
  await waitFor(() => expect(cards()).toHaveLength(2));
  const route = fetchMock.getMockImplementation()!;
  let finish: (value: Response) => void = () => {};
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "GET" && strip(url).endsWith("/design") && reads().length > 1 ? new Promise<Response>((resolve) => (finish = resolve)) : route(url, init),
  );
  const add = within(pieceForm()).getByRole("button", { name: "Add the piece" });
  const addLink = within(linkForm()).getByRole("button", { name: "Add the link" });
  expect(add.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(within(section()).getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(add.getAttribute("aria-disabled")).toBe("true"));
  expect(addLink.getAttribute("aria-disabled")).toBe("true");
  click(card("Mobile app"), "Edit the piece Mobile app");
  const save = within(section()).getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  finish(new Response(JSON.stringify(starting), { status: 200 }));
  await waitFor(() => expect(add.getAttribute("aria-disabled")).toBeNull());
  expect(addLink.getAttribute("aria-disabled")).toBeNull();
  expect(save.getAttribute("aria-disabled")).toBeNull();
});

test("in English the intro says any member can add a piece or correct one", async () => {
  await open(inDesign, { [DESIGN]: starting });
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).getByText("This is the team's sketch of the system: its pieces and how they talk. Any member can add a piece or correct one.")).toBeTruthy();
});

test("in French the intro, the forms, the dialogs and the refusals are French", async () => {
  await open(inDesign, { [DESIGN]: starting, "POST /v1/hubs/hub-1/links": refusal(409, "LINK_EXISTS") }, "fr");
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(section().textContent).toContain("Chaque membre peut ajouter un composant ou en corriger un.");
  const form = within(pieceForm());
  expect(form.getByLabelText("Nom")).toBeTruthy();
  expect(form.getByLabelText("Résumé")).toBeTruthy();
  expect(form.getByText(/^Caractères restants\s: 60$/)).toBeTruthy();
  click(pieceForm(), "Ajouter le composant");
  expect(alertText()).toBe("Donnez un nom au composant.");
  type(form.getByLabelText("Nom"), "Nouveau");
  choose("De", "p-1");
  choose("Vers", "p-2");
  type(within(linkForm()).getByLabelText("Libellé"), "encore");
  click(linkForm(), "Ajouter le lien");
  await waitFor(() => expect(alertText()).toBe("Il existe déjà un lien de Mobile app vers Payouts API."));
  click(card("Mobile app"), "Supprimer le composant Mobile app");
  expect(screen.getByRole("dialog", { name: "Supprimer ce composant\u202f?" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }));
  click(card("Mobile app"), "Supprimer le lien de Mobile app vers Payouts API");
  expect(screen.getByRole("dialog", { name: "Supprimer ce lien\u202f?" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }));
  click(card("Mobile app"), "Modifier le composant Mobile app");
  expect(within(section()).getByRole("button", { name: "Enregistrer" })).toBeTruthy();
});
