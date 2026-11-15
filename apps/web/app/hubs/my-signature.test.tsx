import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { agreement, api, asked, fetchMock, hub, idea, membership, owner, reply } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asMember = { viewer: { membership_status: "active", member_role: "member" } };

async function open(hubOver: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(hubOver) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/agreement": { data: agreement() },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1 });
}

const section = () => screen.getByRole("region", { name: "Your signature" });

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

test("a member sees what they signed, and when", async () => {
  await open(asMember);
  expect(await within(section()).findByText("You signed version 1 of the agreement as Kwabena Owusu on November 12, 2026.")).toBeTruthy();
  expect(within(section()).getByText("Member since November 12, 2026.")).toBeTruthy();
  // the text itself waits until asked for
  expect(asked()).not.toContain("GET /v1/hubs/hub-1/agreement");
});

test("the agreement opens on request and says when it is the exact text signed", async () => {
  await open(asMember);
  fireEvent.click(await within(section()).findByRole("button", { name: "Read the agreement you signed" }));
  expect((await within(section()).findByText("This is the exact text you signed.")).closest("[role=status]")).toBeTruthy();
  expect(within(section()).getByRole("region", { name: "TEST AGREEMENT (NOT LEGAL TEXT)" }).textContent).toMatch(/Members keep the idea private\./);
});

test("a text whose hash differs from the signed one is called out", async () => {
  await open(asMember, { "GET /v1/hubs/hub-1/agreement": { data: agreement({ body_sha256: "b".repeat(64) }) } });
  fireEvent.click(await within(section()).findByRole("button", { name: "Read the agreement you signed" }));
  expect(await within(section()).findByText(/does not match the one you signed/)).toBeTruthy();
  expect(within(section()).queryByText("This is the exact text you signed.")).toBeNull();
});

test("someone who left still sees their signature; someone never in the hub does not", async () => {
  await open({ viewer: { membership_status: "left", member_role: "member" } }, { "GET /v1/hubs/hub-1/membership": { data: membership({ status: "left" }) } });
  expect(await within(section()).findByText(/You signed version 1/)).toBeTruthy();
  cleanup();
  fetchMock.mockClear();
  await open({ viewer: { membership_status: null, member_role: null } });
  expect(screen.queryByRole("region", { name: "Your signature" })).toBeNull();
  expect(asked()).not.toContain("GET /v1/hubs/hub-1/membership");
});

test("a membership with no signature on record says so", async () => {
  await open(asMember, { "GET /v1/hubs/hub-1/membership": { data: membership({ signature: null }) } });
  expect(await within(section()).findByText("No signature of yours is on record for this hub.")).toBeTruthy();
});

test("a failed load says so and can be tried again", async () => {
  await open(asMember, { "GET /v1/hubs/hub-1/membership": [reply(500), { data: membership() }] });
  expect(await within(section()).findByText("We couldn't show your signature.")).toBeTruthy();
  fireEvent.click(within(section()).getByRole("button", { name: "Try again" }));
  expect(await within(section()).findByText(/You signed version 1/)).toBeTruthy();
});

test("a failed agreement load can be tried again", async () => {
  await open(asMember, { "GET /v1/hubs/hub-1/agreement": [reply(500), { data: agreement() }] });
  fireEvent.click(await within(section()).findByRole("button", { name: "Read the agreement you signed" }));
  expect(await within(section()).findByText("We couldn't load the agreement. Try again.")).toBeTruthy();
  fireEvent.click(within(section()).getByRole("button", { name: "Read the agreement you signed" }));
  expect(await within(section()).findByText("This is the exact text you signed.")).toBeTruthy();
});

test("the signature speaks French", async () => {
  await open(asMember, {}, "fr");
  const mine = screen.getByRole("region", { name: "Votre signature" });
  expect(await within(mine).findByText("Vous avez signé la version 1 de l'accord sous le nom Kwabena Owusu le 12 novembre 2026.")).toBeTruthy();
});
