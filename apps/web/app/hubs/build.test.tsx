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
const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asOutsider = { viewer: { membership_status: null, member_role: null } };
// a hub the owner has confirmed, now at `phase`
const at = (phase: string, over: Record<string, unknown> = {}) => ({
  phase,
  team_confirmed_at: "2026-11-14T09:00:00Z",
  phases: phasesAt(phase),
  ...over,
});
const inBuild = { ...asMember, ...at("build") };
const inReview = { ...asMember, ...at("review") };

const person = (username: string, display_name: string) => ({ id: `id-${username}`, username, display_name, avatar_url: null, is_verified: false });
const me = person("amina-ndiaye", "Amina Ndiaye");
const kwabena = person("kwabena-owusu", "Kwabena Ɔwusu");

// a piece nobody builds, which the viewer may claim; `over` changes it
const piece = (id: string, name: string, summary = "", over: Record<string, unknown> = {}) => ({
  id,
  name,
  summary,
  claimed_by: null,
  claimed_at: null,
  can_claim: true,
  can_release: false,
  ...over,
});
const heldBy = (who: ReturnType<typeof person>, over: Record<string, unknown> = {}) => ({
  claimed_by: who,
  claimed_at: "2026-11-15T08:00:00Z",
  can_claim: false,
  can_release: false,
  ...over,
});
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const sha = (n: number) => `${n}`.repeat(40).slice(0, 40);
const commit = (n: number, message: string, author_name = "Amina Ndiaye") => ({ sha: sha(n), message, author_name, committed_at: ago(n) });
const tab = (over: Record<string, unknown> = {}) => ({
  data: { repository_url: null, commits_refreshed_at: null, can_set_repository: false, can_refresh: false, pieces: [], commits: [], ...over },
});
const REPOSITORY = "https://github.com/pallets/flask";
const withRepository = { repository_url: REPOSITORY, can_refresh: true };
const done = () => new Response(null, { status: 204 });
const unprocessable = () => new Response(JSON.stringify({ detail: [{ loc: ["body", "repository_url"], msg: "no", type: "value_error" }] }), { status: 422 });

const BUILD = "GET /v1/hubs/hub-1/build";
const payouts = piece("p-1", "Payouts API", "Holds the rules.");
const mobile = piece("p-2", "Mobile app", "", heldBy(me, { can_release: true }));
const sms = piece("p-3", "SMS gateway", "", heldBy(kwabena));

