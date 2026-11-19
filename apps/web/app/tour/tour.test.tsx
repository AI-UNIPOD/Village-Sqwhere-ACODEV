import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppFrame } from "../app-frame";
import { hub, idea } from "../hubs/test-support";
import { DemoButton } from "../landing/demo-button";
import { resetDemo } from "../session/demo";
import { SESSION_KEY, signOut } from "../session/session";
import { arrived, chooseStep, endTour, keepRoute, loadRoute, startTour, stepAddress } from "./tour";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
}));

const fetchMock = vi.fn();
const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const route = { post: "post-1", idea: "idea-1", hub: "hub-1" };
// only what the tour reads of a post: its id and how many comments it has
const question = (id: string, comment_count: number) => ({ id, comment_count });
const tokens = {
  access_token: "demo-access",
  refresh_token: "demo-refresh",
  expires_in: 900,
  refresh_expires_at: "2099-01-01T00:00:00Z",
};

// the demo account's profile, its ideas and its hubs, and the feed's questions, as the API answers them
function serve({ demo = true, ideas = [idea()], hubs = [hub()], questions = [question("post-1", 5)], ideasStatus = 200 } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/v1/me")) return answer({ data: { username: "demo", display_name: "Demo Developer", is_demo: demo, roles: [], technologies: [] } });
    if (url.includes("/v1/me/ideas")) return ideasStatus === 200 ? answer({ data: ideas, next_offset: null }) : answer({ detail: { code: "BOOM" } }, ideasStatus);
    if (url.includes("/v1/me/hubs")) return answer({ data: hubs, next_offset: null });
    if (url.includes("/v1/posts?type=question")) return answer({ data: questions, next_offset: null });
    return answer({}, 404);
  });
}

function signIn() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
}

// the tour is on at this step, with the route known, as it is after a reload
function atStep(step: number) {
  startTour();
  keepRoute(route);
  chooseStep(step);
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
  expect((await panel()).textContent).toContain("Your village");
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
  expect(region.querySelector("h2")?.textContent).toBe("Your village");
  expect(region.textContent).toContain("Step 1 of 6");
  const start = button("Start the route");
  expect(start.getAttribute("aria-disabled")).toBe("true");
  expect(start.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(start);
  expect(nav.push).not.toHaveBeenCalled();

  release();
  await waitFor(() => expect(start.hasAttribute("aria-disabled")).toBe(false));
  expect(start.hasAttribute("aria-busy")).toBe(false);
  fireEvent.click(start);
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/feed");
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
  expect(await loadRoute()).toEqual(route);
});

// the feed holds hundreds of posts: the tour asks for the newest questions, not for a seeded post
test.each([
  ["the first question with at least 3 comments", [question("a", 0), question("b", 2), question("c", 3), question("d", 9)], "c"],
  ["the first question when none has 3 comments", [question("a", 1), question("b", 2)], "a"],
])("the conversation is %s", async (_, questions, post) => {
  serve({ questions });
  expect(await loadRoute()).toEqual({ ...route, post });
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/v1/posts?type=question&limit=20"))).toBe(true);
});

test("with no question in the feed there is no route", async () => {
  serve({ questions: [] });
  expect(await loadRoute()).toBeNull();
});

// ---------- walking the route ----------

test.each([
  ["Start the route", 0, "/en/feed", "village"],
  ["Next", 1, "/en/posts/view?id=post-1", "feed"],
  ["Next", 2, "/en/ideas/compose?id=idea-1", "posts/view?id=post-1"],
  ["Next", 3, "/en/ideas/matches?id=idea-1", "ideas/compose?id=idea-1"],
  ["Next", 4, "/en/hubs/view?id=hub-1#team", "ideas/matches?id=idea-1"],
  ["Back", 1, "/en/village", "feed"],
  ["Back", 2, "/en/feed", "posts/view?id=post-1"],
  ["Back", 3, "/en/posts/view?id=post-1", "ideas/compose?id=idea-1"],
  ["Back", 4, "/en/ideas/compose?id=idea-1", "ideas/matches?id=idea-1"],
  ["Back", 5, "/en/ideas/matches?id=idea-1", "hubs/view?id=hub-1"],
])("%s at step %i goes to %s", async (name, step, address, path) => {
  atStep(step);
  render(frame(path));
  await panel();
  fireEvent.click(button(name));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith(address);
});

