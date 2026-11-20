import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { HeaderPin } from "./header-pin";

let callback: IntersectionObserverCallback | undefined;
let options: IntersectionObserverInit | undefined;
let watched: Element | undefined;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    callback = cb;
    options = init;
  }
  observe(el: Element) {
    watched = el;
  }
  disconnect() {}
}

// tell the observer whether the slot is in view (the header's own height is faked: jsdom has no layout)
function slotInView(inView: boolean) {
  act(() => callback?.([{ target: watched, isIntersecting: inView } as IntersectionObserverEntry], {} as IntersectionObserver));
}

function setup() {
  const view = render(
    <>
      <div data-header-slot="">
        <header>
          <nav aria-label="Main">
            <a href="#how">How</a>
          </nav>
        </header>
      </div>
      <HeaderPin />
    </>,
  );
  return {
    slot: view.container.querySelector<HTMLElement>("[data-header-slot]")!,
    header: view.container.querySelector<HTMLElement>("header")!,
  };
}

beforeEach(() => {
  callback = options = watched = undefined;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(102);
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
  expect(slot.style.minBlockSize).toBe("102px");
});

test("back at the top the pill fades out, then the header returns to the page", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { slot, header } = setup();
  slotInView(false);

  slotInView(true);
  expect(header.getAttribute("data-pinned")).toBe("leaving");
  expect(slot.style.minBlockSize).toBe("102px");

  // the animations of the links inside do not count
  fireAnimationEnd(header.querySelector("a")!);
  expect(header.getAttribute("data-pinned")).toBe("leaving");

  fireAnimationEnd(header);
  expect(header.hasAttribute("data-pinned")).toBe(false);
  expect(slot.style.minBlockSize).toBe("");
});

test("scrolling down again while the pill is leaving pins it again", () => {
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
  expect(slot.style.minBlockSize).toBe("102px");

  // an animation ending while it is not leaving changes nothing
  fireAnimationEnd(header);
  expect(header.getAttribute("data-pinned")).toBe("");
});

test("without IntersectionObserver the header stays as it is", () => {
  const { slot, header } = setup();
  expect(header.hasAttribute("data-pinned")).toBe(false);
  expect(slot.style.minBlockSize).toBe("");
});

function fireAnimationEnd(el: Element) {
  act(() => {
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
  });
}

// ---------- leaving with the footer ----------

// the page's header and its footer; jsdom has no layout, so the footer's place is set by hand
function withFooter() {
  let top = 2000;
  let height = 400;
  const view = render(
    <>
      <div data-header-slot="">
        <header>
          <nav aria-label="Main">
            <a href="#how">How</a>
          </nav>
        </header>
      </div>
      <footer>footer</footer>
      <HeaderPin />
    </>,
  );
  const footer = view.container.querySelector("footer")!;
  vi.spyOn(footer, "getBoundingClientRect").mockImplementation(() => ({ top, height, bottom: top + height }) as DOMRect);
  const header = view.container.querySelector<HTMLElement>("header")!;
  const scrollTo = (footerTop: number, footerHeight = 400) => {
    top = footerTop;
    height = footerHeight;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
  };
  return { header, scrollTo, leave: () => header.style.getPropertyValue("--leave") };
}

test("as the footer comes into view the pill leaves with it, and comes back the same way", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("innerHeight", 800);
  // the next frame at once; it reports no frame pending, as a real one has run by the next scroll
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  const { header, scrollTo, leave } = withFooter();
  // the footer still below the screen: the pill stays
  scrollTo(900);
  expect(leave()).toBe("0.000");
  expect(header.hasAttribute("data-away")).toBe(false);
  // a quarter of the footer in, then three quarters: the pill is that far on its way out
  scrollTo(700);
  expect(leave()).toBe("0.250");
  expect(header.hasAttribute("data-away")).toBe(false);
  scrollTo(500);
  expect(leave()).toBe("0.750");
  expect(header.hasAttribute("data-away")).toBe(true);
  // all of it in: gone
  scrollTo(300);
  expect(leave()).toBe("1.000");
  // scrolling back up brings it back by the same steps
  scrollTo(700);
  expect(leave()).toBe("0.250");
  expect(header.hasAttribute("data-away")).toBe(false);
  // a footer taller than the screen: the pill is gone once a screen of it is in
  scrollTo(400, 1200);
  expect(leave()).toBe("0.500");
  scrollTo(0, 1200);
  expect(leave()).toBe("1.000");
});

// jsdom has no layout, so this reads the stylesheet: with motion the pill slides by --leave, all
// the way off the screen; with reduced motion it does not slide and is hidden once away.
test("the pill slides out with the footer, or with reduced motion is simply hidden", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toContain(
    ".nav[data-pinned] { translate: 0 calc(var(--leave, 0) * -1 * (var(--pill-top) + env(safe-area-inset-top, 0px) + 100% + var(--space-4))); }",
  );
  expect(css).toContain(".nav[data-pinned]:focus-within { translate: none; }");
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
  expect(reduced).toContain(".nav[data-pinned] { translate: none; } .nav[data-pinned][data-away] { visibility: hidden; }");
});
