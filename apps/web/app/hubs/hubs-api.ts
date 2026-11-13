import { call } from "../ideas/ideas-api";

export const OWNERSHIP = ["equal_split", "owner_majority", "custom"] as const;
export type Ownership = (typeof OWNERSHIP)[number];

// The agreement a person reads and signs. `body_sha256` proves which exact text was shown.
export type Terms = { ownership_model?: Ownership; notes?: string };

// `hub_terms` is the terms signed with this text: empty on the current agreement, the hub's own on a hub's.
export type Agreement = { template_id: string; version: number; title: string; body: string; body_sha256: string; hub_terms: Terms };

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
  // both null for someone who was never a member
  viewer: { membership_status: string | null; member_role: "owner" | "member" | null };
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

// The hub of each idea the developer has a hub for, by the idea's id. The API cannot look a
// hub up by its idea, so this reads every page of the developer's hubs, 50 at a time.
export async function loadHubsByIdea(): Promise<Record<string, Hub>> {
  const found: Record<string, Hub> = {};
  let offset: number | null = 0;
  while (offset !== null) {
    const page: { data: Hub[]; next_offset: number | null } = await call(`/v1/me/hubs?offset=${offset}&limit=50`);
    for (const hub of page.data) found[hub.idea.id] = hub;
    offset = page.next_offset;
  }
  return found;
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

export const loadInvitations = async () => (await call<{ data: Hub[] }>("/v1/me/hubs?status=invited&limit=50")).data;

// The hubs the developer asked to join and the owner has not answered yet.
export const loadRequests = async () => (await call<{ data: Hub[] }>("/v1/me/hubs?status=requested&limit=50")).data;

// Answers with the hub card, whose `viewer.membership_status` is now "requested".
export const askToJoin = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/join-requests`, "POST")).data;

// The owner answers a request. Approving makes it an invitation (the member card says "invited"),
// which the developer then signs; declining makes it "declined".
export const approveRequest = async (id: string, userId: string) =>
  (await call<{ data: Member }>(`${hubPath(id)}/members/${encodeURIComponent(userId)}/approve`, "POST")).data;

export const declineRequest = async (id: string, userId: string) =>
  (await call<{ data: Member }>(`${hubPath(id)}/members/${encodeURIComponent(userId)}/decline`, "POST")).data;

// The agreement this hub was created on, which can be older than the current one.
export const loadHubAgreement = async (id: string) => (await call<{ data: Agreement }>(`${hubPath(id)}/agreement`)).data;

export const acceptInvitation = async (id: string, signature: { template_id: string; template_sha256: string; signed_legal_name: string }) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/invitation/accept`, "POST", signature)).data;
