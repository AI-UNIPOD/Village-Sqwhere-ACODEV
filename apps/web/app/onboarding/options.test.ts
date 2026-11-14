import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { ROLES, TECHNOLOGIES, TOPICS } from "./options";

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
