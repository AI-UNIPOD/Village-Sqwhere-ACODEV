import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import ReviewsError from "../[lang]/reviews/error";
import { SESSION_KEY } from "../session/session";
import { ReviewQueue } from "./queue";

const nav = vi.hoisted(() => ({ search: "", lang: "en", router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useParams: () => ({ lang: nav.lang }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const fetchMock = vi.fn();
const NOW = Date.parse("2026-11-13T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const attempt = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  role: "backend-engineer",
  role_name: "Backend & Systems Engineer",
  attempt_number: 1,
  status: "awaiting_review",
  evidence: [{ repository_url: "https://github.com/ama/one" }, { repository_url: "https://github.com/ama/two" }],
  ai_score: 91,
  ai_result: { final_report: { score: 91 } },
  created_at: hoursAgo(50),
  completed_at: hoursAgo(49),
  ...overrides,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const me = (verified: boolean) =>
  json({
    data: {
      username: "wanjiru-k",
      display_name: "Wanjiru Kamau",
      technologies: [],
      roles: [
        {
          slug: "backend-engineer",
          name: "Backend & Systems Engineer",
          is_primary: true,
          verified_at: verified ? "2026-11-06T18:00:00Z" : null,
        },
      ],
    },
  });

// answers /v1/me, then the queue pages in order
function api(verified: boolean, ...pages: Response[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/v1/me")) return me(verified);
    return pages.shift() ?? json({ data: [], next_offset: null });
  });
}

const queueCalls = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/v1/reviews"));

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>caught</p> : this.props.children;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
  nav.search = "";
  nav.lang = "en";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  nav.router.replace.mockReset();
  localStorage.clear();
});

test("each attempt is one row with its role, attempt number, waiting time and repositories, and no score", async () => {
  api(
    true,
    json({
      data: [
        attempt(1),
        attempt(2, {
          attempt_number: 2,
          evidence: [{ repository_url: "https://github.com/ama/one" }],
          completed_at: hoursAgo(5),
        }),
      ],
      next_offset: null,
    }),
  );
  render(<ReviewQueue lang="en" />);
  const rows = await screen.findAllByRole("link", { name: /Backend and Systems Engineer/ });
  expect(rows[0].textContent).toContain("Attempt 1 of 3 · Waiting 2 days · 2 repositories");
  expect(rows[0].textContent).toContain("Review");
  expect(rows[1].textContent).toContain("Attempt 2 of 3 · Waiting 5 hours · 1 repository");
  expect(screen.queryByText(/91/)).toBeNull();
  expect(queueCalls()).toEqual(["http://localhost:8000/v1/reviews/verifications?offset=0&limit=20"]);
});

test("each row is one link to its case", async () => {
  api(true, json({ data: [attempt(1), attempt(2)], next_offset: null }));
  render(<ReviewQueue lang="en" />);
  const links = await screen.findAllByRole("link", { name: /Backend and Systems Engineer/ });
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/en/reviews/case?id=id-1",
    "/en/reviews/case?id=id-2",
  ]);
});

test("the queue is written in French, with the role and the waiting time", async () => {
  api(true, json({ data: [attempt(1)], next_offset: null }));
  render(<ReviewQueue lang="fr" />);
  const link = await screen.findByRole("link", { name: /Ingénieur backend et systèmes/ });
  // the number and its unit are held together by a no-break space
  expect(link.textContent).toMatch(/Tentative 1 sur 3 · En attente depuis 2\sjours · 2 dépôts/);
  expect(link.getAttribute("href")).toBe("/fr/reviews/case?id=id-1");
});

test("Load more appends the next page and goes away at the end", async () => {
  api(true, json({ data: [attempt(1)], next_offset: 20 }), json({ data: [attempt(2)], next_offset: null }));
  render(<ReviewQueue lang="en" />);
  await screen.findByRole("link", { name: /Backend/ });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Backend/ })).toHaveLength(2));
  expect(queueCalls()[1]).toBe("http://localhost:8000/v1/reviews/verifications?offset=20&limit=20");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

test("a failed Load more keeps the list and says so", async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/v1/me")) return me(true);
    if (url.includes("offset=20")) return json({ detail: { code: "SERVER" } }, 500);
    return json({ data: [attempt(1)], next_offset: 20 });
  });
  render(<ReviewQueue lang="en" />);
  await screen.findByRole("link", { name: /Backend/ });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load more attempts");
  expect(screen.getAllByRole("link", { name: /Backend/ })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
});

test("a developer with no Green Tick sees why, with a way to earn one, and the queue is not asked", async () => {
  api(false);
  render(<ReviewQueue lang="en" />);
  expect(await screen.findByRole("heading", { name: "Only developers with a Green Tick can review." })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Earn my Green Tick" }).getAttribute("href")).toBe("/en/verification");
  expect(queueCalls()).toEqual([]);
});

test("an empty queue says when new attempts appear", async () => {
  api(true, json({ data: [], next_offset: null }));
  render(<ReviewQueue lang="en" />);
  expect(await screen.findByRole("heading", { name: "No attempts are waiting for you." })).toBeTruthy();
  expect(screen.getByText("New ones appear here when developers in your role finish their interview.")).toBeTruthy();
});

test.each([
  ["passed", "Decision recorded: passed."],
  ["failed", "Decision recorded: not passed."],
])("after a decision (?done=%s) the message shows and leaves the address", async (done, message) => {
  nav.search = `done=${done}`;
  api(true, json({ data: [attempt(1)], next_offset: null }));
  render(<ReviewQueue lang="en" />);
  expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
  await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/en/reviews"));
  expect(screen.getByText(message)).toBeTruthy();
});

test("without ?done= there is no message and the address is left alone", async () => {
  api(true, json({ data: [attempt(1)], next_offset: null }));
  render(<ReviewQueue lang="en" />);
  await screen.findByRole("link", { name: /Backend/ });
  expect(screen.queryByRole("status")).toBeNull();
  expect(nav.router.replace).not.toHaveBeenCalled();
});

test("while the profile loads the page says so", () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<ReviewQueue lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening the reviews");
});

test("a queue that cannot load is left to the error screen", async () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockImplementation(async (url: string) => (url.endsWith("/v1/me") ? me(true) : json({}, 500)));
  render(
    <Boundary>
      <ReviewQueue lang="en" />
    </Boundary>,
  );
  expect(await screen.findByText("caught")).toBeTruthy();
  quiet.mockRestore();
});

test.each([
  ["en", "We couldn't open the reviews", "Try again"],
  ["fr", "Nous n'avons pas pu ouvrir les revues", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  nav.lang = lang;
  const onRetry = vi.fn();
  render(<ReviewsError retry={onRetry} />);
  expect(within(screen.getByRole("main")).getByRole("heading", { level: 1, name: title })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});
