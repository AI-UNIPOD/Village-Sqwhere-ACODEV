import { call } from "../ideas/ideas-api";

type Ref = { slug: string; name: string };

// Another developer as any signed-in developer sees them: a match card's fields and the bio.
export type Person = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  country_code: string | null;
  is_verified: boolean;
  // only the roles they passed verification in
  verified_roles: Ref[];
  technologies: Ref[];
  sectors: Ref[];
};

export const loadPerson = async (username: string) =>
  (await call<{ data: Person }>(`/v1/users/${encodeURIComponent(username)}`)).data;
