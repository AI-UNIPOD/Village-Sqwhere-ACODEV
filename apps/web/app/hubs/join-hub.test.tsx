import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { JoinHub } from "./join-hub";
import { agreement, api, asked, fetchMock, hub, posted, refusal, reply } from "./test-support";

const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { push, replace, router: { push, replace }, search: "id=hub-1" };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const invited = { viewer: { membership_status: "invited", member_role: "member" } };
// the hub's own agreement carries the terms it was created with
const hubAgreement = (over: Record<string, unknown> = {}) =>
  agreement({ title: "Hub agreement v1", hub_terms: { ownership_model: "owner_majority", notes: "The owner keeps 60%." }, ...over });

async function join(routes: Record<string, unknown> = {}, hubOver: Record<string, unknown> = invited) {
  api({
    "GET /v1/hubs/hub-1": { data: hub(hubOver) },
    "GET /v1/hubs/hub-1/agreement": { data: hubAgreement() },
    ...routes,
  });
  render(<JoinHub lang="en" />);
  return await screen.findByLabelText("Your full legal name");
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const tick = () => fireEvent.click(screen.getByRole("checkbox", { name: "I have read this agreement and the terms above." }));

function fillAndSign() {
  tick();
  type("Your full legal name", "  Wanjiru Kamau ");
  press("Sign and join");
}

beforeEach(() => {
  nav.search = "id=hub-1";
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

test("the page shows the hub's own terms and agreement, as the server sends them", async () => {
  await join();
  expect(screen.getByRole("heading", { level: 1, name: "Join Borehole map hub" })).toBeTruthy();
  expect(screen.getByText("Kwabena Owusu invited you to build Borehole map for Kaduna. Read the terms and the agreement, then sign to join.")).toBeTruthy();
  expect(screen.getAllByText("Owner majority").length).toBeGreaterThan(0);
  expect(screen.getByText("The owner keeps 60%.")).toBeTruthy();
  expect(screen.getByText("Every member signs these same terms. They cannot be changed.")).toBeTruthy();
  expect(screen.getByText("Hub agreement v1")).toBeTruthy();
  expect(screen.getByText("Version 1")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Agreement text" })).getByRole("heading", { name: "Hub agreement" })).toBeTruthy();
  // this hub's agreement, never the current one
  expect(asked()).toContain("GET /v1/hubs/hub-1/agreement");
  expect(asked().some((call) => call.includes("/agreements/current"))).toBe(false);
});

test("the placeholder warning shows only while the agreement's title says TEST", async () => {
  await join({ "GET /v1/hubs/hub-1/agreement": { data: hubAgreement({ title: "TEST AGREEMENT (NOT LEGAL TEXT)" }) } });
  expect(screen.getByText("This is placeholder text, not a legal agreement")).toBeTruthy();
  cleanup();
  await join();
  expect(screen.queryByText("This is placeholder text, not a legal agreement")).toBeNull();
});

test("nothing is sent without the box ticked and a legal name", async () => {
  await join();
  press("Sign and join");
  expect(screen.getByText("Read the agreement, then tick this box to sign.")).toBeTruthy();
  expect(screen.getByText("Type your full legal name, at least 2 characters.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("checkbox")));
  expect(screen.queryByRole("dialog")).toBeNull();
  tick();
  press("Sign and join");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Your full legal name")));
  expect(posted()).toEqual([]);
});

test("the dialog says back what is signed, and confirming sends the id and hash that were shown", async () => {
  await join({ "POST /v1/hubs/hub-1/invitation/accept": reply(200, { data: hub() }) });
  fillAndSign();
  const dialog = screen.getByRole("dialog", { name: "Join this hub?" });
  expect(within(dialog).getByText("Borehole map hub")).toBeTruthy();
  expect(within(dialog).getByText("Owner majority")).toBeTruthy();
  expect(within(dialog).getByText("Signed as Wanjiru Kamau")).toBeTruthy();
  expect(posted()).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Sign and join" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/hubs/view?id=hub-1&joined=1"));
  expect(posted()).toEqual([
    ["/v1/hubs/hub-1/invitation/accept", { template_id: "template-1", template_sha256: "a".repeat(64), signed_legal_name: "Wanjiru Kamau" }],
  ]);
});

test("when the agreement changed, the new text is shown, the box is cleared and the name stays", async () => {
  await join({
    "GET /v1/hubs/hub-1/agreement": [{ data: hubAgreement() }, { data: hubAgreement({ version: 2, body: "# New text", body_sha256: "b".repeat(64) }) }],
    "POST /v1/hubs/hub-1/invitation/accept": refusal(409, "AGREEMENT_MISMATCH"),
  });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  expect(await screen.findByText("The agreement changed while you were reading. Read the new text, then sign again.")).toBeTruthy();
  expect(await screen.findByText("Version 2")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Agreement text" })).getByRole("heading", { name: "New text" })).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText("Your full legal name") as HTMLInputElement).value).toBe("  Wanjiru Kamau ");
  expect(nav.push).not.toHaveBeenCalled();
});

test("any other failure says so above the button and keeps everything typed", async () => {
  await join({ "POST /v1/hubs/hub-1/invitation/accept": refusal(500, "BOOM") });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  expect(await screen.findByText(/We couldn't complete your signature. Nothing you typed was lost/)).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Your full legal name") as HTMLInputElement).value).toBe("  Wanjiru Kamau ");
});

test.each([
  ["never invited", { viewer: { membership_status: null, member_role: null } }],
  ["declined", { viewer: { membership_status: "declined", member_role: "member" } }],
])("someone who %s gets the no-invitation screen, with a link to the hub and no form", async (_who, over) => {
  api({ "GET /v1/hubs/hub-1": { data: hub(over) }, "GET /v1/hubs/hub-1/agreement": { data: hubAgreement() } });
  render(<JoinHub lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "There is no invitation to sign" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the hub" }).getAttribute("href")).toBe("/en/hubs/view?id=hub-1");
  expect(screen.queryByLabelText("Your full legal name")).toBeNull();
});

test("an invitation withdrawn while the person read gives the same screen when they sign", async () => {
  await join({ "POST /v1/hubs/hub-1/invitation/accept": refusal(404, "INVITATION_NOT_FOUND") });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  expect(await screen.findByRole("heading", { level: 1, name: "There is no invitation to sign" })).toBeTruthy();
});

test("an active member goes straight to the hub, on arrival and when the send says so", async () => {
  api({
    "GET /v1/hubs/hub-1": { data: hub({ viewer: { membership_status: "active", member_role: "member" } }) },
    "GET /v1/hubs/hub-1/agreement": { data: hubAgreement() },
  });
  render(<JoinHub lang="en" />);
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/hubs/view?id=hub-1"));
  expect(screen.queryByLabelText("Your full legal name")).toBeNull();
  cleanup();
  nav.replace.mockClear();

  await join({ "POST /v1/hubs/hub-1/invitation/accept": refusal(409, "ALREADY_MEMBER") });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/hubs/view?id=hub-1"));
});

test("an archived hub cannot be joined, whether it is known on arrival or when the send says so", async () => {
  api({ "GET /v1/hubs/hub-1": { data: hub({ ...invited, status: "archived" }) }, "GET /v1/hubs/hub-1/agreement": { data: hubAgreement() } });
  render(<JoinHub lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "This hub is archived, so nobody can join." })).toBeTruthy();
  cleanup();

  await join({ "POST /v1/hubs/hub-1/invitation/accept": refusal(409, "HUB_ARCHIVED") });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  expect(await screen.findByRole("heading", { level: 1, name: "This hub is archived, so nobody can join." })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the hub" })).toBeTruthy();
});

test("a team that filled up while the person was reading says so, and nothing is signed", async () => {
  await join({ "POST /v1/hubs/hub-1/invitation/accept": refusal(409, "TEAM_FULL") });
  fillAndSign();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign and join" }));
  expect(await screen.findByRole("heading", { level: 1, name: "The team is full, so you did not join." })).toBeTruthy();
  expect(screen.getByText(/all five places are taken/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open the hub" })).toBeTruthy();
});

test("a hub that does not exist, or no id at all, shows the missing hub screen", async () => {
  api({ "GET /v1/hubs/hub-1": refusal(404, "NOT_FOUND"), "GET /v1/hubs/hub-1/agreement": refusal(404, "NOT_FOUND") });
  render(<JoinHub lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this hub" })).toBeTruthy();
  cleanup();
  fetchMock.mockClear();

  nav.search = "";
  render(<JoinHub lang="en" />);
  expect(screen.getByRole("heading", { level: 1, name: "We couldn't find this hub" })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the join page in French says the same things", async () => {
  api({ "GET /v1/hubs/hub-1": { data: hub(invited) }, "GET /v1/hubs/hub-1/agreement": { data: hubAgreement() } });
  render(<JoinHub lang="fr" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Rejoindre Borehole map hub" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Signer et rejoindre" })).toBeTruthy();
});
