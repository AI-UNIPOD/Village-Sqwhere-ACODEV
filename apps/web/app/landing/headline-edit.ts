import { parseSeconds } from "./gather";
import type { HeadlineEdit } from "./hero-headline-copy";

// The hero headline, edited into shape by the landing page's made-up cast: one person selects
// the last word and types a better one, the next does the same, the last types the full stop,
// and one Laterite underline is drawn. This file builds the animated layer over the real
// headline and runs it. The real headline stays in the flow, unchanged, so nothing moves.

// the beats of the approved preview (headline A, "Edited into shape"), in ms
const BEAT = {
  pre: 400, // the draft stands alone
  fade: 400, // the first person arrives
  cross: 300, // one person hands over to the next
  sweep: 650, // the selection sweeps right to left
  hold: 250, // the selected word rests
  char: 55, // one typed character
  tagsOut: 400, // the names leave together
} as const;
const MOMENT_FALLBACK = 520; // --dur-moment

type Caret = { el: HTMLElement; tag: HTMLElement };

export type Edit = {
  /** Plays the beats once and resolves when the last one is done. Never rejects. */
  run: () => Promise<void>;
  /** Stops everything and removes the layer, so only the real headline is left. */
  stop: () => void;
};

/**
 * The words of the rendered headline, grouped by the line they sit on. Null when the browser
 * cannot say, which leaves the headline as plain text.
 */
