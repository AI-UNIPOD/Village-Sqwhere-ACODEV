import { Activity } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, fetchMock, hub, idea, owner, phasesAt, refusal, reply } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asMember = { viewer: { membership_status: "active", member_role: "member" } };
const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asOutsider = { viewer: { membership_status: null, member_role: null } };
// a hub the owner has confirmed, now at `phase`
const at = (phase: string, over: Record<string, unknown> = {}) => ({
  phase,
  team_confirmed_at: "2026-11-14T09:00:00Z",
  phases: phasesAt(phase),
  ...over,
});
const inReview = { ...asMember, ...at("review") };
const ownerInReview = { ...asOwner, ...at("review") };
const FINISHED = "2026-11-15T12:00:00Z";

const person = (username: string, display_name: string) => ({ id: `id-${username}`, username, display_name, avatar_url: null, is_verified: false });
const me = person("amina-ndiaye", "Amina Ndiaye");
const kwabena = person("kwabena-owusu", "Kwabena Ɔwusu");
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

// a check nobody has ticked, which the viewer may tick; `over` changes it
const check = (id: string, text: string, over: Record<string, unknown> = {}) => ({
  id,
  text,
  created_by: kwabena,
  created_at: ago(30),
  ticked_by: null,
  ticked_at: null,
  can_tick: true,
  can_untick: false,
  can_delete: false,
  ...over,
});
const tickedBy = (who: ReturnType<typeof person>, over: Record<string, unknown> = {}) => ({
  ticked_by: who,
  ticked_at: ago(3),
  can_tick: false,
  ...over,
});
const piece = (id: string, name: string, summary: string, claimed_by: ReturnType<typeof person> | null, checks: unknown[] = []) => ({
  id,
  name,
  summary,
  claimed_by,
  checks,
});
// the checklist as the API answers it; `open_checks` follows the pieces
const sheet = (pieces: ReturnType<typeof piece>[], over: Record<string, unknown> = {}) => ({
  data: {
    finished_at: null,
    can_add: true,
    can_finish: false,
    open_checks: pieces.flatMap((one) => one.checks as { ticked_by: unknown }[]).filter((one) => !one.ticked_by).length,
    pieces,
    ...over,
  },
});

const rejects = check("c-1", "Rejects a negative amount", { created_by: me, can_delete: true });
const receipt = check("c-2", "Sends a receipt", tickedBy(me, { can_untick: true }));
const offline = check("c-3", "Opens offline", { created_by: me, can_tick: false, can_delete: true });
const payouts = piece("p-1", "Payouts API", "Holds the rules.", kwabena, [rejects, receipt]);
const mobile = piece("p-2", "Mobile app", "", me, [offline]);
const gateway = piece("p-3", "SMS gateway", "", null);
const done = () => new Response(null, { status: 204 });
const unprocessable = () => new Response(JSON.stringify({ detail: [{ loc: ["body", "text"], msg: "no", type: "value_error" }] }), { status: 422 });

const REVIEW = "GET /v1/hubs/hub-1/review";

async function open(over: Record<string, unknown>, review: unknown = sheet([payouts, mobile, gateway]), routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en", demo = false) {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, is_demo: demo, roles: [], technologies: [], feed_topics: [], sectors: [] } },
    [REVIEW]: review,
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await screen.findByRole("heading", { level: 2, name: /^(Review and test|Revue et tests)$/ });
  await waitFor(() => expect(within(section()).queryByText(/^(Getting the checklist|Chargement de la liste de vérification)$/)).toBeNull());
}

const section = () => document.querySelector<HTMLElement>("section#review")!;
const phases = () => document.querySelector<HTMLElement>("section#phases")!;
const block = (name: string) => within(section()).getByRole("heading", { level: 3, name }).closest("li")!;
const row = (text: string) => within(section()).getByText(text).closest("li")!;
const press = (root: HTMLElement, name: string | RegExp) => fireEvent.click(within(root).getByRole("button", { name }));
const labels = (root: HTMLElement) => within(root).queryAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
const statusLine = () => within(section()).getByRole("status");
const alertLine = () => within(section()).getByRole("alert");
const strip = (url: unknown) => String(url).replace("http://localhost:8000", "");
// the requests of one method, as [address, body or null]
const sent = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method).map(([url, init]) => [strip(url), init.body ? JSON.parse(init.body) : null]);
const reads = () => asked().filter((line) => line === REVIEW);
const hubReads = () => asked().filter((line) => line === "GET /v1/hubs/hub-1");
const field = (name: string) => within(section()).getByLabelText<HTMLTextAreaElement>(new RegExp(`^(Add a check|Ajouter une vérification) (for|pour) ${name}$`));
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const confirm = (title: string, label: string) => fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: label }));

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