async function open(over: Record<string, unknown>, build: unknown = tab(), routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en", demo = false) {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, is_demo: demo, roles: [], technologies: [], feed_topics: [], sectors: [] } },
    [BUILD]: build,
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await screen.findByRole("heading", { level: 2, name: /^(Build|Construction)$/ });
  await waitFor(() => expect(within(section()).queryByText(/^(Getting the build tab|Chargement de l'onglet de construction)$/)).toBeNull());
}

const section = () => document.querySelector<HTMLElement>("section#build")!;
const cards = () => within(section()).getAllByRole("heading", { level: 4 }).map((heading) => heading.closest("li")!);
const card = (name: string) => within(section()).getByRole("heading", { level: 4, name }).closest("li")!;
const click = (root: HTMLElement, name: string | RegExp) => fireEvent.click(within(root).getByRole("button", { name }));
const buttons = (root: HTMLElement) => within(root).queryAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
const statusLine = () => within(section()).getByRole("status");
const alertLine = () => within(section()).getByRole("alert");
const strip = (url: unknown) => String(url).replace("http://localhost:8000", "");
// the requests of one method, as [address, body or null]
const sent = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([url, init]) => [strip(url), init.body ? JSON.parse(init.body) : null]);
const reads = () => asked().filter((line) => line === BUILD);
// holds back every change until the returned function answers it
const hold = () => {
  let finish: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => (finish = resolve));
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (init?.method && init.method !== "GET" ? pending : route(url, init)));
  return (value: Response) => finish(value);
};
const address = () => within(section()).getByLabelText<HTMLInputElement>(/^(Repository address|Adresse du dépôt)$/);
const typeAddress = (value: string) => fireEvent.change(address(), { target: { value } });

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

// ---------- who sees the tab ----------

test.each([
  ["a member in build", inBuild],
  ["a member in review", inReview],
  ["the owner in build", { ...asOwner, ...at("build") }],
])("%s sees the build tab", async (_who, over) => {
  await open(over, tab({ pieces: [payouts] }));
  expect(reads()).toHaveLength(1);
  expect(cards()).toHaveLength(1);
});

test.each([
  ["a member in brainstorm", { ...asMember, ...at("brainstorm") }],
  ["a member in design", { ...asMember, ...at("design") }],
  ["a member before the team is confirmed", asMember],
  ["someone outside the hub, in build", { ...asOutsider, ...at("build") }],
  ["someone invited, in review", { viewer: { membership_status: "invited", member_role: "member" }, ...at("review") }],
])("%s sees no build tab, and no request is made for it", async (_who, over) => {
  nav.search = "id=hub-1";
  api({ "GET /v1/hubs/hub-1": { data: hub(over) }, "GET /v1/hubs/hub-1/members": { data: [owner()] }, "GET /v1/hubs/hub-1/idea": { data: idea() }, "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null }, "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } } });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await screen.findByRole("heading", { level: 2, name: "Phases" });
  expect(document.querySelector("#build")).toBeNull();
  expect(asked().filter((line) => line.includes("/build"))).toEqual([]);
});

test("the line says where things stand: build, review and an archived hub", async () => {
  await open(inBuild);
  expect(within(section()).getByText("Share out the pieces of the sketch, and follow the repository's latest commits.")).toBeTruthy();
  cleanup();
  await open(inReview);
  expect(within(section()).getByText("Build is over. The pieces and the repository stay as they were; commits can still be refreshed.")).toBeTruthy();
  cleanup();
  await open({ ...inBuild, status: "archived" });
  expect(within(section()).getByText("This hub is archived. The build tab stays here to read.")).toBeTruthy();
});

test("while the tab loads there is a status and no list, and a failed load offers Try again", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(inBuild) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, roles: [], technologies: [] } },
    [BUILD]: [refusal(500, "BOOM"), tab({ pieces: [payouts] })],
  });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 2, name: "Build" });
  expect(await within(section()).findByText("We couldn't load the build tab. Nothing was changed, so check your connection and try again.")).toBeTruthy();
  click(section(), "Try again");
  await within(section()).findByRole("heading", { level: 4, name: "Payouts API" });
  // Try again went away with the error, so the line that says so has the focus
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  expect(statusLine().textContent).toBe("The build tab is up to date.");
});

// ---------- who builds what ----------

test("each piece says who builds it, and its buttons come from the flags", async () => {
  await open(inBuild, tab({ pieces: [payouts, mobile, sms] }));
  expect(cards().map((li) => li.textContent)).toEqual([
    "Payouts APIHolds the rules.Nobody yetI'll build this",
    "Mobile appYou are building thisFree this piece",
    "SMS gatewayKwabena Ɔwusu is building this",
  ]);
  expect(buttons(card("Payouts API"))).toEqual(["I'll build this piece, Payouts API"]);
  expect(buttons(card("Mobile app"))).toEqual(["Free this piece, Mobile app"]);
  expect(buttons(card("SMS gateway"))).toEqual([]);
});

test("the owner may free a piece another member builds, and a free piece in review has no button", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ pieces: [{ ...sms, can_release: true }] }));
  expect(buttons(card("SMS gateway"))).toEqual(["Free this piece, SMS gateway"]);
  expect(card("SMS gateway").textContent).toContain("Kwabena Ɔwusu is building this");
  cleanup();
  await open(inReview, tab({ pieces: [{ ...payouts, can_claim: false }] }));
  expect(buttons(card("Payouts API"))).toEqual([]);
  expect(card("Payouts API").textContent).toContain("Nobody yet");
});

