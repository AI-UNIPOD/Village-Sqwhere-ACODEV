import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { MyHubs } from "./my-hubs";
import { api, asked, fetchMock, hub, idea, member, owner, posted, refusal, reply } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const wanjiru = member("wanjiru-kamau", "Wanjiru Kamau", { status: "invited", joined_at: null });
const amina = member("amina-ndiaye", "Amina Ndiaye", { status: "declined", joined_at: null });
const tendai = member("tendai-moyo", "Tendai Moyo");

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asMember = { viewer: { membership_status: "active", member_role: "member" } };

// the hub page for one viewer, with the team and the brief as given
async function open(hubOver: Record<string, unknown>, people: unknown[], routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(hubOver) },
    "GET /v1/hubs/hub-1/members": { data: people },
    "GET /v1/hubs/hub-1/idea": { data: idea({ details: "First line.\nSecond line." }) },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const username = () => screen.getByLabelText("GitHub username") as HTMLInputElement;

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

// ---------- the team ----------

test("a member sees the people with their part, the verified tick and the count of active members", async () => {
  await open(asMember, [owner(), tendai, wanjiru]);
  expect(await screen.findByText("Tendai Moyo")).toBeTruthy();
  expect(screen.getByText("2 of 5 members")).toBeTruthy();
  const rows = screen.getAllByRole("listitem");
  const kwabena = rows.find((row) => row.textContent?.includes("Kwabena Owusu"))!;
  expect(kwabena.textContent).toContain("Owner");
  expect(kwabena.textContent).toContain("Verified");
  expect(rows.find((row) => row.textContent?.includes("Tendai Moyo"))!.textContent).toContain("Member");
  // a member cannot invite or withdraw
  expect(screen.queryByLabelText("GitHub username")).toBeNull();
});

