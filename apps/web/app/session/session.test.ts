import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY, SignedOutError, apiFetch, parseSession, signOut } from "./session";

const fetchMock = vi.fn();
const replace = vi.fn();
const NOW = new Date("2026-11-12T10:00:00Z");

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

const tokens = (access: string, refresh: string) =>
  reply(200, {
    data: { access_token: access, refresh_token: refresh, expires_in: 900, refresh_expires_at: "2026-12-12T10:00:00Z" },
  });

function store(expiresAt: string, refreshExpiresAt = "2026-12-12T10:00:00Z") {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      access_token: "access-old",
      refresh_token: "rt_old",
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
    }),
  );
}

const stored = () => JSON.parse(localStorage.getItem(SESSION_KEY)!);
const authOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { replace });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
});

test("a session counts until its refresh token expires, and anything unreadable is none", () => {
  const raw = (refreshExpiresAt: string) =>
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2026-11-12T09:00:00Z", refresh_expires_at: refreshExpiresAt });
  expect(parseSession(raw("2026-11-13T00:00:00Z"))).not.toBeNull();
  expect(parseSession(raw("2026-11-12T09:59:59Z"))).toBeNull();
  expect(parseSession("{not json")).toBeNull();
  expect(parseSession(JSON.stringify({ access_token: "a" }))).toBeNull();
  expect(parseSession(null)).toBeNull();
});

test("a call with a fresh access token sends it as a bearer token", async () => {
  store("2026-11-12T10:10:00Z");
  fetchMock.mockResolvedValue(reply(200));
  await apiFetch("/v1/me");
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/v1/me");
  expect(authOf(fetchMock.mock.calls[0]).Authorization).toBe("Bearer access-old");
});

test("an expired access token is refreshed first, and the new pair is kept", async () => {
  store("2026-11-12T09:59:00Z");
  fetchMock.mockResolvedValueOnce(tokens("access-new", "rt_new")).mockResolvedValueOnce(reply(200));
  await apiFetch("/v1/me");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ grant_type: "refresh_token", refresh_token: "rt_old" });
  expect(authOf(fetchMock.mock.calls[1]).Authorization).toBe("Bearer access-new");
  expect(stored()).toMatchObject({ access_token: "access-new", refresh_token: "rt_new", expires_at: "2026-11-12T10:15:00.000Z" });
});

test("a 401 gets one refresh and one retry", async () => {
  store("2026-11-12T10:10:00Z");
  fetchMock
    .mockResolvedValueOnce(reply(401))
    .mockResolvedValueOnce(tokens("access-new", "rt_new"))
    .mockResolvedValueOnce(reply(200));
  const response = await apiFetch("/v1/me");
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("a refused refresh forgets the session and says the person is signed out", async () => {
  store("2026-11-12T09:59:00Z");
  fetchMock.mockResolvedValueOnce(reply(401, { detail: { code: "REFRESH_TOKEN_INVALID" } }));
  await expect(apiFetch("/v1/me")).rejects.toBeInstanceOf(SignedOutError);
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("with no session, nothing is sent", async () => {
  await expect(apiFetch("/v1/me")).rejects.toBeInstanceOf(SignedOutError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("signing out forgets the session and the tab's answers, revokes the token and goes home", async () => {
  store("2026-11-12T10:10:00Z");
  sessionStorage.setItem("vs_onboarding_answers", "{}");
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await signOut("fr");
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  expect(sessionStorage.length).toBe(0);
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/v1/auth/logout");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refresh_token: "rt_old" });
  expect(replace).toHaveBeenCalledWith("/fr");
});

test("signing out still works when the API cannot be reached", async () => {
  store("2026-11-12T10:10:00Z");
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  await signOut("en");
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  expect(replace).toHaveBeenCalledWith("/en");
});