test("a hub with no pieces says there is nothing to share out", async () => {
  await open(inBuild, tab());
  expect(within(section()).getByText("The design sketch has no pieces, so there is nothing to share out.")).toBeTruthy();
});

test("claiming a piece sends the claim, the row follows the answer, and the line that says so has the focus", async () => {
  await open(inBuild, tab({ pieces: [payouts, sms] }), {
    "POST /v1/hubs/hub-1/pieces/p-1/claim": { data: { ...payouts, ...heldBy(me, { can_release: true }) } },
  });
  click(card("Payouts API"), "I'll build this piece, Payouts API");
  await waitFor(() => expect(card("Payouts API").textContent).toContain("You are building this"));
  expect(sent("POST")).toEqual([["/v1/hubs/hub-1/pieces/p-1/claim", null]]);
  expect(buttons(card("Payouts API"))).toEqual(["Free this piece, Payouts API"]);
  expect(statusLine().textContent).toBe("You are building Payouts API now.");
  // the claim button went away, so focus does not fall to the page
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
  // the other piece is untouched
  expect(card("SMS gateway").textContent).toContain("Kwabena Ɔwusu is building this");
});

test("freeing a piece needs no dialog, sends the delete, and the piece can be taken again", async () => {
  await open(inBuild, tab({ pieces: [mobile] }), { "DELETE /v1/hubs/hub-1/pieces/p-2/claim": done() });
  click(card("Mobile app"), "Free this piece, Mobile app");
  await waitFor(() => expect(card("Mobile app").textContent).toContain("Nobody yet"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(sent("DELETE")).toEqual([["/v1/hubs/hub-1/pieces/p-2/claim", null]]);
  expect(buttons(card("Mobile app"))).toEqual(["I'll build this piece, Mobile app"]);
  expect(statusLine().textContent).toBe("Mobile app is free again.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
});

test("while a change is on its way its button is busy and nothing else can be sent", async () => {
  await open(inBuild, tab({ pieces: [payouts, piece("p-4", "Ledger")] }));
  const answer = hold();
  const claim = within(card("Payouts API")).getByRole("button");
  fireEvent.click(claim);
  await waitFor(() => expect(claim.getAttribute("aria-busy")).toBe("true"));
  expect(claim.textContent).toBe("I'll build this");
  fireEvent.click(within(card("Ledger")).getByRole("button"));
  fireEvent.click(claim);
  expect(sent("POST")).toHaveLength(1);
  answer(new Response(JSON.stringify({ data: { ...payouts, ...heldBy(me, { can_release: true }) } }), { status: 200 }));
  await waitFor(() => expect(claim.isConnected && claim.getAttribute("aria-busy")).not.toBe("true"));
});

// ---------- the repository ----------

test("the address is a link to GitHub that opens in a new tab; anything else is plain text", async () => {
  await open(inBuild, tab({ ...withRepository }));
  const link = within(section()).getByRole("link", { name: `${REPOSITORY}, opens in a new tab` });
  expect(link.getAttribute("href")).toBe(REPOSITORY);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  cleanup();
  await open(inBuild, tab({ repository_url: "https://example.com/team/app", can_refresh: true }));
  expect(within(section()).queryAllByRole("link")).toEqual([]);
  expect(within(section()).getByText("https://example.com/team/app")).toBeTruthy();
});

test("without the flag there is no field and no Remove, and with no repository the tab says the owner has none", async () => {
  await open(inBuild, tab({ ...withRepository }));
  expect(within(section()).queryByLabelText("Repository address")).toBeNull();
  expect(within(section()).queryByRole("button", { name: "Remove the repository" })).toBeNull();
  cleanup();
  await open(inBuild, tab());
  expect(within(section()).getByText("The hub's owner has not added a repository yet.")).toBeTruthy();
  expect(within(section()).queryByText("Latest commits")).toBeNull();
  expect(within(section()).queryByRole("button", { name: "Refresh commits" })).toBeNull();
});

test("the owner sets the address: it is checked first, tidied, sent, and the tab follows the answer", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ can_set_repository: true }), {
    "PUT /v1/hubs/hub-1/repository": tab({ ...withRepository, can_set_repository: true }),
  });
  expect(within(section()).getByText("A public GitHub repository, for example https://github.com/your-team/your-project. Its latest commits show below.")).toBeTruthy();
  expect(within(section()).queryByRole("button", { name: "Remove the repository" })).toBeNull();
  typeAddress("github.com/pallets/flask");
  click(section(), "Save");
  expect(alertLine().textContent).toBe("Enter the address of a GitHub repository, like https://github.com/your-team/your-project.");
  expect(sent("PUT")).toEqual([]);
  expect(document.activeElement).toBe(address());
  expect(address().getAttribute("aria-describedby")).toContain("build-repository-address-error");
  // the error goes the moment the address is fixed
  typeAddress(` ${REPOSITORY}.git `);
  expect(within(section()).queryByRole("alert")).toBeNull();
  click(section(), "Save");
  await waitFor(() => expect(sent("PUT")).toEqual([["/v1/hubs/hub-1/repository", { repository_url: REPOSITORY }]]));
  await waitFor(() => expect(within(section()).getByRole("link", { name: /flask/ })).toBeTruthy());
  expect(statusLine().textContent).toBe("The repository was saved.");
  expect(address().value).toBe(REPOSITORY);
  expect(within(section()).getByRole("button", { name: "Remove the repository" })).toBeTruthy();
});

