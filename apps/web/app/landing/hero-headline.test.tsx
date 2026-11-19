import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { copy } from "./copy";
import { HeroHeadline } from "./hero-headline";
import { headlineEdit } from "./hero-headline-copy";
import { MOTION_KEY, setMotion } from "./motion";

// jsdom has no layout, so the lines and the widths are stand-ins: the headline has two lines
// ("Builders across" over the rest), a text box `room` px wide, and 10px for each character.
let room = 1000;
let seen = true;
let intersect: (isIntersecting: boolean) => void = () => {};

function stubMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  room = 1000;
  seen = true;
  stubMotion(false);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersect = (isIntersecting) => act(() => callback([{ isIntersecting }]));
      }
      observe() {
        setTimeout(() => intersect(seen), 0);
      }
      disconnect() {}
    },
  );
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn() })) as unknown as Element["animate"];
  // the words of the headline, on the line they sit on (the second line starts at "Africa" or "une")
  Range.prototype.getClientRects = function () {
    const word = this.toString().split(" ")[0];
    const top = ["Builders", "across", "Toute", "l'Afrique,"].includes(word) ? 0 : 55;
    return [{ top, left: 0, right: 10, bottom: top + 55, width: 10, height: 55 }] as unknown as DOMRectList;
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const content = this.dataset.part === "content";
    const width = content ? (this.textContent ?? "").length * 10 : room;
    return { left: 0, top: 0, right: width, bottom: 110, width, height: 110 } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error the stand-in is removed again
  delete Element.prototype.animate;
});

function renderHeadline(lang: "en" | "fr" = "en") {
  return render(<HeroHeadline id="title" headline={copy[lang].headline} edit={headlineEdit[lang]} />);
}

const heading = (container: HTMLElement) => container.querySelector("h1")!;
const lastLine = (container: HTMLElement) =>
  container.querySelector('[data-part="content"]')?.textContent ?? null;
const tags = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-part="tag"]')).map((tag) => tag.textContent);
const state = (container: HTMLElement) => heading(container).getAttribute("data-headline");

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// Plays from the start in small steps and notes each new last line and each new name.
async function watch(container: HTMLElement, total: number) {
  const lines: string[] = [];
  const names: string[] = [];
  for (let t = 0; t < total; t += 20) {
    await advance(20);
    const line = lastLine(container);
    if (line !== null && line !== lines[lines.length - 1]) lines.push(line);
    for (const name of tags(container)) if (name && !names.includes(name)) names.push(name);
  }
  return { lines, names };
}

test.each([
  ["en", "Builders across Africa, one square."],
  ["fr", "Toute l'Afrique, une seule place."],
] as const)("the %s heading is named by the real headline, still and while it plays", async (lang, headline) => {
  const { container } = renderHeadline(lang);
  expect(screen.getByRole("heading", { level: 1, name: headline })).toBeTruthy();
  await advance(1000);
  expect(state(container)).toBe("playing");
  expect(screen.getByRole("heading", { level: 1, name: headline })).toBeTruthy();
  // the animated layer is hidden from readers, and the underlined words are in the real text
  expect(container.querySelector('[aria-hidden="true"]')?.querySelector('[data-part="line"]')).not.toBeNull();
  expect(container.querySelector("[data-mark]")?.textContent).toBe(headlineEdit[lang].underline);
});

test("the server HTML has the real headline and no layer", async () => {
  const { renderToString } = await import("react-dom/server");
  const html = renderToString(
    <HeroHeadline id="title" headline={copy.en.headline} edit={headlineEdit.en} />,
  );
  expect(html).toContain("Builders across Africa, ");
  expect(html).toContain("one square");
  expect(html).not.toContain("data-part");
  expect(html).not.toContain("data-headline");
});

test.each(["en", "fr"] as const)("each %s edit ends on the real headline", (lang) => {
  const { steps, draft } = headlineEdit[lang];
  const typed = steps.slice(0, -1).at(-1)!.text;
  const prefix = draft.slice(0, draft.lastIndexOf(" ") + 1);
  expect(`${prefix}${typed}${steps.at(-1)!.text}`).toBe(copy[lang].headline);
  expect(copy[lang].headline).toContain(headlineEdit[lang].underline);
});

test("with reduced motion the headline stands still, underlined, with no carets", async () => {
  stubMotion(true);
  const { container } = renderHeadline();
  await advance(8000);
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  expect(container.querySelector('[data-part="line"]')).toBeNull();
  expect(heading(container).textContent).toBe("Builders across Africa, one square.");
  expect(container.querySelector("[data-mark]")?.textContent).toBe("one square");
  expect(Element.prototype.animate).not.toHaveBeenCalled();
});

test("with the motion button off it also stands still", async () => {
  localStorage.setItem(MOTION_KEY, "off");
  const { container } = renderHeadline();
  await advance(8000);
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
});

test("on a phone it stands still too: there is no motion button there, and the edit runs past five seconds", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  const { container } = renderHeadline();
  await advance(8000);
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  expect(heading(container).textContent).toBe("Builders across Africa, one square.");
  expect(Element.prototype.animate).not.toHaveBeenCalled();
});

