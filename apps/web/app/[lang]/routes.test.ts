import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { expect, test } from "vitest";

// The demo line lives in AppFrame, so a screen the demo account can open must be drawn inside
// it: in its loading state, its failure state and its normal state. These routes are left out
// on purpose: signed-out pages, the GitHub return and the goodbye after deleting an account,
// none of which the demo account reaches (it signs in without GitHub and cannot delete itself).
const EXEMPT = new Set(["page.tsx", "sign-in/page.tsx", "auth/callback/page.tsx", "goodbye/page.tsx"]);

const text = (file: string) => readFileSync(file, "utf8");
const framed = (file: string) => text(file).includes("<AppFrame");

// the files a route's page imports from this app, other than its words and its language check
function screens(page: string): string[] {
  return [...text(page).matchAll(/from "(\.[^"]+)"/g)]
    .map((match) => resolve(dirname(page), match[1]))
    .filter((base) => !/[\\/](copy|locales)$/.test(base))
    .map((base) => `${base}.tsx`)
    .filter(existsSync);
}

const pages = readdirSync(__dirname, { recursive: true })
  .map(String)
  .map((file) => file.split(sep).join("/"))
  .filter((file) => /(^|\/)page\.tsx$/.test(file))
  .filter((file) => !EXEMPT.has(file));

test("the routes under a language are found", () => {
  expect(pages).toContain("posts/view/page.tsx");
  expect(pages.length).toBeGreaterThan(15);
});

test.each(pages)("%s draws its screen inside AppFrame, so the demo line shows", (page) => {
  const file = join(__dirname, page);
  if (framed(file)) return;
  const own = screens(file);
  expect(own.length).toBeGreaterThan(0);
  // the screen and its loading state
  for (const screen of own) expect(framed(screen), relative(__dirname, screen)).toBe(true);
});

test.each(pages)("%s has an error screen inside AppFrame, so the demo line shows when it fails", (page) => {
  let folder = dirname(join(__dirname, page));
  while (!existsSync(join(folder, "error.tsx"))) folder = dirname(folder);
  // the one at the language itself is the plain page for routes with no frame
  expect(folder, "no error.tsx of its own").not.toBe(__dirname);
  expect(framed(join(folder, "error.tsx"))).toBe(true);
});