// the sixth step is one address, the hub page at its team: the phases are further down the page,
// and the page scrolls itself once the hub has loaded, so the panel does not
test("the sixth step is the hub page at its team, and the panel leaves the scrolling to the page", async () => {
  expect(stepAddress(5, route)).toBe("hubs/view?id=hub-1#team");
  for (let step = 0; step < 6; step++) expect(stepAddress(step, route)).not.toContain("#phases");
  atStep(4);
  render(frame("ideas/matches?id=idea-1"));
  await panel();
  fireEvent.click(button("Next"));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/hubs/view?id=hub-1#team");
  expect(window.scrollTo).not.toHaveBeenCalled();
});

test.each([
  ["en", 0, "Your village", "Step 1 of 6"],
  ["en", 1, "The feed", "Step 2 of 6"],
  ["en", 2, "A conversation", "Step 3 of 6"],
  ["en", 3, "Share an idea", "Step 4 of 6"],
  ["en", 4, "The matcher", "Step 5 of 6"],
  ["en", 5, "Your team and the hub", "Step 6 of 6"],
  ["fr", 0, "Votre village", "Étape 1 sur 6"],
  ["fr", 1, "Le fil", "Étape 2 sur 6"],
  ["fr", 2, "Une conversation", "Étape 3 sur 6"],
  ["fr", 3, "Partager une idée", "Étape 4 sur 6"],
  ["fr", 4, "Le matcher", "Étape 5 sur 6"],
  ["fr", 5, "Votre équipe et l'espace", "Étape 6 sur 6"],
] as const)("the %s panel at step %i says its name, its count and the progress", async (lang, step, name, count) => {
  atStep(step);
  render(frame(stepAddress(step, route).split("#")[0], lang));
  const region = await panel(lang);
  expect(region.querySelector("h2")?.textContent).toBe(name);
  expect(region.querySelector("p")?.textContent).toBe(count);
  expect(region.querySelectorAll("[aria-hidden] > span")).toHaveLength(6);
  expect(region.querySelectorAll("[data-filled]")).toHaveLength(step + 1);
  expect(region.querySelectorAll("[data-current]")).toHaveLength(1);
  // the closing line with the sign-in link is for the last step only
  expect(region.querySelector("a") !== null).toBe(step === 5);
});

test("the last step says Finish and offers sign-in, which leaves the demo first", async () => {
  atStep(5);
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
  atStep(5);
  render(frame("hubs/view?id=hub-1"));
  await panel();
  fireEvent.click(button("Finish"));
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(nav.push).not.toHaveBeenCalled();
  expect(button("Leave the demo")).toBeTruthy();
  expect(button("Take the tour")).toBeTruthy();
});

// ---------- leaving the route ----------

test("off the route the panel shrinks to a line, and Back to the route returns to the step", async () => {
  atStep(2);
  render(frame("feed"));
  const region = await panel();
  expect(region.hasAttribute("data-compact")).toBe(true);
  expect(region.textContent).toContain("Step 3 of 6");
  expect(region.textContent).toContain("A conversation");
  expect(region.querySelector("h2")).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

  fireEvent.click(button("Back to the route"));
  expect(nav.push).toHaveBeenCalledExactlyOnceWith("/en/posts/view?id=post-1");
});

test("the feed narrowed to a kind or a topic is still the feed's step, so the panel stays whole", async () => {
  atStep(1);
  render(frame("feed?type=question&topic=python"));
  const region = await panel();
  expect(region.hasAttribute("data-compact")).toBe(false);
  expect(region.querySelector("h2")?.textContent).toBe("The feed");
  expect(region.textContent).toContain("Press a kind above the list, or a topic on a post, to see only the posts that match.");
  expect(screen.queryByRole("button", { name: "Back to the route" })).toBeNull();
});

test("the feed's step says how to narrow the feed in French too", async () => {
  atStep(1);
  render(frame("feed?topic=python", "fr"));
  const region = await panel("fr");
  expect(region.hasAttribute("data-compact")).toBe(false);
  expect(region.textContent).toContain("Appuyez sur un type au-dessus de la liste, ou sur un sujet dans une publication, pour ne voir que les publications qui correspondent.");
});

