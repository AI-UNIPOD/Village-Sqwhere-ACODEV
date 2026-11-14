import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppFrame } from "../app-frame";
import { hub, idea } from "../hubs/test-support";
import { DemoButton } from "../landing/demo-button";
import { resetDemo } from "../session/demo";
import { SESSION_KEY, signOut } from "../session/session";
import { arrived, chooseStop, endTour, keepRoute, startTour, stopAddress } from "./tour";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
}));

const fetchMock = vi.fn();
const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const route = { idea: "idea-1", hub: "hub-1" };
const tokens = {
  access_token: "demo-access",
  refresh_token: "demo-refresh",
  expires_in: 900,
  refresh_expires_at: "2099-01-01T00:00:00Z",
};

// the demo account's profile, its ideas and its hubs, as the API answers them
function serve({ demo = true, ideas = [idea()], hubs = [hub()], ideasStatus = 200 } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/v1/me")) return answer({ data: { username: "demo", display_name: "Demo Developer", is_demo: demo, roles: [], technologies: [] } });
    if (url.includes("/v1/me/ideas")) return ideasStatus === 200 ? answer({ data: ideas, next_offset: null }) : answer({ detail: { code: "BOOM" } }, ideasStatus);
    if (url.includes("/v1/me/hubs")) return answer({ data: hubs, next_offset: null });
    return answer({}, 404);
  });
}

function signIn() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
}

// the tour is on at this stop, with the route known, as it is after a reload
function atStop(step: number) {
  startTour();
  keepRoute(route);
  chooseStop(step);
  arrived();
}

const frame = (path: string, lang: "en" | "fr" = "en") => (
  <AppFrame lang={lang} path={path}>
    screen
  </AppFrame>
);
const panel = (lang: "en" | "fr" = "en") => screen.findByRole("region", { name: lang === "en" ? "Tour" : "Visite guidée" });
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { replace: vi.fn() });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  signIn();
  serve();
});

afterEach(() => {
  cleanup();
  endTour();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  nav.push.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  resetDemo();
});

// ---------- starting ----------

test("'Try the demo' does not start the tour", async () => {
  fetchMock.mockImplementation(() => answer({ data: tokens }));
  render(<DemoButton lang="en" className="ghost">Try the demo</DemoButton>);
  fireEvent.click(button("Try the demo"));
  await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/en/village"));
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
});

test("a demo visitor who never started the tour is offered it beside the way out, and it opens the village", async () => {
  render(frame("feed"));
  await screen.findByText(/You are in the demo/);
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  fireEvent.click(button("Take the tour"));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/village");
  // the tour is on at the start, and the offer goes
  expect((await panel()).textContent).toContain("The demo village");
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  expect(button("Leave the demo")).toBeTruthy();
});

test("the start asks for the demo's idea and hub, and Start the route waits for them", async () => {
  // the answers are held back until the test has looked at the waiting
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const serving = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/v1/me/ideas")) await held;
    return serving(url);
  });
  startTour();
  render(frame("village"));
  const region = await panel();
  expect(region.querySelector("h2")?.textContent).toBe("The demo village");
  // the start has no count
  expect(region.textContent).not.toMatch(/Stop \d/);
  const start = button("Start the route");
  expect(start.getAttribute("aria-disabled")).toBe("true");
  expect(start.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(start);
  expect(nav.push).not.toHaveBeenCalled();

  release();
  await waitFor(() => expect(start.hasAttribute("aria-disabled")).toBe(false));
  expect(start.hasAttribute("aria-busy")).toBe(false);
  fireEvent.click(start);
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/ideas/compose?id=idea-1", undefined);
});

test("the route is the open idea that has a hub the account owns", async () => {
  serve({
    ideas: [idea({ id: "idea-0", status: "closed" }), idea({ id: "idea-2" }), idea({ id: "idea-1" })],
    hubs: [
      hub({ id: "hub-0", idea: { id: "idea-0" } }),
      hub({ id: "hub-2", idea: { id: "idea-2" }, viewer: { membership_status: "active", member_role: "member" } }),
      hub({ id: "hub-1", idea: { id: "idea-1" } }),
    ],
  });
  startTour();
  render(frame("village"));
  await waitFor(() => expect(button("Start the route").hasAttribute("aria-disabled")).toBe(false));
  fireEvent.click(button("Start the route"));
  expect(nav.push).toHaveBeenCalledWith("/en/ideas/compose?id=idea-1", undefined);
});

// ---------- walking the route ----------

test.each([
  ["Next", 1, "/en/ideas/matches?id=idea-1", "ideas/compose?id=idea-1"],
  ["Next", 2, "/en/hubs/view?id=hub-1#team", "ideas/matches?id=idea-1"],
  ["Back", 1, "/en/village", "ideas/compose?id=idea-1"],
  ["Back", 2, "/en/ideas/compose?id=idea-1", "ideas/matches?id=idea-1"],
  ["Back", 3, "/en/ideas/matches?id=idea-1", "hubs/view?id=hub-1"],
])("%s at stop %i goes to %s", async (name, step, address, path) => {
  atStop(step);
  render(frame(path));
  await panel();
  fireEvent.click(button(name));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith(address, undefined);
});