test("the beats come in order and end on the real headline", async () => {
  const { container } = renderHeadline();
  const { lines, names } = await watch(container, 8000);
  expect(names).toEqual(["Hamza · Morocco", "Thandiwe · South Africa", "Ọmọlará · Nigeria"]);
  const order = ["Africa, one platform", "Africa, one place", "Africa, one square", "Africa, one square."];
  const at = order.map((line) => lines.indexOf(line));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
  // typed one character at a time
  expect(lines).toContain("Africa, one p");
  expect(lines).toContain("Africa, one squar");
  // and it ends on the real headline, still, with its underline
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="line"]')).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Builders across Africa, one square." })).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
});

test("the word is selected before it is replaced", async () => {
  const { container } = renderHeadline();
  await advance(1500);
  expect(container.querySelector('[data-part="sel"]')).not.toBeNull();
  expect(lastLine(container)).toBe("Africa, one platform");
  await advance(1000);
  expect(container.querySelector('[data-part="sel"]')).toBeNull();
});

test("the French edit has two people and ends on the French headline", async () => {
  const { container } = renderHeadline("fr");
  const { lines, names } = await watch(container, 8000);
  expect(names).toEqual(["Hamza · Maroc", "Kidist · Éthiopie"]);
  expect(lines[0]).toBe("une seule plateforme");
  expect(lines.at(-1)).toBe("une seule place.");
  expect(state(container)).toBeNull();
});

test("the real headline text never changes while it plays, so the layout cannot move", async () => {
  const { container } = renderHeadline();
  const realText = () => container.querySelector("h1 > span")!.textContent;
  const before = realText();
  for (let t = 0; t < 8000; t += 200) {
    await advance(200);
    expect(realText()).toBe(before);
  }
  // the layer takes no room: it is out of the flow and sits over the real text
  const css = readFileSync(join(__dirname, "hero-headline.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toMatch(/\.stage \{[^}]*position: absolute;[^}]*inset: 0;/);
  expect(css).not.toMatch(/\.real \{[^}]*(display|width|height|font|margin|padding)/);
});

test("pausing stops it at the finished headline, and it does not start again", async () => {
  const { container } = renderHeadline();
  await advance(2500);
  expect(state(container)).toBe("playing");
  act(() => setMotion(false));
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  await advance(8000);
  expect(state(container)).toBeNull();
  act(() => setMotion(true));
  await advance(8000);
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

test("playing the animation after a still start plays the edit once", async () => {
  localStorage.setItem(MOTION_KEY, "off");
  const { container } = renderHeadline();
  await advance(500);
  expect(state(container)).toBeNull();
  act(() => setMotion(true));
  const { lines } = await watch(container, 8000);
  expect(lines[0]).toBe("Africa, one platform");
  expect(state(container)).toBeNull();
});

test("it plays once: a finished edit does not play again", async () => {
  const { container, rerender } = renderHeadline();
  await watch(container, 8000);
  rerender(<HeroHeadline id="title" headline={copy.en.headline} edit={headlineEdit.en} />);
  act(() => setMotion(false));
  act(() => setMotion(true));
  await advance(8000);
  expect(state(container)).toBeNull();
});

test("it waits until the hero is on screen, showing the draft, and then plays", async () => {
  seen = false;
  const { container } = renderHeadline();
  await advance(3000);
  expect(state(container)).toBe("playing");
  expect(lastLine(container)).toBe("Africa, one platform");
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  intersect(true);
  await advance(1000);
  expect(container.querySelector('[data-part="caret"]')).not.toBeNull();
  await advance(8000);
  expect(state(container)).toBeNull();
});

test("a draft word that does not fit the text box is skipped, with every step before it", async () => {
  room = 185; // "Africa, one platform" is 200px, "Africa, one place" 170px, "Africa, one square" 180px
  const { container } = renderHeadline();
  const { lines, names } = await watch(container, 8000);
  expect(lines[0]).toBe("Africa, one place");
  expect(lines).not.toContain("Africa, one platform");
  expect(names).toEqual(["Thandiwe · South Africa", "Ọmọlará · Nigeria"]);
  expect(state(container)).toBeNull();
});

test("a browser that cannot measure the lines keeps the plain headline", async () => {
  // @ts-expect-error no measuring
  delete Range.prototype.getClientRects;
  const { container } = renderHeadline();
  await advance(8000);
  expect(state(container)).toBeNull();
  expect(container.querySelector('[data-part="caret"]')).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Builders across Africa, one square." })).toBeTruthy();
});

test("a browser without animations keeps the plain headline", async () => {
  // @ts-expect-error no animations
  delete Element.prototype.animate;
  const { container } = renderHeadline();
  await advance(8000);
  expect(state(container)).toBeNull();
});

test("leaving the page stops every timer", async () => {
  const { container, unmount } = renderHeadline();
  await advance(2500);
  expect(container.querySelector('[data-part="caret"]')).not.toBeNull();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
