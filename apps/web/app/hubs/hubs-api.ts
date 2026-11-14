import { call } from "../ideas/ideas-api";

export const OWNERSHIP = ["equal_split", "owner_majority", "custom"] as const;
export type Ownership = (typeof OWNERSHIP)[number];

// The agreement a person reads and signs. `body_sha256` proves which exact text was shown.
export type Terms = { ownership_model?: Ownership; notes?: string };

// `hub_terms` is the terms signed with this text: empty on the current agreement, the hub's own on a hub's.
export type Agreement = { template_id: string; version: number; title: string; body: string; body_sha256: string; hub_terms: Terms };

export const PHASES = ["brainstorm", "design", "build", "review"] as const;
export type Phase = (typeof PHASES)[number];
export type PhaseState = "not_started" | "in_progress" | "done";

// A hub's card, as the API answers it to any signed-in developer: nothing private is in it.
export type Hub = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  terms: Terms;
  idea: { id: string; title: string; summary: string };
  owner: { username: string; display_name: string; is_verified: boolean };
  member_count: number;
  agreement: { version: number };
  // `phase` and `team_confirmed_at` are null until the owner confirms the team
  phase: Phase | null;
  team_confirmed_at: string | null;
  phases: { phase: Phase; state: PhaseState }[];
  // both null for someone who was never a member
  // `can_ask_again_at` is set only while a wait after a decline is still ahead
  viewer: { membership_status: string | null; member_role: "owner" | "member" | null; can_ask_again_at?: string | null };
};

export type NewHub = {
  idea_id: string;
  name: string;
  description: string | null;
  terms: { ownership_model: Ownership; notes?: string };
  agreement: { template_id: string; template_sha256: string; signed_legal_name: string };
};

export const LIMITS = { nameMax: 120, descriptionMax: 2000, notesMax: 1000, legalNameMin: 2, legalNameMax: 200 };

export const loadAgreement = async () => (await call<{ data: Agreement }>("/v1/agreements/current")).data;

export const createHub = async (hub: NewHub) => (await call<{ data: Hub }>("/v1/hubs", "POST", hub)).data;

export const loadHub = async (id: string) => (await call<{ data: Hub }>(`/v1/hubs/${encodeURIComponent(id)}`)).data;

export const loadMyHubs = (offset = 0) =>
  call<{ data: Hub[]; next_offset: number | null }>(`/v1/me/hubs?offset=${offset}&limit=20`);

// Every page of the developer's hubs, 50 at a time (the most the API sends at once).
// `status` keeps only the hubs where the developer's membership has that status.
async function loadAllMyHubs(status?: "invited" | "requested"): Promise<Hub[]> {
  const hubs: Hub[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: { data: Hub[]; next_offset: number | null } = await call(
      `/v1/me/hubs?${status ? `status=${status}&` : ""}offset=${offset}&limit=50`,
    );
    hubs.push(...page.data);
    offset = page.next_offset ?? null;
  }
  return hubs;
}

// The hub of each idea the developer has a hub for, by the idea's id. The API cannot look a
// hub up by its idea, so this reads all of the developer's hubs.
export async function loadHubsByIdea(): Promise<Record<string, Hub>> {
  return Object.fromEntries((await loadAllMyHubs()).map((hub) => [hub.idea.id, hub]));
}

// One person's place in a hub. Only an owner is sent the `requested`, `invited` and `declined` ones.
export type Member = {
  user: { id: string; username: string; display_name: string; is_verified: boolean };
  member_role: "owner" | "member";
  status: "active" | "requested" | "invited" | "declined";
  joined_at: string | null;
  updated_at: string;
};

// The idea as its team sees it: `details` is the confidential brief.
export type Brief = { id: string; title: string; summary: string; details: string | null };

const hubPath = (id: string) => `/v1/hubs/${encodeURIComponent(id)}`;

export const loadMembers = async (id: string) => (await call<{ data: Member[] }>(`${hubPath(id)}/members`)).data;

export const loadBrief = async (id: string) => (await call<{ data: Brief }>(`${hubPath(id)}/idea`)).data;

export const inviteMember = async (id: string, username: string) =>
  (await call<{ data: Member }>(`${hubPath(id)}/invitations`, "POST", { username })).data;

export const withdrawInvitation = (id: string, userId: string) =>
  call<null>(`${hubPath(id)}/invitations/${encodeURIComponent(userId)}`, "DELETE");

export const declineInvitation = async (id: string) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/invitation/decline`, "POST")).data;

export const loadInvitations = () => loadAllMyHubs("invited");

// The hubs the developer asked to join and the owner has not answered yet.
export const loadRequests = () => loadAllMyHubs("requested");

// Answers with the hub card, whose `viewer.membership_status` is now "requested".
export const askToJoin = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/join-requests`, "POST")).data;

// The developer takes back a request the owner has not answered. Answers with the hub card,
// whose `viewer.membership_status` is then "declined", with no wait before asking again.
export const withdrawRequest = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/join-request/withdraw`, "POST")).data;

// The owner answers a request. Approving makes it an invitation (the member card says "invited"),
// which the developer then signs; declining makes it "declined".
export const approveRequest = async (id: string, userId: string) =>
  (await call<{ data: Member }>(`${hubPath(id)}/members/${encodeURIComponent(userId)}/approve`, "POST")).data;

export const declineRequest = async (id: string, userId: string) =>
  (await call<{ data: Member }>(`${hubPath(id)}/members/${encodeURIComponent(userId)}/decline`, "POST")).data;

// The owner confirms the team, which opens brainstorm; both calls answer with the updated hub card.
export const confirmTeam = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/team/confirm`, "POST")).data;

// The owner moves the hub one phase forward or back.
export const movePhase = async (id: string, phase: Phase) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/phase`, "POST", { phase })).data;

// The agreement this hub was created on, which can be older than the current one.
export const loadHubAgreement = async (id: string) => (await call<{ data: Agreement }>(`${hubPath(id)}/agreement`)).data;

export const acceptInvitation = async (id: string, signature: { template_id: string; template_sha256: string; signed_legal_name: string }) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/invitation/accept`, "POST", signature)).data;