// a part of the hub's page, as the page gives it: inside the same frame as the panel
function part(id: string, top: number) {
  const section = document.createElement("section");
  section.id = id;
  section.getBoundingClientRect = () => ({ top }) as DOMRect;
  document.querySelector("[data-frame]")!.append(section);
  return section;
}

test("the last two stops are one screen: Next and Back scroll to the phases and to the team, under the panel, and the router leaves the scroll alone", async () => {
  atStop(3);
  render(frame("hubs/view?id=hub-1"));
  const region = await panel();
  region.getBoundingClientRect = () => ({ height: 180 }) as DOMRect;
  part("team", 600);
  part("phases", 1400);
  // a hidden screen kept in memory has the same ids: it is not the one to scroll to
  const kept = document.createElement("section");
  kept.id = "phases";
  document.body.prepend(kept);

  fireEvent.click(button("Next"));
  expect(nav.push).toHaveBeenLastCalledWith("/en/hubs/view?id=hub-1#phases", { scroll: false });
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1400 - 180, behavior: "smooth" });
  expect((await panel()).querySelector("h2")?.textContent).toBe("Walk the hub's four phases");

  (await panel()).getBoundingClientRect = () => ({ height: 180 }) as DOMRect;
  fireEvent.click(button("Back"));
  expect(nav.push).toHaveBeenLastCalledWith("/en/hubs/view?id=hub-1#team", { scroll: false });
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 600 - 180, behavior: "smooth" });
  kept.remove();
});

test("the scroll does not glide when the person asked for less motion", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  atStop(3);
  render(frame("hubs/view?id=hub-1"));
  await panel();
  part("phases", 1400);
  fireEvent.click(button("Next"));
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1400, behavior: "auto" });
});