test.each(["", "https://github.com/pallets", "https://gitlab.com/pallets/flask", "https://github.com/pallets/flask/issues", "https://github.com/../flask"])(
  "the address %j is refused before anything is sent",
  async (value) => {
    await open({ ...asOwner, ...at("build") }, tab({ can_set_repository: true }));
    typeAddress(value);
    click(section(), "Save");
    expect(alertLine().textContent).toContain("Enter the address of a GitHub repository");
    expect(sent("PUT")).toEqual([]);
  },
);

test("an address the API refuses is the same field error, with the text kept and the focus on the field", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ can_set_repository: true }), { "PUT /v1/hubs/hub-1/repository": unprocessable() });
  typeAddress("https://github.com/pallets/flask");
  click(section(), "Save");
  await waitFor(() => expect(alertLine().textContent).toContain("Enter the address of a GitHub repository"));
  expect(address().value).toBe("https://github.com/pallets/flask");
  expect(document.activeElement).toBe(address());
});

test("changing the address sends the new one, and the commits of the old one are gone", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ ...withRepository, can_set_repository: true, commits: [commit(1, "Fix the parser")] }), {
    "PUT /v1/hubs/hub-1/repository": tab({ repository_url: "https://github.com/pallets/click", can_refresh: true, can_set_repository: true }),
  });
  expect(address().value).toBe(REPOSITORY);
  typeAddress("https://github.com/pallets/click");
  click(section(), "Save");
  await waitFor(() => expect(sent("PUT")).toEqual([["/v1/hubs/hub-1/repository", { repository_url: "https://github.com/pallets/click" }]]));
  await within(section()).findByText("No commits loaded yet. Press Refresh commits.");
  expect(within(section()).queryByText("Fix the parser")).toBeNull();
});

