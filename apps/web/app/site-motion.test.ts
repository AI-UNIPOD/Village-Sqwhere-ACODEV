import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SITE_MOTION_KEY, applySiteMotion, forgetSiteMotion, reducesMotion, setSiteMotion, siteMotionOn } from "./site-motion";

const deviceAsksForLess = (reduced: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  forgetSiteMotion();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("scripts hold back only when the device asks for it and the visitor has not turned animations on", () => {
  deviceAsksForLess(false);
  expect(reducesMotion()).toBe(false);

  deviceAsksForLess(true);
  expect(reducesMotion()).toBe(true);

  setSiteMotion(true);
  expect(localStorage.getItem(SITE_MOTION_KEY)).toBe("on");
  expect(reducesMotion()).toBe(false);

  setSiteMotion(false);
  expect(localStorage.getItem(SITE_MOTION_KEY)).toBeNull();
  expect(reducesMotion()).toBe(true);
});

test("with storage blocked the choice still holds for the visit", () => {
  deviceAsksForLess(true);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  setSiteMotion(true);
  expect(siteMotionOn()).toBe(true);
  expect(reducesMotion()).toBe(false);
});

// a style sheet as the browser gives it: media rules with a media list, and rules inside them
const media = (mediaText: string, cssRules: unknown[] = []) => ({ media: { mediaText }, cssRules });
const rule = (cssText: string) => ({ cssText });

test("the style sheets' reduced-motion rules switch off and come back as the file wrote them", () => {
  const reduce = media("(prefers-reduced-motion: reduce)");
  const reduceAndWidth = media("(min-width: 360px) and (prefers-reduced-motion: reduce)");
  const calm = media("(prefers-reduced-motion: no-preference)");
  const calmAndHover = media("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  const wide = media("(min-width: 768px)", [rule("x")]);
  const nested = media("(min-width: 768px)", [reduce]);
  const sheet = { cssRules: [reduce, reduceAndWidth, calm, calmAndHover, wide, nested, rule("y")] };

  applySiteMotion([sheet], true);
  expect(reduce.media.mediaText).toBe("not all");
  expect(reduceAndWidth.media.mediaText).toBe("not all");
  expect(calm.media.mediaText).toBe("(min-width: 0px)");
  expect(calmAndHover.media.mediaText).toBe("(hover: hover) and (pointer: fine) and (min-width: 0px)");
  expect(wide.media.mediaText).toBe("(min-width: 768px)");

  applySiteMotion([sheet], true);
  expect(reduce.media.mediaText).toBe("not all");

  applySiteMotion([sheet], false);
  expect(reduce.media.mediaText).toBe("(prefers-reduced-motion: reduce)");
  expect(reduceAndWidth.media.mediaText).toBe("(min-width: 360px) and (prefers-reduced-motion: reduce)");
  expect(calm.media.mediaText).toBe("(prefers-reduced-motion: no-preference)");
  expect(calmAndHover.media.mediaText).toBe("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
});

test("a rule inside another rule is reached, and a style sheet that cannot be read is skipped", () => {
  const inner = media("(prefers-reduced-motion: reduce)");
  const sheet = { cssRules: [media("(min-width: 768px)", [inner])] };
  const foreign = {
    get cssRules(): never {
      throw new DOMException("blocked", "SecurityError");
    },
  };
  applySiteMotion([foreign, sheet], true);
  expect(inner.media.mediaText).toBe("not all");
});
