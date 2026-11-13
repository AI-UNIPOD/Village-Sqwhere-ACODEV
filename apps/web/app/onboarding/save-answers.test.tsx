import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { saveAnswers, useSavedProfile } from "./save-answers";
import { NO_ANSWERS } from "./steps";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const claimed = () => reply(409, { detail: { code: "ROLE_ALREADY_CLAIMED" } });

const answers = { ...NO_ANSWERS, role: "backend-engineer", stack: ["go", "docker"], country: "SN", topics: ["fintech"], feed: ["python"] };

// what the API received, as method, path and parsed body
const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => [
    init.method,
    String(url).replace("http://localhost:8000", ""),
    JSON.parse(init.body),
    init.headers["Content-Type"],
  ]);

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

test("a new role is posted as the main one, then the stack, the feed's technologies and the sectors are saved", async () => {
  fetchMock.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
  await saveAnswers(answers);
  expect(requests()).toEqual([
    ["POST", "/v1/me/roles", { role: "backend-engineer", is_primary: true }, "application/json"],
    ["PUT", "/v1/me/technologies", { technologies: ["go", "docker"] }, "application/json"],
    ["PUT", "/v1/me/feed-topics", { technologies: ["python"] }, "application/json"],
    ["PUT", "/v1/me/sectors", { sectors: ["fintech"] }, "application/json"],
  ]);
});

test("a role the developer already has is made the main one, then the stack is saved", async () => {
  fetchMock.mockResolvedValueOnce(claimed()).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
  await saveAnswers(answers);
  expect(requests()).toEqual([
    ["POST", "/v1/me/roles", { role: "backend-engineer", is_primary: true }, "application/json"],
    ["PATCH", "/v1/me/roles/backend-engineer", { is_primary: true }, "application/json"],
    ["PUT", "/v1/me/technologies", { technologies: ["go", "docker"] }, "application/json"],
    ["PUT", "/v1/me/feed-topics", { technologies: ["python"] }, "application/json"],
    ["PUT", "/v1/me/sectors", { sectors: ["fintech"] }, "application/json"],
  ]);
});

test.each([
  ["posting the role", [reply(500)]],
  ["making the role the main one", [claimed(), reply(500)]],
  ["saving the stack", [reply(201), reply(500)]],
  ["saving what the feed shows", [reply(201), reply(200), reply(500)]],
  ["saving the sectors", [reply(201), reply(200), reply(200), reply(500)]],
  ["a conflict that is not about the role", [reply(409, { detail: { code: "OTHER" } })]],
])("a failure while %s rejects", async (_, replies) => {
  for (const r of replies) fetchMock.mockResolvedValueOnce(r);
  await expect(saveAnswers(answers)).rejects.toThrow();
});

test("with no role chosen the hook stays idle and sends nothing", async () => {
  const { result } = renderHook(() => useSavedProfile(NO_ANSWERS));
  await act(async () => {});
  expect(result.current.status).toBe("idle");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the hook goes from saving to saved", async () => {
  fetchMock.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
  const { result } = renderHook(() => useSavedProfile(answers));
  expect(result.current.status).toBe("saving");
  await waitFor(() => expect(result.current.status).toBe("saved"));
});

test("after a failure, retry saves again and ends saved", async () => {
  fetchMock.mockResolvedValueOnce(reply(500));
  const { result } = renderHook(() => useSavedProfile(answers));
  await waitFor(() => expect(result.current.status).toBe("failed"));

  fetchMock.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
  act(() => result.current.retry());
  expect(result.current.status).toBe("saving");
  await waitFor(() => expect(result.current.status).toBe("saved"));
  expect(requests().map(([method]) => method)).toEqual(["POST", "POST", "PUT", "PUT", "PUT"]);
});

test("two done steps opened together save once", async () => {
  fetchMock.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
  const first = renderHook(() => useSavedProfile(answers));
  const second = renderHook(() => useSavedProfile(answers));
  await waitFor(() => expect(first.result.current.status).toBe("saved"));
  await waitFor(() => expect(second.result.current.status).toBe("saved"));
  expect(requests().map(([method]) => method)).toEqual(["POST", "PUT", "PUT", "PUT"]);
});
