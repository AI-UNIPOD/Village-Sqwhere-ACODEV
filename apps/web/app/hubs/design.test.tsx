import { Activity } from "react";
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
const inDesign = { ...asMember, ...at("design") };

const person = { id: "id-amina", username: "amina-ndiaye", display_name: "Amina Ndiaye", avatar_url: null, is_verified: false };
const piece = (id: string, name: string, summary = "") => ({
  id,
  name,
  summary,
  created_by: person,
  created_at: "2026-11-14T10:00:00Z",
  updated_at: "2026-11-14T10:00:00Z",
  can_delete: false,
});
const link = (id: string, from: string, to: string, label: string) => ({
  id,
  from_piece_id: from,
  to_piece_id: to,
  label,
  created_by: person,
  created_at: "2026-11-14T10:05:00Z",
  can_delete: false,
});
const sketch = (pieces: unknown[] = [], links: unknown[] = []) => ({ data: { pieces, links } });
const DESIGN = "GET /v1/hubs/hub-1/design";

const mobile = piece("p-1", "Mobile app", "Where agents approve payouts.");
const payouts = piece("p-2", "Payouts API", "Holds the rules.");
const sms = piece("p-3", "SMS gateway");
const payoutsSketch = sketch(
  [mobile, payouts, sms],
  [link("l-1", "p-1", "p-2", "approves a batch"), link("l-2", "p-2", "p-1", "returns the status")],
);

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
}

const section = () => document.querySelector<HTMLElement>("section#design")!;
const ready = () => screen.findByRole("heading", { name: /^(Design sketch|Schéma de conception)$/ });
const cards = () => within(section()).queryAllByRole("heading", { level: 3 }).map((heading) => heading.closest("li")!);
const alertText = () => within(section()).getByRole("alert").textContent;
const drawing = () => section().querySelector("svg");

// a screen of the given width: the drawing asks for 768px
function screenWidth(wide: boolean) {
  const listeners = new Set<() => void>();
  let matches = wide;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches && query === "(min-width: 768px)";
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return (next: boolean) => {
    matches = next;
    listeners.forEach((listener) => listener());
  };
}

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
  ["a member in design", inDesign],
  ["the owner in build", { ...asOwner, ...at("build") }],
  ["a member in review", { ...asMember, ...at("review") }],
])("%s sees the sketch", async (_who, over) => {
  await open(over, { [DESIGN]: sketch([mobile]) });
  await ready();
  expect(await within(section()).findByText("Mobile app")).toBeTruthy();
});

test.each([
  ["someone outside the hub", { ...asOutsider, ...at("design") }],
  ["someone who was only invited", { ...asInvited, ...at("design") }],
  ["a member while the hub is in brainstorm", { ...asMember, ...at("brainstorm") }],
  ["a member before the team is confirmed", asMember],
  ["the owner before the team is confirmed", asOwner],
])("%s sees no sketch and no request is made for them", async (_who, over) => {
  await open(over);
  await screen.findByRole("heading", { name: "Phases" });
  expect(section()).toBeNull();
  expect(asked().filter((line) => line.includes("/design"))).toEqual([]);
});

test("a skeleton stands in while the sketch loads", async () => {
  let finish: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (finish = resolve));
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(inDesign) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
  });
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (String(url).endsWith("/design") ? pending : route(url, init)));
  render(<HubPage lang="en" />);
  expect((await screen.findByText("Getting the sketch")).getAttribute("role")).toBe("status");
  finish(new Response(JSON.stringify(sketch([mobile])), { status: 200 }));
  await waitFor(() => expect(within(section()).getByText("Mobile app")).toBeTruthy());
  expect(within(section()).queryByText("Getting the sketch")).toBeNull();
});

test("every piece is a card with its name, its summary and its links in words, both ways", async () => {
  await open(inDesign, { [DESIGN]: payoutsSketch });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(3));
  const [app, api, gateway] = cards();
  expect(within(app).getByRole("heading", { level: 3 }).textContent).toBe("Mobile app");
  expect(within(app).getByText("Where agents approve payouts.")).toBeTruthy();
  expect(within(app).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["To Payouts API: approves a batch", "From Payouts API: returns the status"]);
  expect(within(api).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["To Mobile app: returns the status", "From Mobile app: approves a batch"]);
  // a piece with no links says nothing about links
  expect(gateway.textContent).toBe("SMS gateway");
  expect(gateway.querySelector("ul")).toBeNull();
});

test("names, summaries and labels are plain text, and a long name wraps instead of widening the card", async () => {
  const long = "A".repeat(60);
  await open(inDesign, {
    [DESIGN]: sketch([piece("p-1", "<b>Bold</b> API", "<i>Soft</i> summary"), piece("p-2", long)], [link("l-1", "p-1", "p-2", "<u>calls</u>")]),
  });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(section().querySelector("b, i, u")).toBeNull();
  expect(within(section()).getByText("<b>Bold</b> API")).toBeTruthy();
  expect(within(section()).getByText("<i>Soft</i> summary")).toBeTruthy();
  expect(within(section()).getByText(`To ${long}: <u>calls</u>`)).toBeTruthy();
});

test("from 768px the pieces and links are also drawn, hidden from assistive technology", async () => {
  screenWidth(true);
  await open(inDesign, { [DESIGN]: payoutsSketch });
  await ready();
  await waitFor(() => expect(drawing()).not.toBeNull());
  const picture = drawing()!;
  expect(picture.getAttribute("aria-hidden")).toBe("true");
  expect(picture.querySelectorAll("rect")).toHaveLength(3);
  // one path for each link, with its label near it
  expect(picture.querySelectorAll("path")).toHaveLength(2);
  expect([...picture.querySelectorAll("text")].map((text) => text.textContent)).toEqual(["Mobile app", "Payouts API", "SMS gateway", "approves a batch", "returns the status"]);
  // the list is still there
  expect(cards()).toHaveLength(3);
});