test("the way back is in French too, and the shrunk panel can still end the tour", async () => {
  atStep(5);
  render(frame("village", "fr"));
  const region = await panel("fr");
  expect(region.textContent).toContain("Étape 6 sur 6");
  fireEvent.click(button("Revenir au parcours"));
  expect(nav.push).toHaveBeenCalledWith("/fr/hubs/view?id=hub-1#team");
  fireEvent.click(button("Quitter la visite"));
  expect(screen.queryByRole("region")).toBeNull();
});

test("End the tour removes the panel, and the demo line then offers to take it again", async () => {
  atStep(1);
  render(frame("feed"));
  await panel();
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  fireEvent.click(button("End the tour"));
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
  expect(screen.getByText(/You are in the demo/)).toBeTruthy();

  fireEvent.click(button("Take the tour"));
  expect(nav.push).toHaveBeenCalledWith("/en/village");
  expect((await panel()).textContent).toContain("Your village");
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

test("a feed with no question gets the same message", async () => {
  serve({ questions: [] });
  startTour();
  render(frame("village"));
  expect((await screen.findByRole("alert")).textContent).toBe("We couldn't load the route. Nothing was changed, so try again.");
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
  atStep(2);
  render(frame("posts/view?id=post-1"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
});

// ---------- focus ----------

test("a step reached with Next or Back puts focus on the step's heading on the new screen", async () => {
  atStep(0);
  const view = render(frame("village"));
  await waitFor(() => expect(button("Start the route").hasAttribute("aria-disabled")).toBe(false));
  fireEvent.click(button("Start the route"));
  // the new screen shows
  view.rerender(frame("feed"));
  const region = await panel();
  await waitFor(() => expect(document.activeElement).toBe(region.querySelector("h2")));
  expect(document.activeElement?.textContent).toBe("The feed");
  expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");

  // the focus was handed over once: later renders leave it alone
  (document.activeElement as HTMLElement).blur();
  view.rerender(frame("feed"));
  expect(document.activeElement).toBe(document.body);

  fireEvent.click(button("Back"));
  view.rerender(frame("village"));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Your village"));
});

test("Back to the route also takes focus to the step", async () => {
  atStep(2);
  const view = render(frame("feed"));
  await panel();
  fireEvent.click(button("Back to the route"));
  view.rerender(frame("posts/view?id=post-1"));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("A conversation"));
});

test("a plain page load, or a reload, leaves focus alone", async () => {
  atStep(5);
  render(frame("hubs/view?id=hub-1"));
  const region = await panel();
  await act(async () => {});
  expect(region.querySelector("h2")).not.toBe(document.activeElement);
  expect(document.activeElement).toBe(document.body);
});

// ---------- keeping the step ----------

function Where({ useTour }: { useTour: typeof import("./tour").useTour }) {
  const { tour } = useTour();
  return <p>{tour ? `step ${tour.step}, hub ${tour.route?.hub}` : "no tour"}</p>;
}

test("a reload keeps the step and the route", async () => {
  atStep(5);
  expect(JSON.parse(sessionStorage.getItem("vs_tour")!)).toEqual({ step: 5, route });
  vi.resetModules();
  const fresh = await import("./tour");
  render(<Where useTour={fresh.useTour} />);
  expect(screen.getByText("step 5, hub hub-1")).toBeTruthy();
});

// the first is past the sixth step; the second is a tour kept by the four-stop version, whose route had no post
test.each([
  { step: 6, route: null },
  { step: 2, route: { idea: "idea-1", hub: "hub-1" } },
])("what another script or an older version left under the key is not a tour", async (kept) => {
  sessionStorage.setItem("vs_tour", JSON.stringify(kept));
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
  expect(screen.getByText("step 0, hub undefined")).toBeTruthy();
  act(() => fresh.endTour());
  expect(screen.getByText("no tour")).toBeTruthy();
});

test("signing out clears the tour", () => {
  atStep(2);
  expect(sessionStorage.getItem("vs_tour")).not.toBeNull();
  signOut("en");
  expect(sessionStorage.getItem("vs_tour")).toBeNull();
});
