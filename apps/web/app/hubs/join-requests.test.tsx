import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { IdeaPage } from "../ideas/idea-page";
import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { MyHubs } from "./my-hubs";
import { api, asked, demoRefusal, fetchMock, hub, member, owner, posted, refusal, reply, saidNotSaved } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

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

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const placed = (membership_status: string | null) => ({ viewer: { membership_status, member_role: membership_status ? "member" : null } });

// ---------- asking, on the open idea's page ----------

const openIdea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Clinic queue for Kano",
  summary: "Patients wait for hours without knowing their turn.",
  stage: "prototype",
  roles_needed: [],
  author: { username: "ama-mensah", display_name: "Ama Mensah", is_verified: true },
  hub_id: "hub-1",
  published_at: "2026-11-12T10:00:00Z",
  ...over,
});

// the idea's page for a developer, with the hub card as the API shows it to them
async function view(hubOver: Record<string, unknown> | null, routes: Record<string, unknown> = {}, ideaOver: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=idea-1";
  api({
    "GET /v1/me": { data: { username: "kwabena-owusu", display_name: "Kwabena Owusu", roles: [], technologies: [] } },
    "GET /v1/ideas/idea-1": { data: openIdea(ideaOver) },
    ...(hubOver ? { "GET /v1/hubs/hub-1": { data: hub(hubOver) } } : {}),
    ...routes,
  });
  render(<IdeaPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Clinic queue for Kano" });
}

const ask = () => screen.findByRole("button", { name: "Ask to join" });

test("the idea says what asking means, then Ask to join sends the request and the button gives way to a status", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": reply(201, { data: hub(placed("requested")) }) });
  const button = await ask();
  expect(screen.getByText("The owner sees your profile and answers. If they approve, you read the hub's agreement and sign to join.")).toBeTruthy();
  fireEvent.click(button);
  const status = await screen.findByText("You asked to join. The owner will answer.");
  expect(status.closest("[role='status']")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(posted()).toEqual([["/v1/hubs/hub-1/join-requests", null]]);
  // focus stays on the page's new state, not on a button that is gone
  await waitFor(() => expect(document.activeElement).toBe(status));
});

test("a second press while the request is on its way sends nothing more", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": reply(201, { data: hub(placed("requested")) }) });
  const button = await ask();
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText("You asked to join. The owner will answer.");
  expect(posted()).toHaveLength(1);
});

