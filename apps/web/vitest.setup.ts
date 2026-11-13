import { afterEach } from "vitest";

import { forgetMe } from "./app/session/me";

// jsdom has no matchMedia, and the header's theme switch reads the system setting through it.
// A test that cares about the answer stubs its own.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
}

// The profile is kept for a whole visit (app/session/me.ts). A test is a visit of its own.
afterEach(forgetMe);
