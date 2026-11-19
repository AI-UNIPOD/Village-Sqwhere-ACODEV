import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, demoRefusal, fetchMock, hub, idea, member, owner, posted, refusal, reply, saidNotSaved } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const tendai = member("tendai-moyo", "Tendai Moyo");
const wanjiru = member("wanjiru-kamau", "Wanjiru Kamau", { status: "invited", joined_at: null });

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asMember = { viewer: { membership_status: "active", member_role: "member" } };
const asLeft = { viewer: { membership_status: "left", member_role: "member" } };
const asRemoved = { viewer: { membership_status: "removed", member_role: "member" } };

async function open(hubOver: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(hubOver) },
    "GET /v1/hubs/hub-1/members": { data: [owner(), tendai, wanjiru] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const dialog = (name: string) => screen.getByRole("dialog", { name });
const removeButton = () => screen.queryByRole("button", { name: "Remove: Tendai Moyo" });

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

// ---------- the owner removes a member ----------

test("the owner can remove an active member, never themself nor someone only invited", async () => {
  await open(asOwner);
  await screen.findByText("Tendai Moyo");
  expect(removeButton()).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove: Kwabena Owusu" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove: Wanjiru Kamau" })).toBeNull();
});

test("a member and the owner of an archived hub see no Remove", async () => {
  await open(asMember);
  await screen.findByText("Tendai Moyo");
  expect(removeButton()).toBeNull();
  cleanup();
  await open({ ...asOwner, status: "archived" });
  await screen.findByText("Tendai Moyo");
  expect(removeButton()).toBeNull();
});

test("removing asks first, then takes the person off the list and says so", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/members/id-tendai-moyo/remove": { data: { ...tendai, status: "removed" } } });
  await screen.findByText("Tendai Moyo");
  fireEvent.click(removeButton()!);
  fireEvent.click(within(dialog("Remove this member?")).getByRole("button", { name: "Keep them" }));
  expect(posted()).toEqual([]);
  fireEvent.click(removeButton()!);
  fireEvent.click(within(dialog("Remove this member?")).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.queryByText("Tendai Moyo")).toBeNull());
  expect(posted()).toEqual([["/v1/hubs/hub-1/members/id-tendai-moyo/remove", null]]);
  expect(screen.getByText("Tendai Moyo was removed from the hub.").getAttribute("role")).toBe("status");
  expect(screen.getByText("1 of 5 members")).toBeTruthy();
});

test("someone who already left is not removed twice: the list is read again", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/members/id-tendai-moyo/remove": refusal(404, "MEMBER_NOT_FOUND") });
  await screen.findByText("Tendai Moyo");
  fireEvent.click(removeButton()!);
  fireEvent.click(within(dialog("Remove this member?")).getByRole("button", { name: "Remove" }));
  expect(await screen.findByText("Tendai Moyo is no longer an active member. The list is up to date.")).toBeTruthy();
  await waitFor(() => expect(asked().filter((line) => line === "GET /v1/hubs/hub-1/members")).toHaveLength(2));
});

test.each([
  ["HUB_ARCHIVED", 409, "This hub is archived"],
  ["INTERNAL", 500, "That did not go through. Nothing was changed, so try again."],
])("a removal refused with %s says why and keeps the person", async (code, status, text) => {
  await open(asOwner, { "POST /v1/hubs/hub-1/members/id-tendai-moyo/remove": refusal(status, code) });
  await screen.findByText("Tendai Moyo");
  fireEvent.click(removeButton()!);
  fireEvent.click(within(dialog("Remove this member?")).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(text));
  expect(screen.getByText("Tendai Moyo")).toBeTruthy();
});

// ---------- a member leaves ----------

test("a member can leave; the owner cannot", async () => {
  await open(asMember);
  expect(await screen.findByRole("button", { name: "Leave this hub" })).toBeTruthy();
  cleanup();
  await open(asOwner);
  await screen.findByText("Tendai Moyo");
  expect(screen.queryByRole("button", { name: "Leave this hub" })).toBeNull();
});

test("leaving asks first, then shows the hub as someone who left it", async () => {
  await open(asMember, { "POST /v1/hubs/hub-1/membership/leave": { data: hub(asLeft) } });
  fireEvent.click(await screen.findByRole("button", { name: "Leave this hub" }));
  fireEvent.click(within(dialog("Leave this hub?")).getByRole("button", { name: "Stay" }));
  expect(posted()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Leave this hub" }));
  fireEvent.click(within(dialog("Leave this hub?")).getByRole("button", { name: "Leave the hub" }));
  expect(await screen.findByText("You left this hub. The agreement you signed still covers what you saw.")).toBeTruthy();
  expect(posted()).toEqual([["/v1/hubs/hub-1/membership/leave", null]]);
  expect(screen.queryByRole("button", { name: "Leave this hub" })).toBeNull();
  expect(screen.queryByText("Tendai Moyo")).toBeNull();
});

test("someone already out of the hub sees the hub as it is now instead of an error", async () => {
  await open(asMember, {
    "GET /v1/hubs/hub-1": [{ data: hub(asMember) }, { data: hub(asRemoved) }],
    "POST /v1/hubs/hub-1/membership/leave": refusal(404, "MEMBERSHIP_NOT_FOUND"),
  });
  fireEvent.click(await screen.findByRole("button", { name: "Leave this hub" }));
  fireEvent.click(within(dialog("Leave this hub?")).getByRole("button", { name: "Leave the hub" }));
  expect(await screen.findByText(/^The owner removed you from this hub\./)).toBeTruthy();
});

test("a failed leave says nothing changed and keeps the button", async () => {
  await open(asMember, { "POST /v1/hubs/hub-1/membership/leave": reply(500) });
  fireEvent.click(await screen.findByRole("button", { name: "Leave this hub" }));
  fireEvent.click(within(dialog("Leave this hub?")).getByRole("button", { name: "Leave the hub" }));
  expect((await screen.findByRole("alert")).textContent).toContain("We couldn't take you out of the hub.");
  expect(screen.getByRole("button", { name: "Leave this hub" })).toBeTruthy();
});

test("the demo's refused removal says nothing was saved as a status, with no alert, and keeps the person", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/members/id-tendai-moyo/remove": demoRefusal() });
  await screen.findByText("Tendai Moyo");
  fireEvent.click(removeButton()!);
  fireEvent.click(within(dialog("Remove this member?")).getByRole("button", { name: "Remove" }));
  await saidNotSaved();
  expect(screen.getByText("Tendai Moyo")).toBeTruthy();
});

test("the demo's refused leave says nothing was saved as a status, with no alert, and keeps the button", async () => {
  await open(asMember, { "POST /v1/hubs/hub-1/membership/leave": demoRefusal() });
  fireEvent.click(await screen.findByRole("button", { name: "Leave this hub" }));
  fireEvent.click(within(dialog("Leave this hub?")).getByRole("button", { name: "Leave the hub" }));
  await saidNotSaved();
  expect(screen.getByRole("button", { name: "Leave this hub" })).toBeTruthy();
});

test("leaving and being removed are said in French too", async () => {
  await open(asLeft, {}, "fr");
  expect(screen.getByText("Vous avez quitté cet espace. L'accord que vous avez signé couvre toujours ce que vous avez vu.")).toBeTruthy();
  cleanup();
  await open(asRemoved, {}, "fr");
  expect(screen.getByText(/^Le porteur vous a retiré de cet espace\./)).toBeTruthy();
  expect(screen.queryByText("Vous n'êtes pas membre de cet espace.")).toBeNull();
});