test("removing the repository asks first, then clears it, and the line that says so has the focus", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ ...withRepository, can_set_repository: true, commits: [commit(1, "Fix the parser")] }), {
    "PUT /v1/hubs/hub-1/repository": tab({ can_set_repository: true }),
  });
  click(section(), "Remove the repository");
  const dialog = screen.getByRole("dialog", { name: "Remove the repository?" });
  expect(within(dialog).getByText("The hub will no longer follow a repository, and the commits shown go with it. You can add one again at any time.")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(sent("PUT")).toEqual([]);
  click(section(), "Remove the repository");
  fireEvent.click(within(screen.getByRole("dialog", { name: "Remove the repository?" })).getByRole("button", { name: "Remove the repository" }));
  await waitFor(() => expect(sent("PUT")).toEqual([["/v1/hubs/hub-1/repository", { repository_url: null }]]));
  await waitFor(() => expect(within(section()).queryByText("Fix the parser")).toBeNull());
  expect(within(section()).queryByRole("link")).toBeNull();
  expect(address().value).toBe("");
  expect(statusLine().textContent).toBe("The repository was removed.");
  await waitFor(() => expect(document.activeElement).toBe(statusLine()));
});

test("an address nobody typed in follows the tab when it is read again, and one that was typed stays", async () => {
  const other = "https://github.com/pallets/click";
  await open({ ...asOwner, ...at("build") }, [tab({ ...withRepository, can_set_repository: true }), tab({ repository_url: other, can_refresh: true, can_set_repository: true })], {
    "POST /v1/hubs/hub-1/commits/refresh": tab({ repository_url: other, can_refresh: true, can_set_repository: true }),
  });
  expect(address().value).toBe(REPOSITORY);
  click(section(), "Refresh commits");
  await waitFor(() => expect(address().value).toBe(other));
  typeAddress("https://github.com/pallets/jinja");
  click(section(), "Refresh commits");
  await waitFor(() => expect(sent("POST")).toHaveLength(2));
  expect(address().value).toBe("https://github.com/pallets/jinja");
});

// ---------- the latest commits ----------

const flask = { ...withRepository, commits_refreshed_at: ago(3), commits: [commit(2, "Retry a failed transfer", "Amina Ndiaye"), commit(5, "Add the payouts screen", "Kwabena Ɔwusu")] };

test("the commits are one table: what changed, who, when and the first seven characters of the sha as a link", async () => {
  await open(inBuild, tab(flask));
  const table = within(section()).getByRole("table", { name: "Latest commits" });
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["What changed", "Who", "When", "Commit"]);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
    ["Retry a failed transfer", "Amina Ndiaye", "2 hours ago", "2222222, opens in a new tab"],
    ["Add the payouts screen", "Kwabena Ɔwusu", "5 hours ago", "5555555, opens in a new tab"],
  ]);
  const link = within(rows[0]).getByRole("link");
  expect(link.getAttribute("href")).toBe(`${REPOSITORY}/commit/${sha(2)}`);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  // no second copy of the content for another width
  expect(within(section()).getAllByText("Retry a failed transfer")).toHaveLength(1);
  expect(within(section()).getAllByRole("table")).toHaveLength(1);
  expect(within(section()).getByText("Checked 3 hours ago")).toBeTruthy();
});

test("a commit message and an author name that look like markup stay plain text", async () => {
  const message = "<img src=x onerror=alert(1)> [click](https://evil.example) **bold**";
  await open(inBuild, tab({ ...withRepository, commits: [commit(1, message, "<b>Eve</b>")] }));
  expect(within(section()).getByText(message)).toBeTruthy();
  expect(within(section()).getByText("<b>Eve</b>")).toBeTruthy();
  expect(section().querySelector("img, b, strong")).toBeNull();
  expect(within(section()).getAllByRole("link").map((link) => link.getAttribute("href"))).not.toContain("https://evil.example");
});

