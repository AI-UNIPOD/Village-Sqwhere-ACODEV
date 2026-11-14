import { apiFetch } from "../session/session";

export const STAGES = ["concept", "prototype", "building"] as const;
export type Stage = (typeof STAGES)[number];
export type IdeaStatus = "draft" | "open" | "closed";

// One of the signed-in developer's own ideas, as /v1/me/ideas answers. A list item has no
// `details`: the private brief only comes with a single idea.
export type OwnedIdea = {
  id: string;
  title: string;
  summary: string;
  details?: string | null;
  stage: Stage;
  status: IdeaStatus;
  roles_needed: { slug: string; name: string }[];
  published_at: string | null;
  updated_at: string;
};

// What the form holds. `details` is an empty string when there is no private brief.
export type IdeaFields = { title: string; summary: string; details: string; stage: Stage; roles: string[] };

export const LIMITS = { titleMin: 5, titleMax: 150, summaryMin: 20, summaryMax: 1000, detailsMax: 20000 };

// The API refused the request. `code` is its own code ("NOT_FOUND", "UNKNOWN_ROLE"...), or
// "INVALID" for a field it turned down, with the field's name in `field`. `detail` is whatever
// else the refusal carries, such as the date a wait ends.
export class IdeaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly field?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(`${status} ${code}`);
  }
}

export async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const answer = await response.json().catch(() => null);
  if (response.ok) return answer as T;
  const detail = answer?.detail;
  // a field error is a list, each item naming its field last in `loc`
  if (Array.isArray(detail)) throw new IdeaError(response.status, "INVALID", String(detail[0]?.loc?.at(-1) ?? ""));
  if (typeof detail?.code === "string") throw new IdeaError(response.status, detail.code, undefined, detail);
  throw new IdeaError(response.status, "UNKNOWN");
}

export const loadMyIdeas = (offset = 0) =>
  call<{ data: OwnedIdea[]; next_offset: number | null }>(`/v1/me/ideas?offset=${offset}&limit=20`);

export const loadMyIdea = async (id: string) =>
  (await call<{ data: OwnedIdea }>(`/v1/me/ideas/${encodeURIComponent(id)}`)).data;

export const toFields = (idea: OwnedIdea): IdeaFields => ({
  title: idea.title,
  summary: idea.summary,
  details: idea.details ?? "",
  stage: idea.stage,
  roles: idea.roles_needed.map((role) => role.slug),
});

const body = (fields: IdeaFields) => ({
  title: fields.title.trim(),
  summary: fields.summary.trim(),
  details: fields.details.trim() === "" ? null : fields.details,
  stage: fields.stage,
  roles_needed: fields.roles,
});

// Creates the draft, or sends only what changed since `saved`: an unchanged title or summary
// must not make the API drop the idea's place in matching. Returns the idea as it now is.
export async function saveIdea(fields: IdeaFields, saved: OwnedIdea | null): Promise<OwnedIdea> {
  const next = body(fields);
  if (!saved) return (await call<{ data: OwnedIdea }>("/v1/me/ideas", "POST", next)).data;
  const before = body(toFields(saved));
  const changed = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])),
  );
  if (Object.keys(changed).length === 0) return saved;
  return (await call<{ data: OwnedIdea }>(`/v1/me/ideas/${saved.id}`, "PATCH", changed)).data;
}

export const publishIdea = async (id: string) =>
  (await call<{ data: OwnedIdea }>(`/v1/me/ideas/${id}/publish`, "POST")).data;

export const closeIdea = async (id: string) =>
  (await call<{ data: OwnedIdea }>(`/v1/me/ideas/${id}/close`, "POST")).data;

// An open idea as every signed-in developer sees it: the public part only, never the brief.
export type PublicIdea = {
  id: string;
  title: string;
  summary: string;
  stage: Stage;
  roles_needed: { slug: string; name: string }[];
  author: { username: string; display_name: string; is_verified: boolean };
  // null until the owner opens the idea's hub
  hub_id: string | null;
  published_at: string;
};

export const loadOpenIdeas = (offset = 0) =>
  call<{ data: PublicIdea[]; next_offset: number | null }>(`/v1/ideas?offset=${offset}&limit=20`);

export const loadOpenIdea = async (id: string) =>
  (await call<{ data: PublicIdea }>(`/v1/ideas/${encodeURIComponent(id)}`)).data;

// An open idea that needs the signed-in developer, with the verified roles of theirs it needs
// and the technologies they share with the idea's author.
export type IdeaMatch = {
  idea: PublicIdea;
  matched_roles: { slug: string; name: string }[];
  shared_technologies: { slug: string; name: string }[];
};

export const loadIdeasForMe = (offset = 0) =>
  call<{ data: IdeaMatch[]; next_offset: number | null }>(`/v1/me/matches?offset=${offset}&limit=20`);

// A developer verified in a role an idea needs, with why: `shared_technologies` are the ones they
// share with the idea's owner. `country_code` is null when they named no country.
export type Developer = {
  id: string;
  username: string;
  display_name: string;
  is_verified: boolean;
  matched_roles: { slug: string; name: string }[];
  technologies: { slug: string; name: string }[];
  shared_technologies: { slug: string; name: string }[];
  country_code: string | null;
};

export const loadDevelopersForIdea = (id: string, offset = 0) =>
  call<{ data: Developer[]; next_offset: number | null }>(
    `/v1/me/ideas/${encodeURIComponent(id)}/matches?offset=${offset}&limit=20`,
  );