function readLines(root: HTMLElement): string[][] | null {
  try {
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const words: Array<{ text: string; top: number }> = [];
    let touching = false; // the last text ended with a letter, so the next one starts the same word
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      for (const match of node.data.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getClientRects()[0];
        if (!rect) return null;
        if (match.index === 0 && touching && words.length) words[words.length - 1].text += match[0];
        else words.push({ text: match[0], top: rect.top });
      }
      if (node.data) touching = /\S$/.test(node.data);
    }
    const lines: string[][] = [];
    let top = Number.NaN;
    for (const word of words) {
      if (!lines.length || Math.abs(word.top - top) > 2) {
        lines.push([]);
        top = word.top;
      }
      lines[lines.length - 1].push(word.text);
    }
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

function part(name: string): HTMLElement {
  const node = document.createElement("span");
  node.dataset.part = name;
  return node;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Builds the layer over `real`, the headline as it is rendered, inside `stage`. The layer
 * repeats the real lines one by one (so a longer or shorter draft word never re-wraps) and
 * only the last line changes. Returns null when it cannot be done: no animation support, a
 * browser that cannot measure the lines, or copy that does not add up to the headline.
 *
 * The room the layer may use is the hero's text box (`h1.parentElement`) and as much again as
 * its padding on each side: a longer draft word goes a little past the real lines, never into the
 * square or off the screen. A word that would need more is skipped, and so is every step before
 * the first one that fits: the animation then starts from that word.
 */
export function createEdit(
  h1: HTMLElement,
  real: HTMLElement,
  stage: HTMLElement,
  headline: string,
  edit: HeadlineEdit,
): Edit | null {
  if (typeof h1.animate !== "function") return null;
  const lines = readLines(real);
  const full = edit.steps[edit.steps.length - 1]?.text; // the full stop
  if (!lines || !full || !headline.endsWith(full)) return null;
  const lastWords = lines[lines.length - 1];
  const lastToken = lastWords[lastWords.length - 1];
  if (!lastToken.endsWith(full)) return null;
  const lead = lastWords.length > 1 ? `${lastWords.slice(0, -1).join(" ")} ` : "";
  // the word in the last place after each step: the draft's, then each typed word
  const states = [
    edit.draft.slice(edit.draft.lastIndexOf(" ") + 1),
    ...edit.steps.slice(0, -1).map((step) => step.text),
  ];
  if (states[states.length - 1] !== lastToken.slice(0, -full.length)) return null;

  const [sels, linesLayer, rules, carets] = ["sels", "lines", "rules", "carets"].map(part);
  stage.replaceChildren(sels, linesLayer, rules, carets);
  const frame = h1.getBoundingClientRect();
  const lineHeight = frame.height / lines.length;
  const lineTop = (lines.length - 1) * lineHeight;
  lines.forEach((words, i) => {
    const line = part("line");
    line.style.cssText = `top:${i * lineHeight}px;height:${lineHeight}px`;
    if (i < lines.length - 1) line.textContent = words.join(" ");
    linesLayer.append(line);
  });
  const content = part("content");
  const slot = part("slot");
  const dot = part("dot");
  content.append(lead, slot, dot);
  linesLayer.lastElementChild?.append(content);

  // the first word state that fits, with every later one
  const room = () => {
    const box = (h1.parentElement ?? h1).getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(h1.parentElement ?? h1).paddingLeft) || 0;
    return { left: box.left - pad, right: box.right + pad };
  };
  const limits = room();
  const fits = states.map((word) => {
    slot.textContent = word;
    const box = content.getBoundingClientRect();
    return box.left >= limits.left - 0.5 && box.right <= limits.right + 0.5;
  });
  const start = fits.lastIndexOf(false) + 1;
  if (start >= states.length) {
    stage.replaceChildren();
    return null;
  }
  slot.textContent = states[start];
  const steps = edit.steps.slice(start);

  // the underline: one bar for each line the underlined words sit on
  const bars: HTMLElement[] = [];
  try {
    const range = document.createRange();
    for (const mark of real.querySelectorAll("[data-mark]")) {
      range.selectNodeContents(mark);
      for (const rect of range.getClientRects()) {
        const bar = part("rule");
        bar.style.cssText = `left:${rect.left - frame.left}px;top:${rect.bottom - frame.top}px;width:${rect.width}px`;
        rules.append(bar);
        bars.push(bar);
      }
    }
  } catch {
    // no measuring: the real headline's own underline shows when the layer goes
  }

  const strong = token("--ease-strong") || "ease-out";
  const out = token("--ease-out") || "ease-out";
  const moment = (parseSeconds(token("--dur-moment")) ?? MOMENT_FALLBACK / 1000) * 1000;
  const pad = 0.06 * (parseFloat(getComputedStyle(h1).fontSize) || 0);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const animations: Animation[] = [];
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        timers.delete(id);
        resolve();
      }, ms);
      timers.add(id);
    });
  const animate = (target: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = target.animate(keyframes, { fill: "forwards", ...options });
    animations.push(animation);
    return animation;
  };
  const fade = (p: Caret, from: number, to: number, duration: number) =>
    animate(p.el, [{ opacity: from }, { opacity: to }], { duration, easing: out });

  // where an element sits across, from the headline's left edge
  const across = (node: HTMLElement) => {
    const origin = h1.getBoundingClientRect().left;
    const box = node.getBoundingClientRect();
    return { left: box.left - origin, right: box.right - origin };
  };
  const move = (x: number) => `translate(${x}px,${lineTop}px)`;
  // a name tag slides left when it would pass the room the layer has, so it is never cut
  const tagShift = (p: Caret, x: number) => {
    const origin = h1.getBoundingClientRect().left;
    const { left, right } = room();
    const shift = Math.max(left - origin - x, Math.min(0, right - origin - p.tag.offsetWidth - x));
    return `translateX(${shift}px)`;
  };
  const place = (p: Caret, x: number) => {
    p.el.style.transform = move(x);
    p.tag.style.transform = tagShift(p, x);
  };

  function arrive(step: { name: string; city: string }): Caret {
    const el = part("caret");
    const tag = part("tag");
    tag.textContent = `${step.name} · ${step.city}`;
    el.append(part("bar"), tag);
    carets.append(el);
    return { el, tag };
  }

  // the highlight and the caret sweep over the slot's word, right to left
  function select(p: Caret) {
    const { left, right } = across(slot);
    const sel = part("sel");
    sel.style.cssText = `left:${left - pad}px;top:calc(${lineTop}px + 0.04em);width:${right - left + 2 * pad}px`;
    sels.append(sel);
    const sweep = { duration: BEAT.sweep, easing: strong };
    const moves = [
      animate(sel, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], sweep),
      animate(p.el, [{ transform: move(right) }, { transform: move(left - pad) }], sweep),
      animate(p.tag, [{ transform: tagShift(p, right) }, { transform: tagShift(p, left - pad) }], sweep),
    ];
    return () => {
      moves.forEach((m) => m.cancel());
      sel.remove();
    };
  }

  async function type(p: Caret, target: HTMLElement, text: string) {
    for (let i = 1; i <= text.length; i++) {
      target.textContent = text.slice(0, i);
      place(p, across(target).right);
      await wait(BEAT.char);
    }
  }

  async function play() {
    await wait(BEAT.pre);
    let current: Caret | null = null;
    for (const [i, step] of steps.entries()) {
      const last = i === steps.length - 1;
      const next = arrive(step);
      place(next, across(slot).right);
      if (!current) {
        fade(next, 0, 1, BEAT.fade);
        await wait(BEAT.fade + 350);
      } else {
        fade(current, 1, 0, BEAT.cross);
        fade(next, 0, 1, BEAT.cross);
        await wait(BEAT.cross + (last ? 150 : 300));
        current.el.remove();
      }
      current = next;
      if (last) {
        await type(next, dot, step.text);
        await wait(450);
      } else {
        const release = select(next);
        await wait(BEAT.sweep + BEAT.hold);
        release();
        slot.textContent = "";
        place(next, across(slot).right);
        await type(next, slot, step.text);
        await wait(150);
      }
    }
    // the one Laterite moment, drawn bar after bar, while the names leave together
    const total = bars.reduce((n, bar) => n + parseFloat(bar.style.width), 0) || 1;
    let delay = 0;
    for (const bar of bars) {
      const duration = (moment * parseFloat(bar.style.width)) / total;
      animate(bar, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration, delay, easing: out });
      delay += duration;
    }
    if (current) fade(current, 1, 0, BEAT.tagsOut);
    await wait(Math.max(moment, BEAT.tagsOut) + 60);
  }

  return {
    run: async () => {
      try {
        await play();
      } catch {
        // a failure ends the show; the caller then leaves the finished headline
      }
    },
    stop: () => {
      timers.forEach(clearTimeout);
      timers.clear();
      animations.forEach((animation) => animation.cancel());
      stage.replaceChildren();
    },
  };
}