test("below 768px nothing is drawn, and the drawing follows the screen when it is resized", async () => {
  const resize = screenWidth(false);
  await open(inDesign, { [DESIGN]: payoutsSketch });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(3));
  expect(drawing()).toBeNull();
  resize(true);
  await waitFor(() => expect(drawing()).not.toBeNull());
  resize(false);
  await waitFor(() => expect(drawing()).toBeNull());
});

test("no sketch, and no list, when there are no pieces: the empty line says what is true for the phase", async () => {
  screenWidth(true);
  await open(inDesign);
  await ready();
  expect(await within(section()).findByText("No pieces yet.")).toBeTruthy();
  expect(drawing()).toBeNull();
  expect(within(section()).queryByRole("list")).toBeNull();
  cleanup();
  await open({ ...asMember, ...at("build") });
  await ready();
  expect(await within(section()).findByText("No sketch was made during design and architecture.")).toBeTruthy();
});

test("a sketch that cannot load says so with Try again, which loads it and says so", async () => {
  await open(inDesign, { [DESIGN]: [refusal(500, "INTERNAL"), sketch([mobile])] });
  await ready();
  await waitFor(() => expect(alertText()).toContain("We couldn't load the sketch."));
  fireEvent.click(within(section()).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(within(section()).getByText("Mobile app")).toBeTruthy());
  expect(within(section()).queryByRole("alert")).toBeNull();
  // Try again went away with the error, so the line takes the focus
  await waitFor(() => expect(document.activeElement).toBe(within(section()).getByRole("status")));
  expect(within(section()).getByRole("status").textContent).toContain("The sketch is up to date.");
});

test("Refresh reads the sketch again, keeps the focus on the button and says so", async () => {
  await open(inDesign, { [DESIGN]: [sketch([mobile]), sketch([mobile, payouts])] });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(1));
  const refresh = within(section()).getByRole("button", { name: "Refresh" });
  refresh.focus();
  fireEvent.click(refresh);
  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(within(section()).getByRole("status").textContent).toContain("The sketch is up to date.");
  expect(document.activeElement).toBe(refresh);
});

test.each([
  ["design", { ...asMember, ...at("design") }, "This is the team's sketch of the system: its pieces and how they talk."],
  ["build", { ...asOwner, ...at("build") }, "Design and architecture is over. The sketch stays here to read."],
  ["review", { ...asMember, ...at("review") }, "Design and architecture is over. The sketch stays here to read."],
  ["an archived hub", { ...asOwner, ...at("design"), status: "archived" }, "This hub is archived. The sketch stays here to read."],
])("in %s one line says where things stand, and there is nothing to change", async (_name, over, line) => {
  await open(over, { [DESIGN]: payoutsSketch });
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(3));
  expect(within(section()).getByText(line)).toBeTruthy();
  expect(within(section()).queryByRole("textbox")).toBeNull();
  expect(within(section()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh"]);
});

test.each([
  ["PHASE_NOT_STARTED", 409, { ...asMember, ...at("brainstorm") }],
  ["TEAM_NOT_CONFIRMED", 409, asMember],
  ["NOT_HUB_MEMBER", 403, { ...asOutsider, ...at("design") }],
])("%s on loading means the hub changed: it is loaded again and the section says nothing more", async (code, status, now) => {
  await open(inDesign, {
    [DESIGN]: refusal(status, code),
    "GET /v1/hubs/hub-1": [{ data: hub(inDesign) }, { data: hub(now) }],
  });
  await waitFor(() => expect(asked().filter((line) => line === "GET /v1/hubs/hub-1")).toHaveLength(2));
  await waitFor(() => expect(section()).toBeNull());
  expect(screen.queryByText("English text from the API")).toBeNull();
  expect(screen.queryByText(/We couldn't load the sketch/)).toBeNull();
});

test("a refusal when the hub still fits the section leaves nothing of it, and no error", async () => {
  await open(inDesign, { [DESIGN]: refusal(409, "PHASE_NOT_STARTED") });
  await waitFor(() => expect(asked().filter((line) => line === "GET /v1/hubs/hub-1")).toHaveLength(2));
  await waitFor(() => expect(section()).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("showing the page again reads the sketch again and drops the line from the last visit", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(inDesign) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    [DESIGN]: [sketch(), sketch([mobile])],
  });
  const page = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <HubPage lang="en" />
    </Activity>
  );
  const { rerender } = render(page("visible"));
  await ready();
  await within(section()).findByText("No pieces yet.");
  fireEvent.click(within(section()).getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(within(section()).getByRole("status").textContent).toContain("The sketch is up to date."));
  rerender(page("hidden"));
  rerender(page("visible"));
  // the section is made again with the page: it settles on the new sketch with no line from the first visit
  await waitFor(() => {
    expect(within(section()).getByText("Mobile app")).toBeTruthy();
    expect(within(section()).queryByRole("status")).toBeNull();
  });
});

test("in French the heading, the lines and the links are French", async () => {
  await open(inDesign, { [DESIGN]: payoutsSketch }, "fr");
  await ready();
  await waitFor(() => expect(cards()).toHaveLength(3));
  expect(within(section()).getByText(/^Voici le schéma du système réalisé par l'équipe\s: ses composants et la façon dont ils communiquent\.$/)).toBeTruthy();
  expect(within(cards()[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Vers Payouts API\u202f: approves a batch",
    "Depuis Payouts API\u202f: returns the status",
  ]);
  expect(within(section()).getByRole("button", { name: "Actualiser" })).toBeTruthy();
});
