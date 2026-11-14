import { vi } from "vitest";

// What the hub tests share: made-up API answers and a fake `fetch` that serves them.
export const fetchMock = vi.fn();
export const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
export const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

export const idea = (over: Record<string, unknown> = {}) => ({
  id: "idea-1",
  title: "Borehole map for Kaduna",
  summary: "Villages do not know which boreholes work.",
  details: null,
  stage: "concept",
  status: "open",
  roles_needed: [],
  published_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  ...over,
});

export const agreement = (over: Record<string, unknown> = {}) => ({
  template_id: "template-1",
  version: 1,
  title: "TEST AGREEMENT (NOT LEGAL TEXT)",
  body: "# Hub agreement\n\nMembers keep the idea private.\n\n- No <b>sharing</b>\n- See [the terms](http://example.com)\n\n1. First clause\n2. Second clause",
  body_sha256: "a".repeat(64),
  hub_terms: {},
  ...over,
});

// The four phases with the hub at `current`: earlier ones done, later ones not started.
export const phasesAt = (current: string | null) => {
  const slugs = ["brainstorm", "design", "build", "review"];
  return slugs.map((phase, at) => ({
    phase,
    state: current === null || at > slugs.indexOf(current) ? "not_started" : at < slugs.indexOf(current) ? "done" : "in_progress",
  }));
};

export const hub = (over: Record<string, unknown> = {}) => ({
  id: "hub-1",
  name: "Borehole map hub",
  description: "Start with the SMS format.",
  status: "active",
  terms: { ownership_model: "custom", notes: "The owner keeps 40%." },
  idea: { id: "idea-1", title: "Borehole map for Kaduna", summary: "Villages do not know which boreholes work." },
  owner: { username: "kwabena-owusu", display_name: "Kwabena Owusu", is_verified: true },
  member_count: 1,
  agreement: { version: 1 },
  phase: null,
  team_confirmed_at: null,
  phases: phasesAt(null),
  viewer: { membership_status: "active", member_role: "owner" },
  ...over,
});

export const member = (username: string, display_name: string, over: Record<string, unknown> = {}) => ({
  user: { id: `id-${username}`, username, display_name, is_verified: false },
  member_role: "member",
  status: "active",
  joined_at: "2026-11-13T10:00:00Z",
  updated_at: "2026-11-13T10:00:00Z",
  ...over,
});

export const owner = () =>
  member("kwabena-owusu", "Kwabena Owusu", {
    member_role: "owner",
    user: { id: "id-kwabena-owusu", username: "kwabena-owusu", display_name: "Kwabena Owusu", is_verified: true },
  });

// Answers each address by its longest matching start; a list of answers is used one per call.
export function api(routes: Record<string, unknown>) {
  const used: Record<string, number> = {};
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const answers = routes[match];
    const answer = Array.isArray(answers) ? answers[Math.min(used[match] ?? 0, answers.length - 1)] : answers;
    used[match] = (used[match] ?? 0) + 1;
    return Promise.resolve(answer instanceof Response ? answer.clone() : reply(200, answer));
  });
}

const path = (url: unknown) => String(url).replace("http://localhost:8000", "");

// The requests that changed something, as [address, body or null].
export const posted = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url, init]) => [path(url), init.body ? JSON.parse(init.body) : null]);

// Every address asked for, as "METHOD /path".
export const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${path(url)}`);
