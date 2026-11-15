import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useFramePin } from "./frame-pin";

let callback: IntersectionObserverCallback | undefined;
let options: IntersectionObserverInit | undefined;
let watched: Element | undefined;
let disconnected = false;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    callback = cb;
    options = init;
  }
  observe(el: Element) {
    watched = el;
  }
  disconnect() {
    disconnected = true;
  }
}

// tell the observer whether the slot is in view (the header's own height is faked: jsdom has no layout)
function slotInView(inView: boolean) {
  act(() => callback?.([{ target: watched, isIntersecting: inView } as IntersectionObserverEntry], {} as IntersectionObserver));
}

function Frame({ enabled = true }: { enabled?: boolean }) {
  const { slot, header } = useFramePin(enabled);
  return (
    <div ref={slot} data-header-slot="">
      <header ref={header}>
        <a href="#top">Home</a>
      </header>
    </div>
  );
}

function setup(enabled = true) {
  const view = render(<Frame enabled={enabled} />);
  return {
    view,
    slot: view.container.querySelector<HTMLElement>("[data-header-slot]")!,
    header: view.container.querySelector<HTMLElement>("header")!,
  };
}

function fireAnimationEnd(el: Element) {
  act(() => {
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
  });
}

beforeEach(() => {
  callback = options = watched = undefined;
  disconnected = false;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(56);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the header is pinned when its slot leaves the screen, and the slot keeps its height", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { slot, header } = setup();
  expect(watched).toBe(slot);
  expect(options?.rootMargin).toBe("80px 0px 0px 0px");

  slotInView(true);
  expect(header.hasAttribute("data-pinned")).toBe(false);

  slotInView(false);
  expect(header.getAttribute("data-pinned")).toBe("");
  expect(slot.style.minBlockSize).toBe("56px");
});

test("back at the top the pill fades out, then the header returns to the page", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { slot, header } = setup();
  slotInView(false);

  slotInView(true);
  expect(header.getAttribute("data-pinned")).toBe("leaving");
  expect(slot.style.minBlockSize).toBe("56px");

  // the animations of the links inside do not count
  fireAnimationEnd(header.querySelector("a")!);
  expect(header.getAttribute("data-pinned")).toBe("leaving");

  fireAnimationEnd(header);
  expect(header.hasAttribute("data-pinned")).toBe(false);
  expect(slot.style.minBlockSize).toBe("");
});

test("scrolling down again while the pill is leaving pins it again, with the height the page had", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { slot, header } = setup();
  slotInView(false);
  slotInView(true);
  slotInView(false);
  expect(header.getAttribute("data-pinned")).toBe("");

  // the pill is shorter than the header: the slot keeps the height measured in the page
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(48);
  slotInView(true);
  slotInView(false);
  expect(slot.style.minBlockSize).toBe("56px");

  // an animation ending while it is not leaving changes nothing
  fireAnimationEnd(header);
  expect(header.getAttribute("data-pinned")).toBe("");
});

test("without IntersectionObserver the header stays as it is", () => {
  const { slot, header } = setup();
  expect(header.hasAttribute("data-pinned")).toBe(false);
  expect(slot.style.minBlockSize).toBe("");
});

test("a header that is not to be pinned is not watched", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  setup(false);
  expect(watched).toBeUndefined();
});

test("a screen going away puts the header back in the page", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { view, slot, header } = setup();
  slotInView(false);
  view.unmount();
  expect(disconnected).toBe(true);
  expect(header.hasAttribute("data-pinned")).toBe(false);
  expect(slot.style.minBlockSize).toBe("");
});
