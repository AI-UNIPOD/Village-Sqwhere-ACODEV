import { expect, test } from "vitest";

import { BOX_H, BOX_W, CHAR_W, fitText, GUTTER, LABEL_LINE, layoutDesign, type Box, type Layout } from "./design-layout";

const pieces = (...names: string[]) => names.map((name) => ({ id: name, name }));
const link = (from: string, to: string, label = "talks to") => ({ id: `${from}-${to}`, from_piece_id: from, to_piece_id: to, label });

const box = (layout: Layout, id: string) => layout.boxes.find((found) => found.id === id)!;
const arrow = (layout: Layout, id: string) => layout.arrows.find((found) => found.id === id)!;
// the line of an arrow: its path up to the second "M", which starts the head
const line = (d: string) => {
  const numbers = d.split("M")[1].match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: numbers.length / 2 }, (_, i) => ({ x: numbers[2 * i], y: numbers[2 * i + 1] }));
};
const start = (layout: Layout, id: string) => line(arrow(layout, id).d)[0];
const end = (layout: Layout, id: string) => line(arrow(layout, id).d).at(-1)!;

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (found: Box, x: number, y: number) => x > found.x && x < found.x + found.w && y > found.y && y < found.y + found.h;

// every invariant a drawing needs, for any pieces and links
function expectSound(layout: Layout, links: ReturnType<typeof link>[]) {
  for (const [i, a] of layout.boxes.entries()) {
    for (const b of layout.boxes.slice(i + 1)) expect(overlap(a, b), `${a.id} and ${b.id}`).toBe(false);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(layout.width);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y + a.h).toBeLessThanOrEqual(layout.height);
  }
  // labels in one gutter do not overlap
  const spans = layout.arrows.map(({ id, label }) => ({ id, x: label.x, top: label.lines[0].y - LABEL_LINE / 2, bottom: label.lines.at(-1)!.y + LABEL_LINE / 2 }));
  for (const [i, a] of spans.entries()) {
    for (const b of spans.slice(i + 1)) expect(a.x !== b.x || a.bottom <= b.top || b.bottom <= a.top, `labels of ${a.id} and ${b.id}`).toBe(true);
  }
  for (const { id, from_piece_id: from, to_piece_id: to } of links) {
    const a = box(layout, from);
    const b = box(layout, to);
    const first = start(layout, id);
    const last = end(layout, id);
    // each end is on the edge of its own box, between its top and bottom
    expect([a.x, a.x + a.w], id).toContain(first.x);
    expect(first.y).toBeGreaterThan(a.y);
    expect(first.y).toBeLessThan(a.y + a.h);
    expect([b.x, b.x + b.w], id).toContain(last.x);
    expect(last.y).toBeGreaterThan(b.y);
    expect(last.y).toBeLessThan(b.y + b.h);
    // the line never goes over a box
    const points = line(arrow(layout, id).d);
    const over = layout.boxes.filter((other) =>
      points.slice(1).some((to, i) =>
        Array.from({ length: 41 }, (_, step) => step / 40).some((t) => inside(other, points[i].x + (to.x - points[i].x) * t, points[i].y + (to.y - points[i].y) * t)),
      ),
    );
    expect(over.map((other) => other.id), `${id} goes over`).toEqual([]);
    // the label sits in the gutter, clear of every box
    const { x, lines } = arrow(layout, id).label;
    const reach = (Math.max(...lines.map((found) => found.text.length)) * CHAR_W.label) / 2;
    expect(lines[0].y - LABEL_LINE / 2, `${id} label is inside the picture`).toBeGreaterThanOrEqual(0);
    expect(lines.at(-1)!.y + LABEL_LINE / 2).toBeLessThanOrEqual(layout.height);
    for (const other of layout.boxes) {
      const clear = x + reach <= other.x || x - reach >= other.x + other.w || lines[0].y - LABEL_LINE / 2 >= other.y + other.h || lines.at(-1)!.y + LABEL_LINE / 2 <= other.y;
      expect(clear, `${id} label over ${other.id}`).toBe(true);
    }
  }
}

test("a chain runs left to right in one row, each arrow from a box's right edge to the next box's left edge", () => {
  const links = [link("A", "B"), link("B", "C")];
  const layout = layoutDesign(pieces("A", "B", "C"), links);
  const [a, b, c] = ["A", "B", "C"].map((id) => box(layout, id));
  expect(a.x).toBeLessThan(b.x);
  expect(b.x).toBeLessThan(c.x);
  expect([a.y, b.y, c.y]).toEqual([a.y, a.y, a.y]);
  expect(start(layout, "A-B").x).toBe(a.x + BOX_W);
  expect(end(layout, "A-B").x).toBe(b.x);
  expect(start(layout, "B-C").x).toBe(b.x + BOX_W);
  expect(end(layout, "B-C").x).toBe(c.x);
  expectSound(layout, links);
});

test("pieces nothing points to are on the left, whatever the order they were made in", () => {
  const layout = layoutDesign(pieces("Ledger", "Worker", "Api"), [link("Api", "Worker"), link("Worker", "Ledger")]);
  expect(box(layout, "Api").x).toBeLessThan(box(layout, "Worker").x);
  expect(box(layout, "Worker").x).toBeLessThan(box(layout, "Ledger").x);
});