test("Refresh commits asks GitHub, keeps its label while it runs, and the whole tab follows the answer", async () => {
  await open(inBuild, tab({ ...withRepository, pieces: [payouts], commits_refreshed_at: ago(3), commits: [commit(2, "Old commit")] }), {
    "POST /v1/hubs/hub-1/commits/refresh": tab({ ...withRepository, pieces: [{ ...payouts, ...heldBy(kwabena) }], commits_refreshed_at: ago(0), commits: [commit(1, "New commit")] }),
  });
  const answer = hold();
  const refresh = within(section()).getByRole("button", { name: "Refresh commits" });
  fireEvent.click(refresh);
  await waitFor(() => expect(refresh.getAttribute("aria-busy")).toBe("true"));
  expect(refresh.textContent).toBe("Refresh commits");
  // nothing else can be sent while it runs
  fireEvent.click(refresh);
  fireEvent.click(within(card("Payouts API")).getByRole("button"));
  expect(sent("POST")).toEqual([["/v1/hubs/hub-1/commits/refresh", null]]);
  answer(new Response(JSON.stringify(tab({ ...withRepository, pieces: [{ ...payouts, ...heldBy(kwabena) }], commits_refreshed_at: ago(0), commits: [commit(1, "New commit")] })), { status: 200 }));
  await within(section()).findByText("New commit");
  expect(within(section()).queryByText("Old commit")).toBeNull();
  expect(statusLine().textContent).toBe("The commits are up to date.");
  expect(within(section()).getByText("Checked 1 minute ago")).toBeTruthy();
  // the claims came with the answer
  expect(card("Payouts API").textContent).toContain("Kwabena Ɔwusu is building this");
  // the button stayed, so the focus did not move
  expect(document.activeElement).not.toBe(statusLine());
});

test("a repository with no commits yet says to press Refresh commits, and a hub that cannot refresh says none were loaded", async () => {
  await open(inBuild, tab({ ...withRepository }));
  expect(within(section()).getByText("No commits loaded yet. Press Refresh commits.")).toBeTruthy();
  expect(within(section()).queryByText(/^Checked/)).toBeNull();
  cleanup();
  await open({ ...inBuild, status: "archived" }, tab({ repository_url: REPOSITORY }));
  expect(within(section()).getByText("No commits were loaded.")).toBeTruthy();
  expect(within(section()).queryByRole("button", { name: "Refresh commits" })).toBeNull();
});

test("in review the commits can still be refreshed but the pieces and the repository cannot change", async () => {
  await open(inReview, tab({ ...flask, pieces: [{ ...payouts, can_claim: false }] }));
  expect(within(section()).getByRole("button", { name: "Refresh commits" })).toBeTruthy();
  expect(within(section()).queryByRole("button", { name: /build this/ })).toBeNull();
  expect(within(section()).queryByLabelText("Repository address")).toBeNull();
});

// ---------- the demo account ----------

test("for the demo account the address and the shas are plain text, and no sentence calls the content made up", async () => {
  await open(inBuild, tab({ ...flask, pieces: [payouts, sms] }), {}, "en", true);
  expect(within(section()).queryAllByRole("link")).toEqual([]);
  expect(within(section()).getByText(REPOSITORY)).toBeTruthy();
  expect(within(section()).getByText("2222222")).toBeTruthy();
  expect(section().textContent).not.toMatch(/made.?up|sample|placeholder|fake|demo/i);
});

test("the demo's refusal is announced by the frame: the tab says nothing of its own", async () => {
  await open(inBuild, tab({ pieces: [payouts] }), { "POST /v1/hubs/hub-1/pieces/p-1/claim": refusal(403, "DEMO_READ_ONLY") }, "en", true);
  click(card("Payouts API"), "I'll build this piece, Payouts API");
  await waitFor(() => expect(sent("POST")).toHaveLength(1));
  await waitFor(() => expect(within(section()).getByRole("button", { name: "I'll build this piece, Payouts API" }).getAttribute("aria-busy")).toBeNull());
  expect(within(section()).queryByRole("alert")).toBeNull();
  expect(within(section()).queryByRole("status")).toBeNull();
  expect(reads()).toHaveLength(1);
});

// ---------- refusals ----------