// ---------- who sees the checklist ----------

test.each([
  ["a member in review", inReview],
  ["the owner in review", ownerInReview],
])("%s sees the checklist", async (_who, over) => {
  await open(over);
  expect(reads()).toHaveLength(1);
  expect(within(section()).getAllByRole("heading", { level: 3 })).toHaveLength(3);
});

test.each([
  ["a member in brainstorm", { ...asMember, ...at("brainstorm") }],
  ["a member in design", { ...asMember, ...at("design") }],
  ["a member in build", { ...asMember, ...at("build") }],
  ["a member before the team is confirmed", asMember],
  ["someone outside the hub, in review", { ...asOutsider, ...at("review") }],
  ["someone invited, in review", { viewer: { membership_status: "invited", member_role: "member" }, ...at("review") }],
])("%s sees no checklist, and no request is made for it", async (_who, over) => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
  });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await screen.findByRole("heading", { level: 2, name: "Phases" });
  expect(document.querySelector("#review")).toBeNull();
  expect(asked().filter((line) => line.includes("/review"))).toEqual([]);
});

test("the section follows the build tab, under the same page", async () => {
  await open(inReview);
  expect(section().previousElementSibling?.id).toBe("build");
});

test("the line under the heading says where things stand: writing, archived and finished", async () => {
  await open(inReview);
  expect(within(section()).getByText("Write what a teammate should read or try on each piece. A teammate ticks each check, and the owner finishes the hub once every check is ticked.")).toBeTruthy();
  cleanup();
  await open({ ...inReview, status: "archived" }, sheet([payouts], { can_add: false }));
  expect(within(section()).getByText("This hub is archived. The checklist stays here to read.")).toBeTruthy();
  cleanup();
  await open({ ...inReview, finished_at: FINISHED }, sheet([payouts], { finished_at: FINISHED, can_add: false }));
  expect(within(section()).getByText("This hub was finished on November 15, 2026. The checklist stays here to read.")).toBeTruthy();
});

test("while the checklist loads there is a status and no list, and a failed load offers Try again", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(inReview) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, roles: [], technologies: [] } },
    [REVIEW]: [refusal(500, "BOOM"), sheet([payouts])],
  });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 2, name: "Review and test" });
  expect(await within(section()).findByText("We couldn't load the checklist. Nothing was changed, so check your connection and try again.")).toBeTruthy();
  press(section(), "Try again");
  await within(section()).findByRole("heading", { level: 3, name: "Payouts API" });
  // Try again went away with the error, so the line that says so has the focus
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(statusLine().textContent).toBe("The checklist is up to date.");
});

test("a hub that moved on before the checklist loaded shows no checklist", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": [{ data: hub(inReview) }, { data: hub({ ...asMember, ...at("design") }) }],
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    [REVIEW]: refusal(409, "PHASE_NOT_STARTED"),
  });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await waitFor(() => expect(hubReads()).toHaveLength(2));
  await waitFor(() => expect(document.querySelector("#review")).toBeNull());
});

// ---------- pieces and checks ----------

test("each piece says who built it, and a piece the viewer built says once that a teammate ticks its checks", async () => {
  await open(inReview);
  expect(block("Payouts API").textContent).toContain("Kwabena Ɔwusu built this");
  expect(block("Mobile app").textContent).toContain("You built this");
  expect(block("SMS gateway").textContent).toContain("Nobody claimed this piece");
  expect(within(section()).getAllByText("A teammate ticks the checks on your piece.")).toHaveLength(1);
  expect(block("Mobile app").textContent).toContain("A teammate ticks the checks on your piece.");
  expect(block("Payouts API").textContent).toContain("Holds the rules.");
  expect(block("SMS gateway").textContent).toContain("No checks yet.");
});

test("a check says its text, who added it and whether it is ticked, in words", async () => {
  await open(inReview);
  const list = within(block("Payouts API")).getAllByRole("listitem");
  expect(list).toHaveLength(2);
  expect(list[0].textContent).toContain("Rejects a negative amount");
  expect(list[0].textContent).toContain("Added by Amina Ndiaye");
  expect(list[0].textContent).toContain("Not ticked yet");
  expect(list[1].textContent).toContain("Added by Kwabena Ɔwusu");
  expect(list[1].textContent).toContain("Ticked by Amina Ndiaye, 3 hours ago");
});