test("a team that fails to load says so inside its section, and loads on Try again", async () => {
  await open(asMember, [], { "GET /v1/hubs/hub-1/members": [refusal(500, "BOOM"), { data: [owner(), tendai] }] });
  expect(await screen.findByText(/We couldn't load the team/)).toBeTruthy();
  // the rest of the page is still there
  expect(screen.getByRole("heading", { level: 2, name: "Terms" })).toBeTruthy();
  press("Try again");
  expect(await screen.findByText("Tendai Moyo")).toBeTruthy();
  expect(screen.queryByText(/We couldn't load the team/)).toBeNull();
});

// ---------- the brief ----------

test("a member reads the confidential brief with its line breaks, under the lock line", async () => {
  await open(asMember, [owner()]);
  const text = await screen.findByText(/First line\./);
  expect(text.textContent).toBe("First line.\nSecond line.");
  expect(screen.getByText("Only the team sees this.")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "The brief" })).toBeTruthy();
});

test("a brief is plain text: markup in it is shown as characters", async () => {
  await open(asMember, [owner()], { "GET /v1/hubs/hub-1/idea": { data: idea({ details: "<b>Bold</b> [link](http://x.test)" }) } });
  expect(await screen.findByText("<b>Bold</b> [link](http://x.test)")).toBeTruthy();
});

test("with no brief the member is told, and only the owner is offered the way to write one", async () => {
  await open(asMember, [owner()], { "GET /v1/hubs/hub-1/idea": { data: idea() } });
  expect(await screen.findByText("The owner has not written a brief yet.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Write the brief" })).toBeNull();
  cleanup();
  await open(asOwner, [owner()], { "GET /v1/hubs/hub-1/idea": { data: idea() } });
  expect((await screen.findByRole("link", { name: "Write the brief" })).getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
});

test("a brief that fails to load says so inside its section, and can be tried again", async () => {
  await open(asMember, [owner()], { "GET /v1/hubs/hub-1/idea": [refusal(500, "BOOM"), { data: idea({ details: "Back again." }) }] });
  expect(await screen.findByText(/We couldn't load the brief/)).toBeTruthy();
  fireEvent.click(within(screen.getByText(/We couldn't load the brief/).closest("section")!).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Back again.")).toBeTruthy();
});

test.each([
  ["someone who was never a member", { viewer: { membership_status: null, member_role: null } }],
  ["an invited developer", { viewer: { membership_status: "invited", member_role: "member" } }],
  ["a developer who declined", { viewer: { membership_status: "declined", member_role: "member" } }],
])("%s never triggers a request for the team or the brief", async (_who, over) => {
  await open(over, [owner()]);
  expect(asked().filter((call) => /\/(idea|members)$/.test(call))).toEqual([]);
  expect(screen.queryByRole("heading", { name: "The brief" })).toBeNull();
});

// ---------- inviting, as the owner ----------

test("the owner also sees who is invited or declined, and can invite from the page's main button", async () => {
  await open(asOwner, [owner(), tendai, wanjiru, amina]);
  expect(await screen.findByText("Wanjiru Kamau")).toBeTruthy();
  const rowOf = (name: string) => within(screen.getAllByRole("listitem").find((row) => row.textContent?.includes(name))!);
  expect(rowOf("Wanjiru Kamau").getByText("Invited")).toBeTruthy();
  expect(rowOf("Wanjiru Kamau").getByRole("button", { name: "Withdraw: Wanjiru Kamau" })).toBeTruthy();
  expect(rowOf("Amina Ndiaye").getByText("Declined")).toBeTruthy();
  // someone who has not joined is not called a member
  expect(rowOf("Wanjiru Kamau").queryByText("Member")).toBeNull();
  expect(rowOf("Amina Ndiaye").queryByText("Member")).toBeNull();
  expect(rowOf("Amina Ndiaye").getByRole("button", { name: "Invite again: Amina Ndiaye" })).toBeTruthy();
  // only active people count
  expect(screen.getByText("2 of 5 members")).toBeTruthy();
  expect(screen.getByText("The developer must have signed in to Village Sqwhere once.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send invite" })).toBeTruthy();
});

test("inviting sends the username without the @, then shows the new person, the status line and the empty field", async () => {
  await open(asOwner, [owner()], { "POST /v1/hubs/hub-1/invitations": reply(201, { data: wanjiru }) });
  const field = await screen.findByLabelText("GitHub username");
  fireEvent.change(field, { target: { value: "  @wanjiru-kamau " } });
  press("Send invite");

  expect((await screen.findByRole("status")).textContent).toContain("Invitation sent to Wanjiru Kamau.");
  expect(posted()).toEqual([["/v1/hubs/hub-1/invitations", { username: "wanjiru-kamau" }]]);
  const row = screen.getAllByRole("listitem").find((item) => item.textContent?.includes("Wanjiru Kamau"))!;
  expect(within(row).getByText("Invited")).toBeTruthy();
  expect(username().value).toBe("");
  expect(document.activeElement).toBe(username());
});

test.each([
  ["USER_NOT_FOUND", 404, "No developer here has that username. Check the spelling, or ask them to sign in to Village Sqwhere first."],
  ["ALREADY_MEMBER", 409, "They are already in this hub."],
  ["ALREADY_INVITED", 409, "They already have an invitation."],
  ["HUB_ARCHIVED", 409, "This hub is archived, so nobody can be invited."],
  ["BOOM", 500, "The invitation was not sent. What you typed is still here, so check your connection and try again."],
])("an invitation refused with %s says so under the field and keeps what was typed", async (code, status, sentence) => {
  await open(asOwner, [owner()], { "POST /v1/hubs/hub-1/invitations": refusal(status, code) });
  fireEvent.change(await screen.findByLabelText("GitHub username"), { target: { value: "nobody-here" } });
  press("Send invite");
  expect((await screen.findByRole("alert")).textContent).toContain(sentence);
  expect(username().value).toBe("nobody-here");
  expect(username().getAttribute("aria-invalid")).toBe("true");
  expect(screen.queryByRole("status")).toBeNull();
});

test("a malformed or empty username gets the example, and an empty one sends nothing", async () => {
  await open(asOwner, [owner()], { "POST /v1/hubs/hub-1/invitations": reply(422, { detail: [{ loc: ["body", "username"], msg: "bad" }] }) });
  await screen.findByLabelText("GitHub username");
  press("Send invite");
  expect((await screen.findByRole("alert")).textContent).toContain("Enter a GitHub username, like ada-obi.");
  expect(posted()).toEqual([]);
  fireEvent.change(username(), { target: { value: "bad name" } });
  press("Send invite");
  await waitFor(() => expect(posted()).toHaveLength(1));
  expect((await screen.findByRole("alert")).textContent).toContain("Enter a GitHub username, like ada-obi.");
});

test("withdrawing asks first, then deletes the invitation and removes the row", async () => {
  await open(asOwner, [owner(), wanjiru], { "DELETE /v1/hubs/hub-1/invitations/id-wanjiru-kamau": new Response(null, { status: 204 }) });
  await screen.findByText("Wanjiru Kamau");
  press("Withdraw: Wanjiru Kamau");
  const dialog = screen.getByRole("dialog", { name: "Withdraw this invitation?" });
  expect(within(dialog).getByText("They can be invited again later.")).toBeTruthy();
  expect(asked().filter((call) => call.startsWith("DELETE"))).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
  await waitFor(() => expect(screen.queryByText("Wanjiru Kamau")).toBeNull());
  expect(asked().filter((call) => call.startsWith("DELETE"))).toEqual(["DELETE /v1/hubs/hub-1/invitations/id-wanjiru-kamau"]);
});

test("backing out of a withdrawal changes nothing", async () => {
  await open(asOwner, [owner(), wanjiru]);
  await screen.findByText("Wanjiru Kamau");
  press("Withdraw: Wanjiru Kamau");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep it" }));
  expect(screen.getByText("Wanjiru Kamau")).toBeTruthy();
  expect(asked().filter((call) => call.startsWith("DELETE"))).toEqual([]);
});

test("Invite again sends the invitation again and the row becomes Invited", async () => {
  await open(asOwner, [owner(), amina], { "POST /v1/hubs/hub-1/invitations": reply(201, { data: { ...amina, status: "invited" } }) });
  await screen.findByText("Amina Ndiaye");
  press("Invite again: Amina Ndiaye");
  await waitFor(() => expect(screen.queryByText("Declined")).toBeNull());
  expect(posted()).toEqual([["/v1/hubs/hub-1/invitations", { username: "amina-ndiaye" }]]);
  expect(screen.getByText("Invited")).toBeTruthy();
  expect(screen.getAllByText("Amina Ndiaye")).toHaveLength(1);
});

test("a failed withdrawal or second invitation says so and changes nothing", async () => {
  await open(asOwner, [owner(), wanjiru], { "DELETE /v1/hubs/hub-1/invitations/": refusal(500, "BOOM") });
  await screen.findByText("Wanjiru Kamau");
  press("Withdraw: Wanjiru Kamau");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }));
  expect((await screen.findByRole("alert")).textContent).toContain("That did not go through.");
  expect(screen.getByText("Wanjiru Kamau")).toBeTruthy();
});

test("with five active members the invite form gives way to the full-team note", async () => {
  const five = [owner(), member("a-one", "A One"), member("b-two", "B Two"), member("c-three", "C Three"), member("d-four", "D Four")];
  await open(asOwner, five);
  expect(await screen.findByText("The team is full: five members is the most a hub takes.")).toBeTruthy();
  expect(screen.getByText("5 of 5 members")).toBeTruthy();
  expect(screen.queryByLabelText("GitHub username")).toBeNull();
  expect(screen.queryByRole("button", { name: "Send invite" })).toBeNull();
});

test("the team's French is the same page, with a person's name in the button's name", async () => {
  await open(asOwner, [owner(), wanjiru], {}, "fr");
  expect(await screen.findByRole("button", { name: /^Retirer.\: Wanjiru Kamau$/ })).toBeTruthy();
  expect(screen.getByLabelText("Nom d'utilisateur GitHub")).toBeTruthy();
  expect(screen.getByText("Invité")).toBeTruthy();
});

// ---------- the other viewers ----------

test("an invited developer sees the invitation card with the way to sign, and no team or brief", async () => {
  await open({ viewer: { membership_status: "invited", member_role: "member" } }, [owner()]);
  expect(screen.getByRole("heading", { level: 2, name: "You are invited to this hub." })).toBeTruthy();
  expect(screen.getByText("Read the agreement and the terms, then sign to join. Until you sign you cannot read the brief.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Read and sign" }).getAttribute("href")).toBe("/en/hubs/join?id=hub-1");
  expect(screen.queryByText("You are not a member of this hub.")).toBeNull();
  expect(screen.queryByLabelText("GitHub username")).toBeNull();
});

test("declining asks first, then declines and says so", async () => {
  await open({ viewer: { membership_status: "invited", member_role: "member" } }, [], {
    "POST /v1/hubs/hub-1/invitation/decline": reply(200, { data: hub({ viewer: { membership_status: "declined", member_role: "member" } }) }),
  });
  press("Decline");
  const dialog = screen.getByRole("dialog", { name: "Decline this invitation?" });
  expect(within(dialog).getByText("The owner can invite you again later.")).toBeTruthy();
  expect(posted()).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
  expect(await screen.findByText("You declined the invitation to this hub.")).toBeTruthy();
  expect(posted()).toEqual([["/v1/hubs/hub-1/invitation/decline", null]]);
  expect(screen.queryByRole("link", { name: "Read and sign" })).toBeNull();
});

test("a developer who declined sees their line and nothing private", async () => {
  await open({ viewer: { membership_status: "declined", member_role: "member" } }, []);
  expect(screen.getByText("You declined the invitation to this hub.")).toBeTruthy();
  expect(screen.queryByText("You are not a member of this hub.")).toBeNull();
  expect(screen.queryByRole("link", { name: "Read and sign" })).toBeNull();
});

test("the success message after joining shows for an active member only", async () => {
  nav.search = "id=hub-1&joined=1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(asMember) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea({ details: "The brief." }) },
  });
  render(<HubPage lang="en" />);
  const message = await screen.findByText("You are in. The brief and the team are now open to you.");
  expect(message.closest('[role="status"]')).toBeTruthy();
  expect(await screen.findByText("The brief.")).toBeTruthy();
  cleanup();
  api({ "GET /v1/hubs/hub-1": { data: hub({ viewer: { membership_status: "invited", member_role: "member" } }) } });
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 2, name: "You are invited to this hub." });
  expect(screen.queryByText("You are in. The brief and the team are now open to you.")).toBeNull();
});

