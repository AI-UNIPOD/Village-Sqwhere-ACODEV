import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { saveAnswers, useSavedProfile } from "./save-answers";
import { NO_ANSWERS } from "./steps";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const claimed = () => reply(409, { detail: { code: "ROLE_ALREADY_CLAIMED" } });

const answers = { ...NO_ANSWERS, role: "backend-engineer", stack: ["go", "docker"], country: "SEN", topics: ["fintech"], feed: ["python"] };

const ROLE = "POST /v1/me/roles";
const MAIN = "PATCH /v1/me/roles/backend-engineer";
const STACK = "PUT /v1/me/technologies";
const FEED = "PUT /v1/me/feed-topics";
const SECTORS = "PUT /v1/me/sectors";
const COUNTRY = "PATCH /v1/me";

// Answers each request by its method and path, so the order the calls arrive in does not matter:
// the five are sent together. `own` replaces the answer for a route.
function api(own: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    [ROLE]: () => reply(201),
    [MAIN]: () => reply(200),
    [STACK]: () => reply(200),
    [FEED]: () => reply(200),
    [SECTORS]: () => reply(200),
    [COUNTRY]: () => reply(200),
    ...own,
  };
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    const route = `${init.method} ${String(url).replace("http://localhost:8000", "")}`;
    return Promise.resolve(routes[route]?.() ?? reply(500));
  });
}

// what the API received: method, path and parsed body, in the order sent
const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => [init.method, String(url).replace("http://localhost:8000", ""), JSON.parse(init.body), init.headers["Content-Type"]]);
const routes = () => requests().map(([method, path]) => `${method} ${path}`);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("the role is posted as the main one, and the stack, the feed's technologies, the sectors and the country are saved", async () => {
  api();
  await saveAnswers(answers);
  expect(requests()).toEqual([
    ["POST", "/v1/me/roles", { role: "backend-engineer", is_primary: true }, "application/json"],
    ["PUT", "/v1/me/technologies", { technologies: ["go", "docker"] }, "application/json"],
    ["PUT", "/v1/me/feed-topics", { technologies: ["python"] }, "application/json"],
    ["PUT", "/v1/me/sectors", { sectors: ["fintech"] }, "application/json"],
    // the answer is kept under the three-letter code, the API takes two letters
    ["PATCH", "/v1/me", { country_code: "SN" }, "application/json"],
  ]);
});

test("the five saves go out together: none waits for another to answer", async () => {
  // no request is answered until all of them have been sent, so a save that waited for the one
  // before it would never get its turn and the test would time out
  const release: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => release.push(resolve)));
  const saving = saveAnswers(answers);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  expect(routes().sort()).toEqual([COUNTRY, FEED, ROLE, SECTORS, STACK].sort());
  release.forEach((resolve) => resolve(reply(200)));
  await saving;
});

test("a skipped country sends nothing for it", async () => {
  api();
  await saveAnswers({ ...answers, country: null });
  expect(routes()).toEqual([ROLE, STACK, FEED, SECTORS]);
});

test("a role the developer already has is made the main one", async () => {
  api({ [ROLE]: claimed });
  await saveAnswers(answers);
  expect(routes().sort()).toEqual([COUNTRY, FEED, MAIN, ROLE, SECTORS, STACK].sort());
  expect(requests().find(([method, path]) => `${method} ${path}` === MAIN)?.[2]).toEqual({ is_primary: true });
});

test.each([
  ["posting the role", { [ROLE]: () => reply(500) }],
  ["making the role the main one", { [ROLE]: claimed, [MAIN]: () => reply(500) }],
  ["saving the stack", { [STACK]: () => reply(500) }],
  ["saving what the feed shows", { [FEED]: () => reply(500) }],
  ["saving the sectors", { [SECTORS]: () => reply(500) }],
  ["saving the country", { [COUNTRY]: () => reply(500) }],
  ["a conflict that is not about the role", { [ROLE]: () => reply(409, { detail: { code: "OTHER" } }) }],
])("a failure while %s rejects", async (_, own) => {
  api(own);
  await expect(saveAnswers(answers)).rejects.toThrow();
});

test("with no role chosen the hook stays idle and sends nothing", async () => {
  const { result } = renderHook(() => useSavedProfile(NO_ANSWERS));
  await act(async () => {});
  expect(result.current.status).toBe("idle");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the hook goes from saving to saved", async () => {
  api();
  const { result } = renderHook(() => useSavedProfile(answers));
  expect(result.current.status).toBe("saving");
  await waitFor(() => expect(result.current.status).toBe("saved"));
});

test("after a failure, retry saves everything again and ends saved", async () => {
  api({ [STACK]: () => reply(500) });
  const { result } = renderHook(() => useSavedProfile(answers));
  await waitFor(() => expect(result.current.status).toBe("failed"));
  // the other four were sent anyway: sending them again is safe, which is what retry does
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  fetchMock.mockClear();

  api();
  act(() => result.current.retry());
  expect(result.current.status).toBe("saving");
  await waitFor(() => expect(result.current.status).toBe("saved"));
  expect(routes().sort()).toEqual([COUNTRY, FEED, ROLE, SECTORS, STACK].sort());
});

test("the demo's refusal is told from a failure, whichever call it comes from", async () => {
  api({ [FEED]: () => reply(403, { detail: { code: "DEMO_READ_ONLY" } }) });
  const { result } = renderHook(() => useSavedProfile(answers));
  await waitFor(() => expect(result.current.status).toBe("demo"));
});

test("two done steps opened together save once", async () => {
  api();
  const first = renderHook(() => useSavedProfile(answers));
  const second = renderHook(() => useSavedProfile(answers));
  await waitFor(() => expect(first.result.current.status).toBe("saved"));
  await waitFor(() => expect(second.result.current.status).toBe("saved"));
  expect(routes().sort()).toEqual([COUNTRY, FEED, ROLE, SECTORS, STACK].sort());
});