test("the buttons come from the flags, and each name says which check", async () => {
  await open(inReview);
  expect(labels(row("Rejects a negative amount"))).toEqual(["Tick the check: Rejects a negative amount", "Delete the check: Rejects a negative amount"]);
  expect(labels(row("Sends a receipt"))).toEqual(["Untick the check: Sends a receipt"]);
  // the piece the viewer built: the API says no to a tick, so there is none
  expect(labels(row("Opens offline"))).toEqual(["Delete the check: Opens offline"]);
  expect(within(row("Rejects a negative amount")).getByText("Tick").tagName).toBe("BUTTON");
});

test("a check that looks like markup stays plain text, and its name in a button too", async () => {
  const tricky = check("c-9", "<img src=x onerror=alert(1)> **bold** [link](http://example.com)", { can_tick: true });
  await open(inReview, sheet([piece("p-1", "Payouts API", "", kwabena, [tricky])]));
  expect(section().querySelector("img")).toBeNull();
  expect(within(section()).queryAllByRole("link")).toEqual([]);
  expect(within(section()).getByText("<img src=x onerror=alert(1)> **bold** [link](http://example.com)")).toBeTruthy();
  expect(within(section()).getByRole("button", { name: "Tick the check: <img src=x onerror=alert(1)> **bold** [link](http://example.com)" })).toBeTruthy();
});

test("the count line says how many checks are ticked, the next step when there are none, and when there are no pieces", async () => {
  await open(inReview);
  expect(within(section()).getByText("1 of 3 checks ticked.")).toBeTruthy();
  cleanup();
  await open(inReview, sheet([piece("p-1", "Payouts API", "", kwabena, [receipt])]));
  expect(within(section()).getByText("1 of 1 check ticked.")).toBeTruthy();
  cleanup();
  await open(inReview, sheet([gateway]));
  expect(within(section()).getByText("No checks yet. Add what a teammate should read or try on each piece.")).toBeTruthy();
  cleanup();
  await open(inReview, sheet([], { can_add: true }));
  expect(within(section()).getByText("The design sketch has no pieces, so there is nothing to review.")).toBeTruthy();
});

// ---------- adding a check ----------

test("adding a check sends the text, the row follows, the field empties and a line says so", async () => {
  const made = check("c-4", "Handles a missing phone number", { created_by: me, can_tick: true, can_delete: true });
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([{ ...payouts, checks: [...payouts.checks, made] }, mobile, gateway])], {
    "POST /v1/hubs/hub-1/pieces/p-1/checks": reply(201, { data: made }),
  });
  expect(within(section()).getAllByText("One thing a teammate should read or try, up to 200 characters.")).toHaveLength(3);
  type("Payouts API", "  Handles a missing phone number ");
  press(section(), "Add the check to Payouts API");
  await waitFor(() => expect(within(block("Payouts API")).getByText("Handles a missing phone number")).toBeTruthy());
  expect(sent("POST")).toEqual([["/v1/hubs/hub-1/pieces/p-1/checks", { text: "Handles a missing phone number" }]]);
  expect(field("Payouts API").value).toBe("");
  expect(statusLine().textContent).toBe("The check was added.");
  // the other pieces' fields are untouched, and the count follows
  expect(within(section()).getByText("1 of 4 checks ticked.")).toBeTruthy();
});

test("the row follows the answer even when reading the checklist again fails", async () => {
  const made = check("c-4", "Handles a missing phone number", { created_by: me, can_delete: true });
  await open(inReview, [sheet([payouts, mobile, gateway]), refusal(500, "BOOM")], { "POST /v1/hubs/hub-1/pieces/p-3/checks": reply(201, { data: made }) });
  type("SMS gateway", "Handles a missing phone number");
  press(section(), "Add the check to SMS gateway");
  await waitFor(() => expect(within(block("SMS gateway")).getByText("Handles a missing phone number")).toBeTruthy());
  expect(statusLine().textContent).toBe("The check was added.");
  expect(within(section()).queryByRole("alert")).toBeNull();
});