test("a piece someone else took first: the tab is read again and says so", async () => {
  await open(inBuild, [tab({ pieces: [payouts] }), tab({ pieces: [{ ...payouts, ...heldBy(kwabena) }] })], { "POST /v1/hubs/hub-1/pieces/p-1/claim": refusal(409, "PIECE_CLAIMED") });
  click(card("Payouts API"), "I'll build this piece, Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("Someone else took this piece first."));
  await waitFor(() => expect(card("Payouts API").textContent).toContain("Kwabena Ɔwusu is building this"));
  expect(reads()).toHaveLength(2);
  await waitFor(() => expect(document.activeElement).toBe(alertLine()));
});

test("a piece that is gone: the tab is read again and says the sketch changed", async () => {
  await open(inBuild, [tab({ pieces: [payouts, sms] }), tab({ pieces: [sms] })], { "POST /v1/hubs/hub-1/pieces/p-1/claim": refusal(404, "PIECE_NOT_FOUND") });
  click(card("Payouts API"), "I'll build this piece, Payouts API");
  await waitFor(() => expect(alertLine().textContent).toBe("The sketch was changed. This is how it stands now."));
  await waitFor(() => expect(cards()).toHaveLength(1));
});

test("a repository that is not there any more: the tab is read again", async () => {
  await open(inBuild, [tab({ ...withRepository }), tab()], { "POST /v1/hubs/hub-1/commits/refresh": refusal(409, "REPOSITORY_NOT_SET") });
  click(section(), "Refresh commits");
  await waitFor(() => expect(alertLine().textContent).toBe("The repository was changed. This is how it stands now."));
  await waitFor(() => expect(within(section()).queryByRole("button", { name: "Refresh commits" })).toBeNull());
  expect(reads()).toHaveLength(2);
});

test.each([
  ["freeing a piece nobody may free", { ...mobile }, "DELETE /v1/hubs/hub-1/pieces/p-2/claim", refusal(403, "NOT_PIECE_HOLDER"), "Free this piece, Mobile app", "Only the person building a piece, or the hub's owner, can free it."],
  ["the commits checked a moment ago", null, "POST /v1/hubs/hub-1/commits/refresh", refusal(409, "REFRESH_TOO_SOON"), "Refresh commits", "The commits were checked less than a minute ago. Try again in a moment."],
  [
    "a repository GitHub cannot read",
    null,
    "POST /v1/hubs/hub-1/commits/refresh",
    refusal(502, "REPOSITORY_UNAVAILABLE"),
    "Refresh commits",
    "We couldn't read that repository. Check that it exists and is public, then try again. The commits shown are from the last check.",
  ],
  ["any other failure", null, "POST /v1/hubs/hub-1/commits/refresh", refusal(500, "BOOM"), "Refresh commits", "We couldn't save that. Nothing changed, so try again."],
])("%s is a sentence, and the commits shown stay", async (_what, mine, route, answer, button, sentence) => {
  await open(inBuild, tab({ ...flask, pieces: mine ? [mine] : [] }), { [route]: answer });
  click(section(), button);
  await waitFor(() => expect(alertLine().textContent).toBe(sentence));
  expect(within(section()).getByText("Retry a failed transfer")).toBeTruthy();
  expect(reads()).toHaveLength(1);
});

test("only the owner may set the repository: a refusal is a sentence", async () => {
  await open({ ...asOwner, ...at("build") }, tab({ can_set_repository: true }), { "PUT /v1/hubs/hub-1/repository": refusal(403, "NOT_HUB_OWNER") });
  typeAddress(REPOSITORY);
  click(section(), "Save");
  await waitFor(() => expect(alertLine().textContent).toBe("Only the hub's owner can set the repository."));
  expect(address().value).toBe(REPOSITORY);
});

test.each(["PHASE_CLOSED", "PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED", "NOT_HUB_MEMBER"])(
  "%s means the hub moved on: it is loaded again, the tab follows it and says so",
  async (code) => {
    await open(inBuild, [tab({ pieces: [payouts] }), tab({ pieces: [{ ...payouts, can_claim: false }] })], {
      "GET /v1/hubs/hub-1": [{ data: hub(inBuild) }, { data: hub(inReview) }],
      "POST /v1/hubs/hub-1/pieces/p-1/claim": refusal(409, code),
    });
    click(card("Payouts API"), "I'll build this piece, Payouts API");
    await waitFor(() => expect(alertLine().textContent).toBe("This hub has moved on, so the build tab can no longer be changed."));
    await waitFor(() => expect(within(section()).getByText(/^Build is over\./)).toBeTruthy());
    await waitFor(() => expect(buttons(card("Payouts API"))).toEqual([]));
    await waitFor(() => expect(document.activeElement).toBe(alertLine()));
  },
);

test("a hub that moved on before the tab loaded shows no tab", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": [{ data: hub(inBuild) }, { data: hub({ ...asMember, ...at("design") }) }],
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/notes": { data: [], next_offset: null },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "GET /v1/me": { data: { username: me.username, display_name: me.display_name, roles: [], technologies: [] } },
    [BUILD]: refusal(409, "PHASE_NOT_STARTED"),
  });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  await waitFor(() => expect(asked().filter((line) => line === "GET /v1/hubs/hub-1")).toHaveLength(2));
  await waitFor(() => expect(document.querySelector("#build")).toBeNull());
});

