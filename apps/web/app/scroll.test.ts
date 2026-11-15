import { afterEach, expect, test, vi } from "vitest";

import { scrollToPart } from "./scroll";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

// a frame with a bar stuck at its top (the guided tour's) and a part of the page below it
function page(barHeight: number, partTop: number) {
  document.body.innerHTML = '<div data-frame><section data-sticks-top></section><section id="team"></section></div>';
  const frame = document.querySelector("[data-frame]")!;
  frame.querySelector("[data-sticks-top]")!.getBoundingClientRect = () => ({ height: barHeight }) as DOMRect;
  frame.querySelector("#team")!.getBoundingClientRect = () => ({ top: partTop }) as DOMRect;
  return frame;
}

test("the part lands just under the bar, gliding", () => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  scrollToPart(page(180, 600), "team");
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 600 - 180, behavior: "smooth" });
});

test("the scroll does not glide when the person asked for less motion", () => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  scrollToPart(page(180, 600), "team");
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 600 - 180, behavior: "auto" });
});