test.each([
  ["nothing", ""],
  ["only spaces", "   "],
  ["201 characters", "a".repeat(201)],
])("%s is a field error before anything is sent, with the focus on the field", async (_what, value) => {
  await open(inReview);
  type("Payouts API", value);
  press(section(), "Add the check to Payouts API");
  expect(alertLine().textContent).toBe("Write the check in 1 to 200 characters.");
  expect(sent("POST")).toEqual([]);
  expect(document.activeElement).toBe(field("Payouts API"));
  expect(field("Payouts API").getAttribute("aria-invalid")).toBe("true");
  expect(field("Payouts API").getAttribute("aria-describedby")).toContain("review-check-p-1-error");
  // the error goes the moment the text is fixed
  type("Payouts API", "Rejects zero");
  expect(within(section()).queryByRole("alert")).toBeNull();
});

test("200 characters is sent", async () => {
  const text = "é".repeat(200);
  await open(inReview, sheet([gateway]), { "POST /v1/hubs/hub-1/pieces/p-3/checks": reply(201, { data: check("c-5", text) }) });
  type("SMS gateway", text);
  press(section(), "Add the check to SMS gateway");
  await waitFor(() => expect(sent("POST")).toEqual([["/v1/hubs/hub-1/pieces/p-3/checks", { text }]]));
});

test("a text the API refuses is the same field error, and what was typed stays", async () => {
  await open(inReview, sheet([payouts]), { "POST /v1/hubs/hub-1/pieces/p-1/checks": unprocessable() });
  type("Payouts API", "Rejects zero");
  press(section(), "Add the check to Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("Write the check in 1 to 200 characters."));
  expect(field("Payouts API").value).toBe("Rejects zero");
  expect(document.activeElement).toBe(field("Payouts API"));
});

test("a failure keeps what was typed", async () => {
  await open(inReview, sheet([payouts]), { "POST /v1/hubs/hub-1/pieces/p-1/checks": refusal(500, "BOOM") });
  type("Payouts API", "Rejects zero");
  press(section(), "Add the check to Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("We couldn't save that. Nothing changed, so try again."));
  expect(field("Payouts API").value).toBe("Rejects zero");
});

test("without the flag there is no field and no button to add", async () => {
  await open(inReview, sheet([payouts], { can_add: false }));
  expect(within(section()).queryByLabelText(/^Add a check/)).toBeNull();
  expect(within(section()).queryByRole("button", { name: /^Add the check/ })).toBeNull();
});

// ---------- tick, untick, delete ----------

test("ticking sends the tick, the row follows the answer, and the line that says so has the focus", async () => {
  const now = tickedBy(me, { can_untick: true, can_delete: true });
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([{ ...payouts, checks: [{ ...rejects, ...now }, receipt] }, mobile, gateway])], {
    "POST /v1/hubs/hub-1/checks/c-1/tick": { data: { ...rejects, ...now } },
  });
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(row("Rejects a negative amount").textContent).toContain("Ticked by Amina Ndiaye, 3 hours ago"));
  expect(sent("POST")).toEqual([["/v1/hubs/hub-1/checks/c-1/tick", null]]);
  expect(labels(row("Rejects a negative amount"))).toEqual(["Untick the check: Rejects a negative amount", "Delete the check: Rejects a negative amount"]);
  expect(statusLine().textContent).toBe("The check is ticked.");
  // the Tick button went away, so focus does not fall to the page
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(within(section()).getByText("2 of 3 checks ticked.")).toBeTruthy();
});

test("unticking sends the delete on the tick, and the check can be ticked again", async () => {
  const back = { ...receipt, ticked_by: null, ticked_at: null, can_tick: true, can_untick: false };
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([{ ...payouts, checks: [rejects, back] }, mobile, gateway])], {
    "DELETE /v1/hubs/hub-1/checks/c-2/tick": { data: back },
  });
  press(row("Sends a receipt"), "Untick the check: Sends a receipt");
  await waitFor(() => expect(row("Sends a receipt").textContent).toContain("Not ticked yet"));
  expect(sent("DELETE")).toEqual([["/v1/hubs/hub-1/checks/c-2/tick", null]]);
  expect(labels(row("Sends a receipt"))).toEqual(["Tick the check: Sends a receipt"]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(statusLine().textContent).toBe("The check is no longer ticked.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(within(section()).getByText("0 of 3 checks ticked.")).toBeTruthy();
});