test("opened again, the page already says the developer asked, and asks nothing", async () => {
  await view(placed("requested"));
  expect(await screen.findByText("You asked to join. The owner will answer.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(posted()).toEqual([]);
});

test("a developer who was declined, or who left, can ask again", async () => {
  await view(placed("declined"));
  expect(await ask()).toBeTruthy();
});

test("an idea with no hub yet says so, with no button and no request for a hub", async () => {
  await view(null, {}, { hub_id: null });
  expect(await screen.findByText("The owner has not opened a hub yet, so there is nothing to join for now. Come back later.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(asked().some((call) => call.includes("/v1/hubs"))).toBe(false);
});

test("an invited developer is led to read and sign, with no Ask button", async () => {
  await view(placed("invited"));
  const link = await screen.findByRole("link", { name: "Read and sign" });
  expect(link.getAttribute("href")).toBe("/en/hubs/join?id=hub-1");
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test("a member is led to the hub", async () => {
  await view(placed("active"));
  expect(await screen.findByText("You are already in this team.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the hub" }).getAttribute("href")).toBe("/en/hubs/view?id=hub-1");
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test("the idea's owner has no Ask button and the page never reads the hub for them", async () => {
  nav.search = "id=idea-1";
  api({
    "GET /v1/me": { data: { username: "ama-mensah", display_name: "Ama Mensah", roles: [], technologies: [] } },
    "GET /v1/ideas/idea-1": { data: openIdea() },
  });
  render(<IdeaPage lang="en" />);
  expect(await screen.findByRole("link", { name: "Edit your idea" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(asked().some((call) => call.includes("/v1/hubs"))).toBe(false);
});

test("an archived hub takes no request and says so", async () => {
  await view({ ...placed(null), status: "archived" });
  expect(await screen.findByText("This hub is archived, so nobody can join.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test.each([
  ["TEAM_FULL", "The team is full: five members is the most a hub takes."],
  ["SOMETHING_ELSE", "That did not go through. Nothing was changed, so try again."],
])("%s says what happened and leaves the button to try again", async (code, sentence) => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": refusal(code === "TEAM_FULL" ? 409 : 500, code) });
  fireEvent.click(await ask());
  expect((await screen.findByRole("alert")).textContent).toContain(sentence);
  expect(screen.getByRole("button", { name: "Ask to join" })).toBeTruthy();
});

// asking too soon after the owner declined: the API says when the wait ends
const coolingDown = (until: unknown) =>
  reply(409, { detail: { code: "REQUEST_COOLING_DOWN", message: "English text from the API", can_ask_again_at: until } });

test("asking too soon after a decline says when the developer can ask again, in place of the button", async () => {
  await view(placed("declined"), { "POST /v1/hubs/hub-1/join-requests": coolingDown("2026-11-15T12:00:00.123456+00:00") });
  fireEvent.click(await ask());
  const note = await screen.findByText(/^The owner turned down your last request\. You can ask again from November 15, 2026 at \d{1,2}:\d{2}\s[AP]M\.$/);
  expect(screen.getByRole("status").contains(note)).toBe(true);
  // the button that was pressed is gone, so the place moves to the sentence
  await waitFor(() => expect(document.activeElement).toBe(note));
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a developer still waiting sees the date as soon as the page opens, with no button to press", async () => {
  await view({ viewer: { membership_status: "declined", member_role: "member", can_ask_again_at: "2026-11-15T12:00:00.123456+00:00" } });
  const note = await screen.findByText(/^The owner turned down your last request\. You can ask again from November 15, 2026 at \d{1,2}:\d{2}\s[AP]M\.$/);
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
  // nothing was pressed, so nothing is announced and the person's place is left alone
  expect(screen.queryByRole("status")).toBeNull();
  expect(document.activeElement).not.toBe(note);
  expect(posted()).toEqual([]);
});

test("once the wait is over the card carries no date, and the button is back", async () => {
  await view({ viewer: { membership_status: "declined", member_role: "member", can_ask_again_at: null } });
  expect(await ask()).toBeTruthy();
  expect(screen.queryByText(/turned down/)).toBeNull();
});

test("the wait is said in French, with the date written the French way", async () => {
  await view(placed("declined"), { "POST /v1/hubs/hub-1/join-requests": coolingDown("2026-11-15T12:00:00+00:00") }, {}, "fr");
  fireEvent.click(await screen.findByRole("button", { name: "Demander à rejoindre" }));
  expect(await screen.findByText(/^Le porteur a refusé votre dernière demande\. Vous pourrez redemander à partir du 15 novembre 2026 à \d{2}:\d{2}\.$/)).toBeTruthy();
});

test("a wait with no readable date still says the developer can ask again later", async () => {
  await view(placed("declined"), { "POST /v1/hubs/hub-1/join-requests": coolingDown(null) });
  fireEvent.click(await ask());
  expect(await screen.findByText("The owner turned down your last request. You can ask again later.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test("IDEA_CLOSED says the idea takes no more requests and takes the button away", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": refusal(409, "IDEA_CLOSED") });
  fireEvent.click(await ask());
  expect(await screen.findByText("This idea is no longer looking for people, so its hub takes no requests.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test("HUB_ARCHIVED says the hub is archived and takes the button away", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": refusal(409, "HUB_ARCHIVED") });
  fireEvent.click(await ask());
  expect(await screen.findByText("This hub is archived, so nobody can join.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test.each([
  ["ALREADY_REQUESTED", "You asked to join. The owner will answer."],
  ["ALREADY_INVITED", "You are invited to this hub."],
  ["ALREADY_MEMBER", "You are already in this team."],
])("%s puts the page in the state the developer is really in", async (code, sentence) => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": refusal(409, code) });
  fireEvent.click(await ask());
  expect(await screen.findByText(sentence)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull();
});

test("the demo's refused request says nothing was saved as a status, with no alert, and keeps the button", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": demoRefusal() });
  fireEvent.click(await ask());
  await saidNotSaved();
  expect(screen.getByRole("button", { name: "Ask to join" })).toBeTruthy();
});

test("a hub card that fails to load says so and loads again on Try again", async () => {
  await view(null, { "GET /v1/hubs/hub-1": [refusal(500, "BOOM"), { data: hub(placed(null)) }] });
  expect(await screen.findByText(/We couldn't check where you stand with this hub/)).toBeTruthy();
  press("Try again");
  expect(await ask()).toBeTruthy();
});

test("asking is the same page in French", async () => {
  await view(placed(null), { "POST /v1/hubs/hub-1/join-requests": reply(201, { data: hub(placed("requested")) }) }, {}, "fr");
  expect(await screen.findByRole("heading", { level: 2, name: "Rejoindre l'équipe" })).toBeTruthy();
  // the heading is the idea page's own; the button comes once the hub's card has loaded
  fireEvent.click(await screen.findByRole("button", { name: "Demander à rejoindre" }));
  expect(await screen.findByText("Vous avez demandé à rejoindre l'équipe. Le porteur vous répondra.")).toBeTruthy();
});

// ---------- the owner answers, in the team ----------

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const tendai = member("tendai-moyo", "Tendai Moyo");
const wanjiru = member("wanjiru-kamau", "Wanjiru Kamau", { status: "requested", joined_at: null });
const fatou = member("fatou-sow", "Fatou Sow", { status: "requested", joined_at: null });
const invitedByOwner = member("amina-ndiaye", "Amina Ndiaye", { status: "invited", joined_at: null });

async function openTeam(people: unknown[], routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(asOwner) },
    "GET /v1/hubs/hub-1/members": { data: people },
    "GET /v1/hubs/hub-1/idea": { data: { id: "idea-1", title: "Borehole map for Kaduna", summary: "x", details: "Brief." } },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const rowOf = (name: string) => within(screen.getAllByRole("listitem").find((row) => row.textContent?.includes(name))!);

test("the owner of an archived hub sees the team but no way to change it", async () => {
  const declined = member("fatou-sow", "Fatou Sow", { status: "declined", joined_at: null });
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub({ ...asOwner, status: "archived" }) },
    "GET /v1/hubs/hub-1/members": { data: [owner(), wanjiru, invitedByOwner, declined] },
    "GET /v1/hubs/hub-1/idea": { data: { id: "idea-1", title: "Borehole map for Kaduna", summary: "x", details: "Brief." } },
  });
  render(<HubPage lang="en" />);
  await screen.findByText("Wanjiru Kamau");
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
  for (const name of [/^Approve/, /^Decline/, /^Withdraw/, /^Invite again/, "Send invite"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  expect(screen.queryByRole("link", { name: "Find developers who match this idea" })).toBeNull();
});

test("requests come first, each with the Asked to join pill and Approve and Decline named for the person", async () => {
  await openTeam([owner(), tendai, invitedByOwner, wanjiru, fatou]);
  await screen.findByText("Wanjiru Kamau");
  const names = screen.getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent);
  expect(names.slice(0, 2)).toEqual(["Wanjiru Kamau", "Fatou Sow"]);
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Approve: Wanjiru Kamau" })).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Decline: Wanjiru Kamau" })).toBeTruthy();
  // someone who asked is not a member yet
  expect(rowOf("Wanjiru Kamau").queryByText("Member")).toBeNull();
  expect(screen.getByText("2 of 5 members")).toBeTruthy();
});

test("Approve turns the request into an invitation, from the member card the API answers with, and says so", async () => {
  await openTeam([owner(), wanjiru], {
    "POST /v1/hubs/hub-1/members/id-wanjiru-kamau/approve": reply(200, { data: { ...wanjiru, status: "invited" } }),
  });
  await screen.findByText("Wanjiru Kamau");
  press("Approve: Wanjiru Kamau");
  await waitFor(() => expect(screen.queryByText("Asked to join")).toBeNull());
  expect(posted()).toEqual([["/v1/hubs/hub-1/members/id-wanjiru-kamau/approve", null]]);
  expect(rowOf("Wanjiru Kamau").getByText("Invited")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Withdraw: Wanjiru Kamau" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Wanjiru Kamau is invited. They read the agreement and sign to join.");
  // the row that changed after the owner's own action is the one that arrives
  expect(screen.getAllByRole("listitem").filter((row) => row.hasAttribute("data-arrived"))).toHaveLength(1);
});

test("Decline asks first, and backing out sends nothing", async () => {
  await openTeam([owner(), wanjiru]);
  await screen.findByText("Wanjiru Kamau");
  press("Decline: Wanjiru Kamau");
  const dialog = screen.getByRole("dialog", { name: "Decline this request?" });
  expect(within(dialog).getByText("They can ask again later, and you can invite them.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Go back" }));
  expect(posted()).toEqual([]);
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
});

test("confirming Decline sends it, and the row shows what the API answers: Declined, with Invite again", async () => {
  await openTeam([owner(), wanjiru], {
    "POST /v1/hubs/hub-1/members/id-wanjiru-kamau/decline": reply(200, { data: { ...wanjiru, status: "declined" } }),
  });
  await screen.findByText("Wanjiru Kamau");
  press("Decline: Wanjiru Kamau");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Decline" }));
  await waitFor(() => expect(screen.queryByText("Asked to join")).toBeNull());
  expect(posted()).toEqual([["/v1/hubs/hub-1/members/id-wanjiru-kamau/decline", null]]);
  expect(rowOf("Wanjiru Kamau").getByText("Declined")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Invite again: Wanjiru Kamau" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("You declined the request from Wanjiru Kamau. You can invite them later.");
});

test("TEAM_FULL on approve keeps the request and says the team is full", async () => {
  await openTeam([owner(), wanjiru], { "POST /v1/hubs/hub-1/members/id-wanjiru-kamau/approve": refusal(409, "TEAM_FULL") });
  await screen.findByText("Wanjiru Kamau");
  press("Approve: Wanjiru Kamau");
  expect((await screen.findByRole("alert")).textContent).toContain("The team is full: five members is the most a hub takes.");
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Approve: Wanjiru Kamau" })).toBeTruthy();
});

test.each([
  ["approve", "Approve: Wanjiru Kamau", null],
  ["decline", "Decline: Wanjiru Kamau", "Decline"],
])("REQUEST_NOT_FOUND on %s reads the list again and says the request is no longer waiting", async (kind, button, confirm) => {
  await openTeam([owner(), wanjiru], {
    [`POST /v1/hubs/hub-1/members/id-wanjiru-kamau/${kind}`]: refusal(404, "REQUEST_NOT_FOUND"),
    "GET /v1/hubs/hub-1/members": [{ data: [owner(), wanjiru] }, { data: [owner(), { ...wanjiru, status: "invited" }] }],
  });
  await screen.findByText("Wanjiru Kamau");
  press(button);
  if (confirm) fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: confirm }));
  expect((await screen.findByRole("alert")).textContent).toContain("That request is no longer waiting. The list is up to date.");
  expect(await within(screen.getAllByRole("listitem").find((row) => row.textContent?.includes("Wanjiru Kamau"))!).findByText("Invited")).toBeTruthy();
});

test("a failed answer says it did not go through and changes nothing", async () => {
  await openTeam([owner(), wanjiru], { "POST /v1/hubs/hub-1/members/id-wanjiru-kamau/approve": refusal(500, "BOOM") });
  await screen.findByText("Wanjiru Kamau");
  press("Approve: Wanjiru Kamau");
  expect((await screen.findByRole("alert")).textContent).toContain("That did not go through.");
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
});

test("the demo's refused answer says nothing was saved as a status, with no alert", async () => {
  await openTeam([owner(), wanjiru], { "POST /v1/hubs/hub-1/members/id-wanjiru-kamau/approve": demoRefusal() });
  await screen.findByText("Wanjiru Kamau");
  press("Approve: Wanjiru Kamau");
  await saidNotSaved();
  expect(rowOf("Wanjiru Kamau").getByText("Asked to join")).toBeTruthy();
});

test("the owner's team is the same in French, with the person's name in each button's name", async () => {
  await openTeam([owner(), wanjiru], {}, "fr");
  await screen.findByText("Wanjiru Kamau");
  expect(rowOf("Wanjiru Kamau").getByText("Veut rejoindre")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Approuver\u202f: Wanjiru Kamau" })).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Refuser\u202f: Wanjiru Kamau" })).toBeTruthy();
});

// ---------- the developer's own requests ----------

const pending = hub({
  id: "hub-7",
  name: "Clinic queue hub",
  idea: { id: "idea-7", title: "Clinic queue", summary: "Waiting rooms." },
  owner: { username: "ama-mensah", display_name: "Ama Mensah", is_verified: false },
  ...placed("requested"),
});

test("your hubs list the requests waiting on an owner, each leading to its hub, above your hubs", async () => {
  api({
    "GET /v1/me/hubs": { data: [hub()], next_offset: null },
    "GET /v1/me/hubs?status=invited": { data: [] },
    "GET /v1/me/hubs?status=requested": { data: [pending] },
  });
  render(<MyHubs lang="en" />);
  const heading = await screen.findByRole("heading", { level: 2, name: "Waiting for the owner" });
  const link = screen.getByRole("link", { name: "Clinic queue hub" });
  expect(link.getAttribute("href")).toBe("/en/hubs/view?id=hub-7");
  expect(link.closest("li")!.textContent).toContain("Owner: Ama Mensah");
  expect(heading.compareDocumentPosition(screen.getByRole("link", { name: "Borehole map hub" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "Your hubs" })).toBeTruthy();
});

test("requests past the first 50 are listed too", async () => {
  const later = { ...pending, id: "hub-8", name: "Market prices hub" };
  api({
    "GET /v1/me/hubs": { data: [], next_offset: null },
    "GET /v1/me/hubs?status=invited": { data: [], next_offset: null },
    "GET /v1/me/hubs?status=requested&offset=0": { data: [pending], next_offset: 50 },
    "GET /v1/me/hubs?status=requested&offset=50": { data: [later], next_offset: null },
  });
  render(<MyHubs lang="en" />);
  expect(await screen.findByRole("link", { name: "Market prices hub" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Clinic queue hub" })).toBeTruthy();
});

test("your hubs still list when the requests cannot be read, and show no Waiting section", async () => {
  api({
    "GET /v1/me/hubs": { data: [hub()], next_offset: null },
    "GET /v1/me/hubs?status=invited": { data: [] },
    "GET /v1/me/hubs?status=requested": refusal(500, "BOOM"),
  });
  render(<MyHubs lang="en" />);
  expect(await screen.findByRole("link", { name: "Borehole map hub" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Waiting for the owner" })).toBeNull();
});

test("the waiting section is in French", async () => {
  api({
    "GET /v1/me/hubs": { data: [], next_offset: null },
    "GET /v1/me/hubs?status=invited": { data: [] },
    "GET /v1/me/hubs?status=requested": { data: [pending] },
  });
  render(<MyHubs lang="fr" />);
  expect(await screen.findByRole("heading", { level: 2, name: "En attente du porteur" })).toBeTruthy();
  expect(screen.getByText(/Porteur\s*: Ama Mensah/)).toBeTruthy();
});

test("a hub opened by someone who asked says so, and shows nothing private", async () => {
  nav.search = "id=hub-1";
  api({ "GET /v1/hubs/hub-1": { data: hub(placed("requested")) } });
  render(<HubPage lang="en" />);
  expect(await screen.findByText("You asked to join. The owner will answer.")).toBeTruthy();
  expect(screen.queryByText("You are not a member of this hub.")).toBeNull();
  expect(asked().filter((call) => /\/(idea|members)$/.test(call))).toEqual([]);
});

// ---------- taking a request back ----------

const withdraw = "POST /v1/hubs/hub-1/join-request/withdraw";
const withdrawn = { data: hub({ viewer: { membership_status: "declined", member_role: "member", can_ask_again_at: null } }) };
const takeBack = () => screen.findByRole("button", { name: "Withdraw my request" });

test("a developer who asked can take the request back, with no question, and may ask again at once", async () => {
  await view(placed("requested"), { [withdraw]: withdrawn });
  fireEvent.click(await takeBack());
  const line = await screen.findByText("You withdrew your request. You can ask again whenever you like.");
  expect(line.getAttribute("role")).toBe("status");
  // the button that was pressed is gone, so the place moves to the sentence
  await waitFor(() => expect(document.activeElement).toBe(line));
  expect(posted()).toEqual([["/v1/hubs/hub-1/join-request/withdraw", null]]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("You asked to join. The owner will answer.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Withdraw my request" })).toBeNull();
  // nobody declined, so there is no wait
  expect(await ask()).toBeTruthy();
});

test("asking again after taking a request back drops the line about it", async () => {
  await view(placed("requested"), { [withdraw]: withdrawn, "POST /v1/hubs/hub-1/join-requests": reply(201, { data: hub(placed("requested")) }) });
  fireEvent.click(await takeBack());
  fireEvent.click(await ask());
  expect(await screen.findByText("You asked to join. The owner will answer.")).toBeTruthy();
  expect(screen.queryByText(/You withdrew your request/)).toBeNull();
  expect(await takeBack()).toBeTruthy();
});

test("a second press while the withdrawal is on its way sends nothing more", async () => {
  await view(placed("requested"), { [withdraw]: withdrawn });
  const button = await takeBack();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button.getAttribute("aria-busy")).toBe("true");
  await screen.findByText(/You withdrew your request/);
  expect(posted()).toHaveLength(1);
});

test("when the owner answered first, the page reads the hub again and shows where the developer stands", async () => {
  await view(null, {
    "GET /v1/hubs/hub-1": [{ data: hub(placed("requested")) }, { data: hub(placed("invited")) }],
    [withdraw]: refusal(404, "REQUEST_NOT_FOUND"),
  });
  fireEvent.click(await takeBack());
  expect(await screen.findByText("The owner had already answered. This is where you stand now.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Read and sign" }).getAttribute("href")).toBe("/en/hubs/join?id=hub-1");
  expect(screen.queryByRole("button", { name: "Withdraw my request" })).toBeNull();
});

test("a withdrawal that fails says so and leaves the request and the button", async () => {
  await view(placed("requested"), { [withdraw]: refusal(500, "BOOM") });
  fireEvent.click(await takeBack());
  expect((await screen.findByRole("alert")).textContent).toContain("That did not go through. Nothing was changed, so try again.");
  expect(screen.getByText("You asked to join. The owner will answer.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Withdraw my request" }).getAttribute("aria-busy")).toBeNull();
});

test("the demo's refused withdrawal says nothing was saved as a status, with no alert, and leaves the request", async () => {
  await view(placed("requested"), { [withdraw]: demoRefusal() });
  fireEvent.click(await takeBack());
  await saidNotSaved();
  expect(screen.getByText("You asked to join. The owner will answer.")).toBeTruthy();
});

test("taking a request back is in French", async () => {
  await view(placed("requested"), { [withdraw]: withdrawn }, {}, "fr");
  fireEvent.click(await screen.findByRole("button", { name: "Retirer ma demande" }));
  expect(await screen.findByText("Vous avez retiré votre demande. Vous pouvez redemander quand vous voulez.")).toBeTruthy();
});

test("the hub's page offers it too, and after it says the request was withdrawn, not that someone declined", async () => {
  nav.search = "id=hub-1";
  api({ "GET /v1/hubs/hub-1": { data: hub(placed("requested")) }, [withdraw]: withdrawn });
  render(<HubPage lang="en" />);
  fireEvent.click(await takeBack());
  const line = await screen.findByText("You withdrew your request. You can ask again whenever you like.");
  await waitFor(() => expect(document.activeElement).toBe(line));
  expect(screen.queryByText("You asked to join. The owner will answer.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Withdraw my request" })).toBeNull();
  expect(screen.queryByText(/declined/i)).toBeNull();
});

test("on the hub's page, an owner who answered first is shown as the answer it was", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": [{ data: hub(placed("requested")) }, { data: hub(placed("declined")) }],
    [withdraw]: refusal(404, "REQUEST_NOT_FOUND"),
  });
  render(<HubPage lang="en" />);
  fireEvent.click(await takeBack());
  expect(await screen.findByText("The owner had already answered. This is where you stand now.")).toBeTruthy();
  expect(screen.getByText(/declined/i)).toBeTruthy();
});