// ---------- your hubs: invitations ----------

const invited = hub({ id: "hub-9", name: "Clinic queue hub", idea: { id: "idea-9", title: "Clinic queue", summary: "Waiting rooms." }, owner: { username: "ama-mensah", display_name: "Ama Mensah", is_verified: false }, viewer: { membership_status: "invited", member_role: "member" } });

test("your hubs show the invitations above the hubs, each leading to its hub", async () => {
  api({ "GET /v1/me/hubs": { data: [hub()], next_offset: null }, "GET /v1/me/hubs?status=invited": { data: [invited] } });
  render(<MyHubs lang="en" />);
  const heading = await screen.findByRole("heading", { level: 2, name: "Invitations" });
  const card = screen.getByRole("link", { name: "Clinic queue hub" }).closest("li")!;
  expect(card.textContent).toContain("Clinic queue");
  expect(card.textContent).toContain("Invited by Ama Mensah");
  expect(screen.getByRole("link", { name: "Clinic queue hub" }).getAttribute("href")).toBe("/en/hubs/view?id=hub-9");
  const hubs = screen.getByRole("link", { name: "Borehole map hub" });
  expect(heading.compareDocumentPosition(hubs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("your hubs still list when the invitations request fails, and show no Invitations section", async () => {
  api({ "GET /v1/me/hubs": { data: [hub()], next_offset: null }, "GET /v1/me/hubs?status=invited": refusal(500, "BOOM") });
  render(<MyHubs lang="en" />);
  expect(await screen.findByRole("link", { name: "Borehole map hub" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Invitations" })).toBeNull();
});

test("invitations without any hub still show the empty state for hubs below them", async () => {
  api({ "GET /v1/me/hubs": { data: [], next_offset: null }, "GET /v1/me/hubs?status=invited": { data: [invited] } });
  render(<MyHubs lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "Invitations" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "No hubs yet" })).toBeTruthy();
});