test("deleting asks first, then removes the check, and the line that says so has the focus", async () => {
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([{ ...payouts, checks: [receipt] }, mobile, gateway])], { "DELETE /v1/hubs/hub-1/checks/c-1": done() });
  press(row("Rejects a negative amount"), "Delete the check: Rejects a negative amount");
  const dialog = screen.getByRole("dialog", { name: "Delete this check?" });
  expect(within(dialog).getByText("The check is removed for everyone in the hub. This cannot be undone.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(sent("DELETE")).toEqual([]);
  press(row("Rejects a negative amount"), "Delete the check: Rejects a negative amount");
  confirm("Delete this check?", "Delete the check");
  await waitFor(() => expect(within(section()).queryByText("Rejects a negative amount")).toBeNull());
  expect(sent("DELETE")).toEqual([["/v1/hubs/hub-1/checks/c-1", null]]);
  expect(statusLine().textContent).toBe("The check was deleted.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(within(section()).getByText("1 of 2 checks ticked.")).toBeTruthy();
});

test("while a change is on its way its button is busy and nothing else can be sent", async () => {
  await open(inReview);
  const route = fetchMock.getMockImplementation()!;
  let answer: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (answer = resolve));
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method && init.method !== "GET" ? pending : route(url, init)));
  const tick = within(row("Rejects a negative amount")).getByRole("button", { name: /^Tick the check/ });
  fireEvent.click(tick);
  await waitFor(() => expect(tick.getAttribute("aria-busy")).toBe("true"));
  expect(tick.textContent).toBe("Tick");
  fireEvent.click(within(row("Sends a receipt")).getByRole("button", { name: /^Untick/ }));
  fireEvent.click(tick);
  expect(sent("POST")).toHaveLength(1);
  expect(sent("DELETE")).toEqual([]);
  answer(new Response(JSON.stringify({ data: { ...rejects, ...tickedBy(me) } }), { status: 200 }));
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toBe("The check is ticked."));
});

// ---------- finishing the hub ----------

const allTicked = [piece("p-1", "Payouts API", "", kwabena, [receipt])];
const finishedSheet = sheet([piece("p-1", "Payouts API", "", kwabena, [{ ...receipt, can_untick: false }])], { finished_at: FINISHED, can_add: false, can_finish: false });