test("a fan-out stacks the targets in one column, in the order of the pieces, level with nothing else", () => {
  const links = [link("A", "B"), link("A", "C"), link("A", "D")];
  const layout = layoutDesign(pieces("A", "B", "C", "D"), links);
  const [b, c, d] = ["B", "C", "D"].map((id) => box(layout, id));
  expect(b.x).toBe(c.x);
  expect(c.x).toBe(d.x);
  expect(b.y).toBeLessThan(c.y);
  expect(c.y).toBeLessThan(d.y);
  expect(box(layout, "A").x).toBeLessThan(b.x);
  // the column of one box is centred on the column of three
  expect(box(layout, "A").y + BOX_H / 2).toBe(c.y + BOX_H / 2);
  expectSound(layout, links);
});

test("a piece sits a column right of every piece that points to it", () => {
  const links = [link("A", "B"), link("B", "C"), link("A", "C")];
  const layout = layoutDesign(pieces("A", "B", "C"), links);
  expect(box(layout, "C").x).toBeGreaterThan(box(layout, "B").x);
  // the arrow that skips a column passes through an empty line in it
  expect(line(arrow(layout, "A-C").d)).toHaveLength(4);
  expectSound(layout, links);
});

test("a link each way gives two arrows that start and end at different points", () => {
  const links = [link("A", "B", "sends"), link("B", "A", "answers")];
  const layout = layoutDesign(pieces("A", "B"), links);
  const a = box(layout, "A");
  const b = box(layout, "B");
  expect(a.x).toBeLessThan(b.x);
  expect(start(layout, "A-B").x).toBe(a.x + BOX_W);
  expect(end(layout, "A-B").x).toBe(b.x);
  expect(start(layout, "B-A").x).toBe(b.x);
  expect(end(layout, "B-A").x).toBe(a.x + BOX_W);
  expect(start(layout, "A-B").y).not.toBe(end(layout, "B-A").y);
  expect(end(layout, "A-B").y).not.toBe(start(layout, "B-A").y);
  // the labels are on the two sides of their lines, so they do not meet
  const [sent, answered] = [arrow(layout, "A-B"), arrow(layout, "B-A")].map((found) => found.label.lines.map((text) => text.y));
  expect(Math.max(...sent) + LABEL_LINE / 2).toBeLessThanOrEqual(Math.min(...answered) - LABEL_LINE / 2);
  expectSound(layout, links);
});

test("a circle is broken by the order of the pieces: the first made stays on the left", () => {
  const links = [link("A", "B"), link("B", "C"), link("C", "A")];
  const layout = layoutDesign(pieces("A", "B", "C"), links);
  expect(box(layout, "A").x).toBeLessThan(box(layout, "B").x);
  expect(box(layout, "B").x).toBeLessThan(box(layout, "C").x);
  // the link that closes the circle goes back from C's left edge to A's right edge, past B
  expect(start(layout, "C-A").x).toBe(box(layout, "C").x);
  expect(end(layout, "C-A").x).toBe(box(layout, "A").x + BOX_W);
  expectSound(layout, links);

  const reversed = layoutDesign(pieces("C", "B", "A"), links);
  expect(box(reversed, "C").x).toBeLessThan(box(reversed, "A").x);
  expect(box(reversed, "A").x).toBeLessThan(box(reversed, "B").x);
});

test("30 pieces and 60 links, with circles all through them, are laid out without overlaps or arrows over boxes", () => {
  const names = Array.from({ length: 30 }, (_, i) => `Piece ${i + 1} with a long name that has to be cut`);
  const links = names.flatMap((name, i) => [link(name, names[(i + 1) % 30], "a long label that has to be cut"), link(name, names[(i + 7) % 30], "x")]);
  expect(links).toHaveLength(60);
  const layout = layoutDesign(pieces(...names), links);
  expect(layout.boxes).toHaveLength(30);
  expect(layout.arrows).toHaveLength(60);
  expectSound(layout, links);
});

test("a link to itself or to a piece that is not there is left out", () => {
  const layout = layoutDesign(pieces("A", "B"), [link("A", "A"), link("A", "Gone"), link("A", "B")]);
  expect(layout.arrows.map((found) => found.id)).toEqual(["A-B"]);
});

test("a piece with no links is a box of its own, and the picture is as wide as its columns", () => {
  const layout = layoutDesign(pieces("A", "B", "C"), [link("A", "B")]);
  expect(box(layout, "C").x).toBe(box(layout, "A").x);
  expect(layout.width).toBeGreaterThan(2 * BOX_W + GUTTER);
  expect(layout.arrows).toHaveLength(1);
});

test("a name is wrapped onto two lines at most, a long word is broken and the rest ends with an ellipsis", () => {
  const layout = layoutDesign(pieces("Mobile app", "Payments reconciliation and settlement service for every branch", "A".repeat(80)), []);
  expect(box(layout, "Mobile app").lines.map((found) => found.text)).toEqual(["Mobile app"]);
  const long = box(layout, "Payments reconciliation and settlement service for every branch");
  expect(long.lines).toHaveLength(2);
  expect(long.lines[1].text.endsWith("…")).toBe(true);
  expect(long.lines[0].y).toBeLessThan(long.lines[1].y);
  const word = box(layout, "A".repeat(80));
  expect(word.lines).toHaveLength(2);
  for (const { text } of [...long.lines, ...word.lines]) expect(text.length * CHAR_W.name).toBeLessThanOrEqual(BOX_W);
});

test("fitText keeps short text as it is, wraps at spaces and cuts what does not fit", () => {
  expect(fitText("approves a batch", 21, 1)).toEqual(["approves a batch"]);
  expect(fitText("  spaced   out  ", 21, 1)).toEqual(["spaced out"]);
  expect(fitText("returns the status of every batch", 21, 1)).toEqual(["returns the status o…"]);
  expect(fitText("approves a batch", 12, 2)).toEqual(["approves a", "batch"]);
  expect(fitText("", 21, 1)).toEqual([]);
});
