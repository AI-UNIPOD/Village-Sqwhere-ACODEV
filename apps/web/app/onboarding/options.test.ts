import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { COUNTRIES } from "../landing/gather";
import { ALPHA2, ROLES, TECHNOLOGIES, TOPICS, countriesFor } from "./options";

// The lists are written out here, with their French names, instead of read from the API's
// lookups. This keeps them in step with the slugs the database scripts add.
const initDir = join(__dirname, "../../../../infra/db/init");
const scripts = readdirSync(initDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(initDir, name), "utf8"));

// every slug the scripts insert into `table`, in the order they insert them
function seeded(table: string): string[] {
  const insert = new RegExp(`INSERT INTO ${table} \\(slug, name\\) VALUES([\\s\\S]*?);`, "g");
  return scripts.flatMap((sql) => [...sql.matchAll(insert)].flatMap((m) => [...m[1].matchAll(/\(\s*'([^']+)'/g)].map((s) => s[1])));
}

const slugs = (list: ReadonlyArray<{ slug: string }>) => list.map((item) => item.slug).sort();

test.each([
  ["roles", ROLES],
  ["technologies", TECHNOLOGIES],
  ["sectors", TOPICS],
])("the web lists exactly the %s the database has", (table, list) => {
  const inDatabase = seeded(table);
  expect(inDatabase.length).toBeGreaterThan(0);
  expect(slugs(list)).toEqual([...inDatabase].sort());
});

// The API checks a country against its own list. Keeping the web's codes equal to that list
// stops a country from being offered that the API would refuse, or the reverse.
test("the web's two-letter country codes are exactly the API's", () => {
  const python = readFileSync(join(__dirname, "../../../api/app/countries.py"), "utf8");
  // the codes are the quoted words after `frozenset(`
  const codes = [...python.slice(python.indexOf("frozenset(")).matchAll(/"([^"]+)"/g)].flatMap((m) => m[1].split(" ").filter(Boolean));
  expect(codes.length).toBeGreaterThan(0);

  const web = COUNTRIES.map(([, , alpha3]) => ALPHA2[alpha3]);
  expect(web.every((code) => /^[A-Z]{2}$/.test(code ?? ""))).toBe(true);
  expect(new Set(web).size).toBe(COUNTRIES.length);
  expect([...web].sort()).toEqual([...codes].sort());
  expect(Object.keys(ALPHA2).sort()).toEqual(COUNTRIES.map(([, , alpha3]) => alpha3).sort());
  expect(countriesFor("fr").every((country) => country.alpha2 === ALPHA2[country.code])).toBe(true);
});