test("the owner finishes the hub behind a dialog, the hub is loaded again, and nothing is left to press", async () => {
  const finished = hub({ ...ownerInReview, finished_at: FINISHED });
  await open(ownerInReview, [sheet(allTicked, { can_finish: true }), finishedSheet], { "POST /v1/hubs/hub-1/finish": { data: finished } });
  press(section(), "Finish the hub");
  const dialog = screen.getByRole("dialog", { name: "Finish this hub?" });
  expect(within(dialog).getByText("The checklist closes and the hub stays in Review and test. This cannot be undone.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(sent("POST")).toEqual([]);
  press(section(), "Finish the hub");
  confirm("Finish this hub?", "Finish the hub");
  await waitFor(() => expect(sent("POST")).toEqual([["/v1/hubs/hub-1/finish", null]]));
  await waitFor(() => expect(statusLine().textContent).toBe("The hub is finished."));
  // the Finish button went away, so the line that says so has the focus
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(within(section()).getByText("This hub was finished on November 15, 2026. The checklist stays here to read.")).toBeTruthy();
  expect(within(section()).queryAllByRole("button")).toEqual([]);
  expect(within(section()).queryByLabelText(/^Add a check/)).toBeNull();
  // the page shows the card the API answered with
  expect(within(phases()).getAllByRole("listitem")[3].textContent).toBe("04Review and testFinished");
  expect(within(phases()).queryByRole("button", { name: /^Back to/ })).toBeNull();
});

test("a finished hub shows its checklist to read, with no button and no field", async () => {
  await open({ ...ownerInReview, finished_at: FINISHED }, finishedSheet);
  expect(section().textContent).toContain("Sends a receipt");
  expect(within(section()).queryAllByRole("button")).toEqual([]);
  expect(within(section()).queryByLabelText(/^Add a check/)).toBeNull();
  expect(within(section()).queryByText("Every check must be ticked before the hub can be finished.")).toBeNull();
});

test("the owner is told every check must be ticked while one is open, and has no button", async () => {
  await open(ownerInReview);
  expect(within(section()).getByText("Every check must be ticked before the hub can be finished.")).toBeTruthy();
  expect(within(section()).queryByRole("button", { name: "Finish the hub" })).toBeNull();
});

test.each([
  ["a member with every check ticked", inReview, sheet(allTicked)],
  ["a member with a check open", inReview, sheet([payouts])],
])("%s has neither the button nor the owner's line", async (_who, over, review) => {
  await open(over, review);
  expect(within(section()).queryByRole("button", { name: "Finish the hub" })).toBeNull();
  expect(within(section()).queryByText("Every check must be ticked before the hub can be finished.")).toBeNull();
});

test("an owner with no checks at all can finish the hub", async () => {
  await open(ownerInReview, sheet([gateway], { can_finish: true }));
  expect(within(section()).getByRole("button", { name: "Finish the hub" })).toBeTruthy();
});

test("unticking the last ticked check takes the Finish button away once the checklist is read again", async () => {
  const back = { ...receipt, ticked_by: null, ticked_at: null, can_tick: true, can_untick: false };
  await open(ownerInReview, [sheet(allTicked, { can_finish: true }), sheet([piece("p-1", "Payouts API", "", kwabena, [back])])], {
    "DELETE /v1/hubs/hub-1/checks/c-2/tick": { data: back },
  });
  expect(within(section()).getByRole("button", { name: "Finish the hub" })).toBeTruthy();
  press(row("Sends a receipt"), "Untick the check: Sends a receipt");
  await waitFor(() => expect(within(section()).queryByRole("button", { name: "Finish the hub" })).toBeNull());
  expect(within(section()).getByText("Every check must be ticked before the hub can be finished.")).toBeTruthy();
});

// ---------- refusals ----------

test("the demo's refusal says nothing was saved where a failure would say to try again", async () => {
  await open(inReview, sheet([payouts, mobile, gateway]), { "POST /v1/hubs/hub-1/checks/c-1/tick": refusal(403, "DEMO_READ_ONLY") }, "en", true);
  expect(section().textContent).not.toMatch(/made.?up|sample|placeholder|fake|demo/i);
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(sent("POST")).toHaveLength(1));
  await waitFor(() => expect(within(row("Rejects a negative amount")).getByRole("button", { name: /^Tick/ }).getAttribute("aria-busy")).toBeNull());
  expect(within(section()).getByRole("alert").textContent).toBe("Nothing was saved. The demo cannot be changed.");
  expect(section().textContent).not.toMatch(/We couldn't save that|made.?up|sample|placeholder|fake/i);
  expect(reads()).toHaveLength(1);
});

test("a tick on a piece the viewer built: a sentence, and nothing is read again", async () => {
  await open(inReview, sheet([payouts, mobile, gateway]), { "POST /v1/hubs/hub-1/checks/c-1/tick": refusal(403, "OWN_PIECE") });
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(alertLine().textContent).toBe("You built this piece, so a teammate ticks its checks."));
  expect(reads()).toHaveLength(1);
});

test("a piece with 10 checks: a sentence, and what was typed stays", async () => {
  await open(inReview, sheet([payouts]), { "POST /v1/hubs/hub-1/pieces/p-1/checks": refusal(409, "CHECK_LIMIT") });
  type("Payouts API", "An eleventh thing");
  press(section(), "Add the check to Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("A piece can have 10 checks. Delete one to add another."));
  expect(field("Payouts API").value).toBe("An eleventh thing");
  expect(reads()).toHaveLength(1);
});

test("unticking a check someone else ticked: a sentence", async () => {
  await open(ownerInReview, sheet([payouts]), { "DELETE /v1/hubs/hub-1/checks/c-2/tick": refusal(403, "NOT_CHECK_TICKER") });
  press(row("Sends a receipt"), "Untick the check: Sends a receipt");
  await waitFor(() => expect(alertLine().textContent).toBe("Only the person who ticked a check, or the hub's owner, can untick it."));
  expect(reads()).toHaveLength(1);
});

test("deleting a check someone else added: a sentence", async () => {
  await open(inReview, sheet([payouts]), { "DELETE /v1/hubs/hub-1/checks/c-1": refusal(403, "NOT_CHECK_AUTHOR") });
  press(row("Rejects a negative amount"), "Delete the check: Rejects a negative amount");
  confirm("Delete this check?", "Delete the check");
  await waitFor(() => expect(alertLine().textContent).toBe("Only the person who added a check, or the hub's owner, can delete it."));
  expect(reads()).toHaveLength(1);
});

test("finishing as someone who does not own the hub: a sentence", async () => {
  await open(ownerInReview, sheet(allTicked, { can_finish: true }), { "POST /v1/hubs/hub-1/finish": refusal(403, "NOT_HUB_OWNER") });
  press(section(), "Finish the hub");
  confirm("Finish this hub?", "Finish the hub");
  await waitFor(() => expect(alertLine().textContent).toBe("Only the hub's owner can finish the hub."));
  expect(reads()).toHaveLength(1);
});

test.each(["CHECK_TICKED", "CHECK_NOT_TICKED", "CHECK_NOT_FOUND", "PIECE_NOT_FOUND"])("%s: the checklist is read again and says how it stands now", async (code) => {
  const now = tickedBy(kwabena, { can_untick: false });
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([{ ...payouts, checks: [{ ...rejects, ...now }, receipt] }, mobile, gateway])], {
    "POST /v1/hubs/hub-1/checks/c-1/tick": refusal(409, code),
  });
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(alertLine().textContent).toBe("The checklist was changed. This is how it stands now."));
  await waitFor(() => expect(row("Rejects a negative amount").textContent).toContain("Ticked by Kwabena Ɔwusu"));
  expect(reads()).toHaveLength(2);
  await waitFor(() => expect(document.activeElement).toBe(alertLine()));
});