test("a stop on another screen is left to that screen to scroll", async () => {
  atStop(2);
  render(frame("ideas/matches?id=idea-1"));
  await panel();
  fireEvent.click(button("Next"));
  expect(nav.push).toHaveBeenLastCalledWith("/en/hubs/view?id=hub-1#team", undefined);
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test.each([
  ["en", 0, "The demo village", null],
  ["en", 1, "Share an idea", "Stop 1 of 4"],
  ["en", 2, "See who the matcher suggests", "Stop 2 of 4"],
  ["en", 3, "Approve your team", "Stop 3 of 4"],
  ["en", 4, "Walk the hub's four phases", "Stop 4 of 4"],
  ["fr", 0, "Le village de démo", null],
  ["fr", 2, "Voir qui le matcher propose", "Étape 2 sur 4"],
  ["fr", 3, "Valider votre équipe", "Étape 3 sur 4"],
  ["fr", 4, "Parcourir les quatre phases de l'espace", "Étape 4 sur 4"],
] as const)("the %s panel at step %i says its name, its count and the progress", async (lang, step, name, count) => {
  atStop(step);
  render(frame(stopAddress(step, route).split("#")[0], lang));
  const region = await panel(lang);
  expect(region.querySelector("h2")?.textContent).toBe(name);
  if (count) expect(region.textContent).toContain(count);
  expect(region.querySelectorAll("[data-filled]")).toHaveLength(step);
  expect(region.querySelectorAll("[data-current]")).toHaveLength(step > 0 ? 1 : 0);
});

test("the last stop says Finish and offers sign-in, which leaves the demo first", async () => {
  atStop(4);
  render(frame("hubs/view?id=hub-1"));
  const region = await panel();
  expect(region.textContent).toContain("That is the route. Keep looking around, or sign in with GitHub to start your own.");
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  const link = screen.getByRole("link", { name: "sign in with GitHub" });
  expect(link.getAttribute("href")).toBe("/en/sign-in");

  fireEvent.click(link);
  expect(window.location.replace).toHaveBeenCalledWith("/en/sign-in");
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
});

test("Finish removes the panel and the person stays in the demo, with the offer to take the tour again", async () => {
  atStop(4);
  render(frame("hubs/view?id=hub-1"));
  await panel();
  fireEvent.click(button("Finish"));
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(nav.push).not.toHaveBeenCalled();
  expect(button("Leave the demo")).toBeTruthy();
  expect(button("Take the tour")).toBeTruthy();
});

// ---------- leaving the route ----------

test("off the route the panel shrinks to a line, and Back to the route returns to the stop", async () => {
  atStop(2);
  render(frame("feed"));
  const region = await panel();
  expect(region.hasAttribute("data-compact")).toBe(true);
  expect(region.textContent).toContain("Stop 2 of 4");
  expect(region.textContent).toContain("See who the matcher suggests");
  expect(region.querySelector("h2")).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

  fireEvent.click(button("Back to the route"));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/ideas/matches?id=idea-1", undefined);
});

test("the way back is in French too, and the shrunk panel can still end the tour", async () => {
  atStop(3);
  render(frame("village", "fr"));
  const region = await panel("fr");
  expect(region.textContent).toContain("Étape 3 sur 4");
  fireEvent.click(button("Revenir au parcours"));
  expect(nav.push).toHaveBeenCalledWith("/fr/hubs/view?id=hub-1#team", undefined);
  fireEvent.click(button("Quitter la visite"));
  expect(screen.queryByRole("region")).toBeNull();
});

test("End the tour removes the panel, and the demo line then offers to take it again", async () => {
  atStop(1);
  render(frame("ideas/compose?id=idea-1"));
  await panel();
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  fireEvent.click(button("End the tour"));
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
  expect(screen.getByText(/You are in the demo/)).toBeTruthy();

  fireEvent.click(button("Take the tour"));
  expect(nav.push).toHaveBeenCalledWith("/en/village");
  expect((await panel()).textContent).toContain("The demo village");
});

// ---------- when the route cannot be loaded ----------

test("a failed load says so, and Try again asks again", async () => {
  serve({ ideasStatus: 500 });
  startTour();
  render(frame("village"));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("We couldn't load the route. Nothing was changed, so try again.");
  expect(screen.queryByRole("button", { name: "Start the route" })).toBeNull();
  const asked = fetchMock.mock.calls.length;

  serve();
  fireEvent.click(button("Try again"));
  await waitFor(() => expect(button("Start the route").hasAttribute("aria-disabled")).toBe(false));
  expect(fetchMock.mock.calls.length).toBeGreaterThan(asked);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("an account with no open idea that has a hub it owns gets the same message, in French, and can end the tour", async () => {
  serve({ ideas: [idea({ status: "draft" })] });
  startTour();
  render(frame("village", "fr"));
  expect((await screen.findByRole("alert")).textContent).toBe("Nous n'avons pas pu charger le parcours. Rien n'a été modifié, réessayez.");
  expect(button("Réessayer")).toBeTruthy();
  fireEvent.click(button("Quitter la visite"));
  expect(screen.queryByRole("region")).toBeNull();
});

// ---------- who sees it ----------

test("an account that is not the demo never sees the panel, even if a tour was left on", async () => {
  serve({ demo: false });
  atStop(2);
  render(frame("ideas/matches?id=idea-1"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
});

// ---------- focus ----------

test("a stop reached with Next or Back puts focus on the stop's heading on the new screen", async () => {
  atStop(0);
  const view = render(frame("village"));
  await waitFor(() => expect(button("Start the route").hasAttribute("aria-disabled")).toBe(false));
  fireEvent.click(button("Start the route"));
  // the new screen shows
  view.rerender(frame("ideas/compose?id=idea-1"));
  const region = await panel();
  await waitFor(() => expect(document.activeElement).toBe(region.querySelector("h2")));
  expect(document.activeElement?.textContent).toBe("Share an idea");
  expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");

  // the focus was handed over once: later renders leave it alone
  (document.activeElement as HTMLElement).blur();
  view.rerender(frame("ideas/compose?id=idea-1"));
  expect(document.activeElement).toBe(document.body);

  fireEvent.click(button("Back"));
  view.rerender(frame("village"));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("The demo village"));
});

test("Back to the route also takes focus to the stop", async () => {
  atStop(2);
  const view = render(frame("feed"));
  await panel();
  fireEvent.click(button("Back to the route"));
  view.rerender(frame("ideas/matches?id=idea-1"));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("See who the matcher suggests"));
});

test("a plain page load, or a reload, leaves focus alone", async () => {
  atStop(3);
  render(frame("hubs/view?id=hub-1"));
  const region = await panel();
  await act(async () => {});
  expect(region.querySelector("h2")).not.toBe(document.activeElement);
  expect(document.activeElement).toBe(document.body);
});

// ---------- keeping the stop ----------

function Where({ useTour }: { useTour: typeof import("./tour").useTour }) {
  const { tour } = useTour();
  return <p>{tour ? `stop ${tour.step}, hub ${tour.route?.hub}` : "no tour"}</p>;
}

test("a reload keeps the stop and the route", async () => {
  atStop(3);
  vi.resetModules();
  const fresh = await import("./tour");
  render(<Where useTour={fresh.useTour} />);
  expect(screen.getByText("stop 3, hub hub-1")).toBeTruthy();
});

test("what another script left under the key is not a tour", async () => {
  sessionStorage.setItem("vs_tour", JSON.stringify({ step: 9, route: null }));
  vi.resetModules();
  const fresh = await import("./tour");
  render(<Where useTour={fresh.useTour} />);
  expect(screen.getByText("no tour")).toBeTruthy();
});

test("storage that throws does not stop the tour: it lasts as long as the page", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.resetModules();
  const fresh = await import("./tour");
  render(<Where useTour={fresh.useTour} />);
  expect(screen.getByText("no tour")).toBeTruthy();
  act(() => fresh.startTour());
  expect(screen.getByText("stop 0, hub undefined")).toBeTruthy();
  act(() => fresh.endTour());
  expect(screen.getByText("no tour")).toBeTruthy();
});

test("signing out clears the tour", () => {
  atStop(2);
  expect(sessionStorage.getItem("vs_tour")).not.toBeNull();
  signOut("en");
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
});
