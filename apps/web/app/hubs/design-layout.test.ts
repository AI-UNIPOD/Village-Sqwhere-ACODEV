import { expect, test } from "vitest";

import { BOX_H, BOX_W, fitText, GUTTER, LABEL_LINE, LABEL_SIZE, layoutDesign, NAME_SIZE, textWidth, type Box, type Layout } from "./design-layout";

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
// the room a label takes, and the places a line of any arrow other than `id` passes through it
const room = (label: Layout["arrows"][number]["label"]) => {
  const w = Math.max(...label.lines.map((found) => textWidth(found.text, LABEL_SIZE)));
  return { x0: label.x - w / 2, x1: label.x + w / 2, y0: label.lines[0].y - LABEL_LINE / 2, y1: label.lines.at(-1)!.y + LABEL_LINE / 2 };
};
function struckBy(layout: Layout, id: string) {
  const area = room(arrow(layout, id).label);
  return layout.arrows
    .filter((other) => other.id !== id)
    .filter((other) => {
      const points = line(other.d);
      return points.slice(1).some((to, i) =>
        Array.from({ length: 81 }, (_, step) => step / 80).some((t) => {
          const x = points[i].x + (to.x - points[i].x) * t;
          const y = points[i].y + (to.y - points[i].y) * t;
          return x > area.x0 && x < area.x1 && y > area.y0 && y < area.y1;
        }),
      );
    })
    .map((other) => other.id);
}
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
    const { lines } = arrow(layout, id).label;
    const reach = room(arrow(layout, id).label);
    expect(lines[0].y - LABEL_LINE / 2, `${id} label is inside the picture`).toBeGreaterThanOrEqual(0);
    expect(lines.at(-1)!.y + LABEL_LINE / 2).toBeLessThanOrEqual(layout.height);
    // and no wider than the gutter it is in
    expect(reach.x1 - reach.x0, `${id} label is as wide as its gutter`).toBeLessThanOrEqual(GUTTER);
    for (const other of layout.boxes) {
      const clear = reach.x1 <= other.x || reach.x0 >= other.x + other.w || lines[0].y - LABEL_LINE / 2 >= other.y + other.h || lines.at(-1)!.y + LABEL_LINE / 2 <= other.y;
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
  for (const { text } of [...long.lines, ...word.lines]) expect(textWidth(text, NAME_SIZE)).toBeLessThanOrEqual(BOX_W);
});

// the widest glyphs of the font are measured in the browser: 12 W take 182 units at 15px, 12 M 159
test("names of wide letters, capitals and digits are cut by their width, so they stay inside the box", () => {
  const names = ["W".repeat(12), "M".repeat(12), "m".repeat(14), "INFRASTRUCTURE", "ABCDEFGHIJKL", "0123456789012", "@@@@@@@@@@@@", "日本語日本語日本語", "Wide words WWWW MMMM"];
  const layout = layoutDesign(pieces(...names), []);
  for (const name of names) {
    const lines = box(layout, name).lines;
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const { text } of lines) expect(textWidth(text, NAME_SIZE), `${name}: ${text}`).toBeLessThanOrEqual(BOX_W - 12);
  }
  // 12 W would be 182 units wide at 15px: the estimate is at least that
  expect(textWidth("W".repeat(12), NAME_SIZE)).toBeGreaterThanOrEqual(182);
  expect(textWidth("M".repeat(12), NAME_SIZE)).toBeGreaterThanOrEqual(159);
  expect(textWidth("0123456789012", NAME_SIZE)).toBeGreaterThanOrEqual(129);
});

test("arrow labels of wide letters stay inside their gutter", () => {
  const labels = ["W".repeat(14), "MMMMMMMMMMMMMM", "a very long label made of many words that go on", "0123456789012345"];
  const links = labels.map((label, i) => ({ ...link("A", "B", label), id: `l${i}` }));
  const layout = layoutDesign(pieces("A", "B"), links);
  for (const { label } of layout.arrows) {
    for (const { text } of label.lines) expect(textWidth(text, LABEL_SIZE), text).toBeLessThanOrEqual(GUTTER - 8);
    expect(label.lines.length).toBeLessThanOrEqual(2);
  }
  expectSound(layout, links);
});

test("a label is clear of the lines of the other arrows when there is room, and of its own", () => {
  const links = [link("A", "B", "approves a batch"), link("B", "A", "returns the status"), link("B", "C", "queues transfers"), link("C", "D", "writes each result"), link("A", "D", "records the batch")];
  const layout = layoutDesign(pieces("A", "B", "C", "D"), links);
  expectSound(layout, links);
  for (const { id } of links) expect(struckBy(layout, id), `${id} is struck by`).toEqual([]);
});

test("the demo's sketch: five pieces, six links and a link back, with every text in place", () => {
  const names = ["Mobile app", "Payouts API", "Payouts worker", "Ledger database", "SMS gateway"];
  const links = [
    link("Mobile app", "Payouts API", "approves a batch"),
    link("Payouts API", "Ledger database", "records the batch"),
    link("Payouts API", "Payouts worker", "queues transfers"),
    link("Payouts worker", "Ledger database", "writes each result"),
    link("Payouts worker", "SMS gateway", "asks for a receipt"),
    link("Payouts API", "Mobile app", "returns the status"),
  ];
  const layout = layoutDesign(pieces(...names), links);
  expectSound(layout, links);
  // four columns, and the picture is not wider than a page can show at a readable size
  expect(new Set(layout.boxes.map((found) => found.x)).size).toBe(4);
  expect(layout.width).toBeLessThanOrEqual(900);
  // the busiest gutter may leave one label on a crossing, never more
  expect(links.filter(({ id }) => struckBy(layout, id).length > 0).length).toBeLessThanOrEqual(1);
});

test("fitText keeps short text as it is, wraps at spaces and cuts what does not fit", () => {
  expect(fitText("approves a batch", 120, LABEL_SIZE, 1)).toEqual(["approves a batch"]);
  expect(fitText("  spaced   out  ", 120, LABEL_SIZE, 1)).toEqual(["spaced out"]);
  const cut = fitText("returns the status of every batch", 120, LABEL_SIZE, 1);
  expect(cut).toHaveLength(1);
  expect(cut[0].endsWith("…")).toBe(true);
  expect(textWidth(cut[0], LABEL_SIZE)).toBeLessThanOrEqual(120);
  expect(fitText("approves a batch", 70, LABEL_SIZE, 2)).toEqual(["approves a", "batch"]);
  expect(fitText("", 120, LABEL_SIZE, 1)).toEqual([]);
});
