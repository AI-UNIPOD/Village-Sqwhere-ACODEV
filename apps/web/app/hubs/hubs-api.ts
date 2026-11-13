import { call } from "../ideas/ideas-api";

export const OWNERSHIP = ["equal_split", "owner_majority", "custom"] as const;
export type Ownership = (typeof OWNERSHIP)[number];

// The agreement a person reads and signs. `body_sha256` proves which exact text was shown.
export type Agreement = { template_id: string; version: number; title: string; body: string; body_sha256: string };

// A hub's card, as the API answers it to any signed-in developer: nothing private is in it.
export type Hub = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  terms: { ownership_model?: Ownership; notes?: string };
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