test("a refusal about a piece that is gone is said with the checklist, because the piece is not there any more", async () => {
  await open(inReview, [sheet([payouts, mobile, gateway]), sheet([mobile, gateway])], { "POST /v1/hubs/hub-1/pieces/p-1/checks": refusal(404, "PIECE_NOT_FOUND") });
  type("Payouts API", "Rejects zero");
  press(section(), "Add the check to Payouts API");
  await waitFor(() => expect(within(section()).queryByRole("heading", { level: 3, name: "Payouts API" })).toBeNull());
  expect(alertLine().textContent).toBe("The checklist was changed. This is how it stands now.");
});

test("finishing with a check open: the checklist is read again, so the button goes and the owner's line comes", async () => {
  await open(ownerInReview, [sheet(allTicked, { can_finish: true }), sheet([payouts])], { "POST /v1/hubs/hub-1/finish": refusal(409, "CHECKS_OPEN") });
  press(section(), "Finish the hub");
  confirm("Finish this hub?", "Finish the hub");
  await waitFor(() => expect(alertLine().textContent).toBe("Some checks are not ticked yet, so the hub cannot be finished."));
  await waitFor(() => expect(within(section()).queryByRole("button", { name: "Finish the hub" })).toBeNull());
  expect(within(section()).getByText("Every check must be ticked before the hub can be finished.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(alertLine()));
});

test.each(["HUB_FINISHED", "PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED", "NOT_HUB_MEMBER"])(
  "%s means the hub moved on: it is loaded again, the checklist follows it and says so",
  async (code) => {
    await open(
      inReview,
      [sheet([payouts, mobile, gateway]), finishedSheet],
      {
        "GET /v1/hubs/hub-1": [{ data: hub(inReview) }, { data: hub({ ...inReview, finished_at: FINISHED }) }],
        "POST /v1/hubs/hub-1/checks/c-1/tick": refusal(409, code),
      },
    );
    press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
    await waitFor(() => expect(alertLine().textContent).toBe("This hub has moved on, so the checklist can no longer be changed."));
    await waitFor(() => expect(within(section()).getByText(/^This hub was finished on/)).toBeTruthy());
    expect(hubReads()).toHaveLength(2);
    expect(reads()).toHaveLength(2);
    await waitFor(() => expect(within(section()).queryAllByRole("button")).toEqual([]));
    await waitFor(() => expect(document.activeElement).toBe(alertLine()));
  },
);

test("any other failure says nothing changed and keeps the buttons", async () => {
  await open(inReview, sheet([payouts, mobile, gateway]), { "POST /v1/hubs/hub-1/checks/c-1/tick": refusal(500, "BOOM") });
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(alertLine().textContent).toBe("We couldn't save that. Nothing changed, so try again."));
  expect(within(section()).getByRole("button", { name: "Tick the check: Rejects a negative amount" })).toBeTruthy();
  expect(reads()).toHaveLength(1);
});

// ---------- the page shown again ----------

test("showing the page again reads the checklist again and drops the line from the last visit", async () => {
  nav.search = "id=hub-1";
  const now = tickedBy(me, { can_untick: true, can_delete: true });
  api({
    "GET /v1/hubs/hub-1": { data: hub(inReview) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, roles: [], technologies: [] } },
    [REVIEW]: [sheet([payouts]), sheet([{ ...payouts, checks: [{ ...rejects, ...now }, receipt] }]), sheet([piece("p-1", "Payouts API", "", kwabena, [{ ...rejects, ...now }, receipt])])],
    "POST /v1/hubs/hub-1/checks/c-1/tick": { data: { ...rejects, ...now } },
  });
  const page = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <HubPage lang="en" />
    </Activity>
  );
  const { rerender } = render(page("visible"));
  await screen.findByRole("heading", { level: 3, name: "Payouts API" });
  press(row("Rejects a negative amount"), "Tick the check: Rejects a negative amount");
  await waitFor(() => expect(statusLine().textContent).toBe("The check is ticked."));
  rerender(page("hidden"));
  rerender(page("visible"));
  // the section is made again with the page, and it has no line from the first visit
  await waitFor(() => expect(within(section()).queryByRole("status")).toBeNull());
  expect(within(section()).getByText("2 of 2 checks ticked.")).toBeTruthy();
});

