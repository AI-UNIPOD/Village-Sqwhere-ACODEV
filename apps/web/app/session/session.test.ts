import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY, SignedOutError, accessToken, apiFetch, parseSession, signOut } from "./session";

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

test("the access token for a socket is the stored one while it is fresh", async () => {
  store("2026-11-12T10:10:00Z");
  expect(await accessToken()).toBe("access-old");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the access token for a socket is refreshed first when it is about to expire", async () => {
  store("2026-11-12T10:00:20Z");
  fetchMock.mockResolvedValueOnce(tokens("access-new", "rt_new"));
  expect(await accessToken()).toBe("access-new");
  expect(stored().refresh_token).toBe("rt_new");
});

test("with no session there is no access token", async () => {
  await expect(accessToken()).rejects.toBeInstanceOf(SignedOutError);
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

test("calls made together share one refresh, so the second does not sign the person out", async () => {
  store("2026-11-12T09:59:00Z");
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith("/v1/auth/token") ? tokens("access-new", "rt_new") : reply(200)),
  );
  const [a, b] = await Promise.all([apiFetch("/v1/me"), apiFetch("/v1/me")]);
  expect([a.status, b.status]).toEqual([200, 200]);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/v1/auth/token"))).toHaveLength(1);
  expect(stored().refresh_token).toBe("rt_new");
});

test("a refused refresh keeps the new pair another tab already saved", async () => {
  store("2026-11-12T09:59:00Z");
  fetchMock.mockImplementationOnce(() => {
    // another tab rotated the token while this request was on its way
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored(), access_token: "access-tab", refresh_token: "rt_tab" }));
    return Promise.resolve(reply(401, { detail: { code: "REFRESH_TOKEN_INVALID" } }));
  });
  fetchMock.mockResolvedValueOnce(reply(200));
  await apiFetch("/v1/me");
  expect(authOf(fetchMock.mock.calls[1]).Authorization).toBe("Bearer access-tab");
  expect(stored().refresh_token).toBe("rt_tab");
});
