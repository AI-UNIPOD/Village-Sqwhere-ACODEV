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
  // set once the owner finishes the hub in review; nothing in it changes after that
  finished_at: string | null;
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

// The owner renames or describes the hub; `description: null` clears it. Answers with the hub card.
export const editHub = async (id: string, changes: { name: string; description: string | null }) =>
  (await call<{ data: Hub }>(`/v1/hubs/${encodeURIComponent(id)}`, "PATCH", changes)).data;

// The owner archives the hub for good: it stays readable and nothing in it changes any more.
export const archiveHub = async (id: string) => (await call<{ data: Hub }>(`/v1/hubs/${encodeURIComponent(id)}/archive`, "POST")).data;

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

// An active member who is not the owner leaves. Answers with the hub card, whose
// `viewer.membership_status` is then "left".
export const leaveHub = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/membership/leave`, "POST")).data;

// The owner removes an active member. The answer's member card, status "removed", is not needed:
// nobody sees removed people in the team list.
export const removeMember = (id: string, userId: string) => call<unknown>(`${hubPath(id)}/members/${encodeURIComponent(userId)}/remove`, "POST");

// The owner confirms the team, which opens brainstorm; both calls answer with the updated hub card.
export const confirmTeam = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/team/confirm`, "POST")).data;

// The owner moves the hub one phase forward or back.
export const movePhase = async (id: string, phase: Phase) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/phase`, "POST", { phase })).data;

// One sticky note of a hub's brainstorm. `can_delete` is true for its author and the hub's owner.
export type Note = {
  id: string;
  body: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
  created_at: string;
  can_delete: boolean;
};

export const NOTE_MAX = 280;

// Every note of the hub, oldest first, 50 at a time.
export async function loadNotes(id: string): Promise<Note[]> {
  const notes: Note[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: { data: Note[]; next_offset: number | null } = await call(`${hubPath(id)}/notes?offset=${offset}&limit=50`);
    notes.push(...page.data);
    offset = page.next_offset ?? null;
  }
  return notes;
}

export const addNote = async (id: string, body: string) => (await call<{ data: Note }>(`${hubPath(id)}/notes`, "POST", { body })).data;

export const deleteNote = (id: string, noteId: string) => call<null>(`${hubPath(id)}/notes/${encodeURIComponent(noteId)}`, "DELETE");

// One part of the system in a hub's design sketch. `can_delete` is true for its creator and the hub's owner.
export type Piece = {
  id: string;
  name: string;
  summary: string;
  created_by: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
  created_at: string;
  updated_at: string;
  can_delete: boolean;
};

// A labelled arrow from one piece to another: `from_piece_id` talks to `to_piece_id`.
export type PieceLink = {
  id: string;
  from_piece_id: string;
  to_piece_id: string;
  label: string;
  created_by: Piece["created_by"];
  created_at: string;
  can_delete: boolean;
};

// The whole sketch, oldest first. A hub holds at most 30 pieces and 60 links, so one answer has them all.
export type Sketch = { pieces: Piece[]; links: PieceLink[] };

export const loadSketch = async (id: string) => (await call<{ data: Sketch }>(`${hubPath(id)}/design`)).data;

export const PIECE_LIMITS = { name: 60, summary: 280, label: 60 };

export const addPiece = async (id: string, piece: { name: string; summary: string }) =>
  (await call<{ data: Piece }>(`${hubPath(id)}/pieces`, "POST", piece)).data;

// Only the fields that changed are sent.
export const editPiece = async (id: string, pieceId: string, changes: { name?: string; summary?: string }) =>
  (await call<{ data: Piece }>(`${hubPath(id)}/pieces/${encodeURIComponent(pieceId)}`, "PATCH", changes)).data;

// The piece's links go with it.
export const deletePiece = (id: string, pieceId: string) => call<null>(`${hubPath(id)}/pieces/${encodeURIComponent(pieceId)}`, "DELETE");

export const addLink = async (id: string, link: { from_piece_id: string; to_piece_id: string; label: string }) =>
  (await call<{ data: PieceLink }>(`${hubPath(id)}/links`, "POST", link)).data;

export const deleteLink = (id: string, linkId: string) => call<null>(`${hubPath(id)}/links/${encodeURIComponent(linkId)}`, "DELETE");

// A piece of the sketch with who builds it. The four `can_` flags say what the viewer may do now.
export type BuildPiece = {
  id: string;
  name: string;
  summary: string;
  claimed_by: Note["author"] | null;
  claimed_at: string | null;
  can_claim: boolean;
  can_release: boolean;
};

// One commit of the team's repository. Both texts come from GitHub: show them as plain text.
export type Commit = { sha: string; message: string; author_name: string; committed_at: string };

// The build tab in one answer: pieces oldest first, commits newest first (at most 20).
export type Build = {
  repository_url: string | null;
  commits_refreshed_at: string | null;
  can_set_repository: boolean;
  can_refresh: boolean;
  pieces: BuildPiece[];
  commits: Commit[];
};

// The address the API accepts, after it drops a trailing slash and ".git" (its own rule, checked
// here first so a wrong address is a field error before anything is sent).
export const tidyRepository = (address: string) => address.trim().replace(/\/$/, "").replace(/\.git$/, "");

export const isRepository = (address: string) =>
  address.length <= 200 &&
  /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(address) &&
  !address.split("/").slice(3).some((part) => part === "." || part === "..");

export const loadBuild = async (id: string) => (await call<{ data: Build }>(`${hubPath(id)}/build`)).data;

export const claimPiece = async (id: string, pieceId: string) =>
  (await call<{ data: BuildPiece }>(`${hubPath(id)}/pieces/${encodeURIComponent(pieceId)}/claim`, "POST")).data;

export const releasePiece = (id: string, pieceId: string) =>
  call<null>(`${hubPath(id)}/pieces/${encodeURIComponent(pieceId)}/claim`, "DELETE");

// The owner sets the team's repository, or clears it with null. Answers with the whole tab:
// the stored commits go when the address changes.
export const setRepository = async (id: string, repositoryUrl: string | null) =>
  (await call<{ data: Build }>(`${hubPath(id)}/repository`, "PUT", { repository_url: repositoryUrl })).data;

// Any active member asks GitHub for the latest commits, at most once a minute. Answers with the whole tab.
export const refreshCommits = async (id: string) => (await call<{ data: Build }>(`${hubPath(id)}/commits/refresh`, "POST")).data;

// One check against a piece. The three `can_` flags say what the viewer may do now.
export type ReviewCheck = {
  id: string;
  text: string;
  created_by: Note["author"];
  created_at: string;
  ticked_by: Note["author"] | null;
  ticked_at: string | null;
  can_tick: boolean;
  can_untick: boolean;
  can_delete: boolean;
};

export type ReviewPiece = { id: string; name: string; summary: string; claimed_by: Note["author"] | null; checks: ReviewCheck[] };

// The review checklist in one answer. `can_add` and `can_finish` are for the viewer.
export type Review = { finished_at: string | null; can_add: boolean; can_finish: boolean; open_checks: number; pieces: ReviewPiece[] };

export const CHECK_MAX = 200;

export const loadReview = async (id: string) => (await call<{ data: Review }>(`${hubPath(id)}/review`)).data;

export const addCheck = async (id: string, pieceId: string, text: string) =>
  (await call<{ data: ReviewCheck }>(`${hubPath(id)}/pieces/${encodeURIComponent(pieceId)}/checks`, "POST", { text })).data;

export const tickCheck = async (id: string, checkId: string) =>
  (await call<{ data: ReviewCheck }>(`${hubPath(id)}/checks/${encodeURIComponent(checkId)}/tick`, "POST")).data;

export const untickCheck = async (id: string, checkId: string) =>
  (await call<{ data: ReviewCheck }>(`${hubPath(id)}/checks/${encodeURIComponent(checkId)}/tick`, "DELETE")).data;

export const deleteCheck = (id: string, checkId: string) => call<null>(`${hubPath(id)}/checks/${encodeURIComponent(checkId)}`, "DELETE");

// The owner finishes the hub once every check is ticked. Answers with the hub card.
export const finishHub = async (id: string) => (await call<{ data: Hub }>(`${hubPath(id)}/finish`, "POST")).data;

// One message of a hub's chat. `reply_to.body` is null once the quoted message is deleted.
export type Message = {
  id: string;
  body: string;
  author: Note["author"];
  reply_to: { id: string; author: Note["author"]; body: string | null } | null;
  created_at: string;
  edited_at: string | null;
  can_edit: boolean;
  can_delete: boolean;
};

export const MESSAGE_MAX = 10_000;

// One page of the chat, newest first, as the API sends it.
export const loadMessages = (id: string, offset = 0) =>
  call<{ data: Message[]; next_offset: number | null }>(`${hubPath(id)}/messages?offset=${offset}&limit=50`);

export const sendMessage = async (id: string, message: { body: string; reply_to_id?: string }) =>
  (await call<{ data: Message }>(`${hubPath(id)}/messages`, "POST", message)).data;

export const editMessage = async (id: string, messageId: string, body: string) =>
  (await call<{ data: Message }>(`${hubPath(id)}/messages/${encodeURIComponent(messageId)}`, "PATCH", { body })).data;

export const deleteMessage = (id: string, messageId: string) =>
  call<null>(`${hubPath(id)}/messages/${encodeURIComponent(messageId)}`, "DELETE");

// The agreement this hub was created on, which can be older than the current one.
export const loadHubAgreement = async (id: string) => (await call<{ data: Agreement }>(`${hubPath(id)}/agreement`)).data;

// The signed-in person's own place in a hub and what they signed. A member who left or was
// removed keeps their signature. `template_sha256` is the hash of the exact text they signed.
export type Membership = {
  member_role: "owner" | "member";
  status: string;
  created_at: string;
  joined_at: string | null;
  left_at: string | null;
  signature: {
    version: number;
    template_sha256: string;
    signed_legal_name: string;
    terms_snapshot: Terms;
    signed_at: string;
  } | null;
};

export const loadMembership = async (id: string) => (await call<{ data: Membership }>(`${hubPath(id)}/membership`)).data;

export const acceptInvitation = async (id: string, signature: { template_id: string; template_sha256: string; signed_legal_name: string }) =>
  (await call<{ data: Hub }>(`${hubPath(id)}/invitation/accept`, "POST", signature)).data;