// ---------- French ----------

test("in French the section, the checks, the buttons and the refusals are French", async () => {
  const kids = [piece("p-1", "Payouts API", "", kwabena, [rejects, receipt]), mobile, gateway];
  await open(inReview, sheet(kids), { "POST /v1/hubs/hub-1/pieces/p-1/checks": refusal(409, "CHECK_LIMIT") }, "fr");
  expect(within(section()).getByRole("heading", { level: 2, name: "Revue et tests" })).toBeTruthy();
  // the text as the page holds it, so the narrow no-break space before the colon is checked
  expect(section().textContent).toContain("Vérifications cochées\u202f: 1 sur 3.");
  expect(block("Payouts API").textContent).toContain("Kwabena Ɔwusu a construit ce composant");
  expect(block("Mobile app").textContent).toContain("Vous avez construit ce composant");
  expect(block("Mobile app").textContent).toContain("Un coéquipier coche les vérifications de votre composant.");
  expect(block("SMS gateway").textContent).toContain("Personne n'a pris ce composant");
  expect(row("Rejects a negative amount").textContent).toContain("Ajoutée par Amina Ndiaye");
  expect(row("Rejects a negative amount").textContent).toContain("Pas encore cochée");
  // the page's own spaces in "il y a 3 heures" may be no-break ones
  expect(row("Sends a receipt").textContent).toMatch(/Cochée par Amina Ndiaye, il\sy\sa\s3\sheures/);
  expect(labels(row("Rejects a negative amount"))).toEqual(["Cocher la vérification\u202f: Rejects a negative amount", "Supprimer la vérification\u202f: Rejects a negative amount"]);
  expect(labels(row("Sends a receipt"))).toEqual(["Décocher la vérification\u202f: Sends a receipt"]);
  expect(within(section()).getAllByText("Une chose qu'un coéquipier doit lire ou essayer, 200 caractères au plus.")).toHaveLength(3);
  type("Payouts API", "");
  press(section(), "Ajouter la vérification à Payouts API");
  expect(alertLine().textContent).toBe("Écrivez la vérification en 1 à 200 caractères.");
  type("Payouts API", "Rejects zero");
  press(section(), "Ajouter la vérification à Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("Un composant peut avoir 10 vérifications. Supprimez-en une pour en ajouter une autre."));
  press(row("Rejects a negative amount"), /^Supprimer la vérification/);
  expect(screen.getByRole("dialog", { name: "Supprimer cette vérification\u202f?" })).toBeTruthy();
});

test("in French the owner reads the line about open checks, and the finish dialog and a finished hub are French", async () => {
  await open(ownerInReview, sheet([payouts]), {}, "fr");
  expect(within(section()).getByText("Chaque vérification doit être cochée avant que l'espace puisse être terminé.")).toBeTruthy();
  cleanup();
  await open(ownerInReview, sheet(allTicked, { can_finish: true }), {}, "fr");
  press(section(), "Terminer l'espace");
  expect(screen.getByRole("dialog", { name: "Terminer cet espace\u202f?" })).toBeTruthy();
  cleanup();
  await open({ ...ownerInReview, finished_at: FINISHED }, finishedSheet, {}, "fr");
  expect(within(section()).getByText("Cet espace a été terminé le 15 novembre 2026. La liste de vérification reste ici à lire.")).toBeTruthy();
  expect(phases().textContent).toContain("Revue et testsTerminée");
});