// ---------- French ----------

test("in French the tab, its buttons, its table and its refusals are French", async () => {
  await open(
    { ...asOwner, ...at("build") },
    tab({ ...flask, can_set_repository: true, pieces: [payouts, mobile, sms] }),
    { "POST /v1/hubs/hub-1/commits/refresh": refusal(409, "REFRESH_TOO_SOON") },
    "fr",
  );
  expect(within(section()).getByRole("heading", { level: 2, name: "Construction" })).toBeTruthy();
  expect(within(section()).getByRole("heading", { level: 3, name: "Qui construit quoi" })).toBeTruthy();
  expect(within(section()).getByText("Répartissez les composants du schéma et suivez les derniers commits du dépôt.")).toBeTruthy();
  expect(cards().map((li) => li.textContent)).toEqual([
    "Payouts APIHolds the rules.Personne pour le momentJe construis ce composant",
    "Mobile appVous construisez ce composantLibérer ce composant",
    "SMS gatewayKwabena Ɔwusu construit ce composant",
  ]);
  expect(buttons(card("Payouts API"))).toEqual(["Je construis ce composant, Payouts API"]);
  expect(buttons(card("Mobile app"))).toEqual(["Libérer ce composant, Mobile app"]);
  expect(within(section()).getByRole("link", { name: `${REPOSITORY}, s'ouvre dans un nouvel onglet` })).toBeTruthy();
  expect(within(section()).getByText("Vérifié il y a 3 heures")).toBeTruthy();
  expect(within(section()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Ce qui a changé", "Qui", "Quand", "Commit"]);
  click(section(), "Actualiser les commits");
  await waitFor(() => expect(alertLine().textContent).toBe("Les commits ont été vérifiés il y a moins d'une minute. Réessayez dans un instant."));
  typeAddress("pas une adresse");
  click(section(), "Enregistrer");
  expect(within(section()).getByText("Saisissez l'adresse d'un dépôt GitHub, par exemple https://github.com/votre-equipe/votre-projet.")).toBeTruthy();
  click(section(), "Retirer le dépôt");
  expect(screen.getByRole("dialog", { name: "Retirer le dépôt\u202f?" })).toBeTruthy();
});

test("in French a hub in review says the build is over, with the narrow no-break space before the semicolon", async () => {
  await open(inReview, tab(), {}, "fr");
  expect(section().textContent).toContain("La construction est terminée. Les composants et le dépôt restent tels quels\u202f; les commits peuvent encore être actualisés.");
});
