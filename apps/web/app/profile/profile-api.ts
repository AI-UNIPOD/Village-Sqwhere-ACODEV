import { call } from "../ideas/ideas-api";
import type { Me } from "../session/me";

// Each change answers with the profile as the API now holds it, or the part that changed.
// The roles come back one at a time, so the page loads the profile again after them.
export const saveProfile = async (changes: { display_name?: string; bio?: string }) =>
  (await call<{ data: Me }>("/v1/me", "PATCH", changes)).data;

export const addRole = (slug: string) => call("/v1/me/roles", "POST", { role: slug, is_primary: false });

export const makeMainRole = (slug: string) => call(`/v1/me/roles/${slug}`, "PATCH", { is_primary: true });

export const removeRole = (slug: string) => call(`/v1/me/roles/${slug}`, "DELETE");

export const saveStack = async (slugs: string[]) =>
  (await call<{ data: Me["technologies"] }>("/v1/me/technologies", "PUT", { technologies: slugs })).data;

export const saveSectors = async (slugs: string[]) =>
  (await call<{ data: Me["sectors"] }>("/v1/me/sectors", "PUT", { sectors: slugs })).data;
