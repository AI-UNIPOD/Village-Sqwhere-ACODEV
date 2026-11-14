// Where the boxes and arrows of a hub's design sketch go, worked out from the links alone, in the
// drawing's own coordinate space. Nothing is saved: the same pieces and links give the same layout.

export const BOX_W = 120;
export const BOX_H = 60;
export const GAP = 24;
export const GUTTER = 120;
// room around the drawing for the heads of arrows and the labels
export const MARGIN = 20;
export const NAME_LINE = 20;
export const LABEL_LINE = 14;
// the font sizes of the box names and the arrow labels, in the drawing's own units
export const NAME_SIZE = 15;
export const LABEL_SIZE = 12;
const TEXT_PAD = 6;
const HEAD = 8;
const HEAD_SPREAD = 0.5;
const LABEL_GAP = 5;
// what a label leaves free of the gutter it sits in, across both sides
const LABEL_ROOM = 8;
// how far from a label an arrow may run before the two could be taken for one another
const LABEL_CLEAR = 1.5;

export type Point = { x: number; y: number };
export type Box = { id: string; x: number; y: number; w: number; h: number; lines: { text: string; y: number }[] };
export type Arrow = { id: string; d: string; label: { x: number; patch: { x: number; y: number; w: number; h: number }; lines: { text: string; y: number }[] } };
export type Layout = { width: number; height: number; boxes: Box[]; arrows: Arrow[] };

// The width of each letter of the drawing's font (Onest) in em, as Chrome draws it: a to z, then
// A to Z. Digits and punctuation are in OTHER; any other character is treated as a wide one.
const LOWER = [0.56, 0.62, 0.56, 0.62, 0.57, 0.38, 0.62, 0.6, 0.24, 0.26, 0.55, 0.24, 0.84, 0.6, 0.6, 0.62, 0.62, 0.39, 0.51, 0.37, 0.58, 0.55, 0.86, 0.55, 0.61, 0.51];
const UPPER = [0.7, 0.67, 0.71, 0.73, 0.62, 0.6, 0.73, 0.74, 0.28, 0.58, 0.66, 0.59, 0.89, 0.76, 0.77, 0.65, 0.77, 0.68, 0.66, 0.59, 0.73, 0.7, 1, 0.64, 0.66, 0.61];
const OTHER: Record<string, number> = { " ": 0.28, ".": 0.27, ",": 0.29, ":": 0.28, ";": 0.29, "'": 0.24, "(": 0.34, ")": 0.34, "-": 0.46, "/": 0.5, "&": 0.7, "@": 0.99, "%": 0.86, "…": 0.74 };
// a fallback font or another rendering is a little wider, so the estimate keeps some room
const SPARE = 1.06;

// How wide `text` is at `size`. Nothing here can measure the real text, so the text is cut by this
// estimate to keep it inside its box.
export function textWidth(text: string, size: number): number {
  let em = 0;
  for (const letter of text) {
    const code = letter.codePointAt(0)!;
    if (code >= 97 && code <= 122) em += LOWER[code - 97];
    else if (code >= 65 && code <= 90) em += UPPER[code - 65];
    else if (code >= 48 && code <= 57) em += 0.66;
    else if (letter in OTHER) em += OTHER[letter];
    else if (code > 0x24f) em += 1.2;
    else em += letter === letter.toUpperCase() ? 0.8 : 0.62;
  }
  return em * size * SPARE;
}

// `text` on at most `maxLines` lines no wider than `width` at `size`: broken at spaces, a word
// longer than a line broken in the word, and the last line ended with an ellipsis when the text is longer.
export function fitText(text: string, width: number, size: number, maxLines: number): string[] {
  const wide = (line: string) => textWidth(line, size);
  const chunks = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const pieces: string[] = [];
      let piece = "";
      for (const letter of word) {
        if (piece && wide(piece + letter) > width) {
          pieces.push(piece);
          piece = "";
        }
        piece += letter;
      }
      return [...pieces, piece];
    });
  const lines: string[] = [];
  for (const chunk of chunks) {
    const last = lines.length - 1;
    if (last >= 0 && wide(`${lines[last]} ${chunk}`) <= width) lines[last] += ` ${chunk}`;
    else lines.push(chunk);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const line = [...kept[maxLines - 1]];
  while (line.length > 1 && wide(`${line.join("")}…`) > width) line.pop();
  kept[maxLines - 1] = `${line.join("").trimEnd()}…`;
  return kept;
}

const round = (value: number) => Math.round(value * 10) / 10;
const at = ({ x, y }: Point) => `${round(x)} ${round(y)}`;

// The pieces in the order they were made, and the links between them. Pieces that nothing points
// to sit in the first column and a piece sits a column to the right of every piece that points to
// it. A link that would close a circle is not counted when placing the columns (the piece made
// first stays further left) and is drawn going back to the left. Each column is stacked top to
// bottom in the pieces' order. An arrow that crosses a column on its way passes through an
// empty line in that column, so it never goes over a box.
export function layoutDesign(
  pieces: { id: string; name: string }[],
  links: { id: string; from_piece_id: string; to_piece_id: string; label: string }[],
): Layout {
  const index = new Map(pieces.map((piece, i) => [piece.id, i]));
  const edges = links.flatMap((link) => {
    const from = index.get(link.from_piece_id);
    const to = index.get(link.to_piece_id);
    return from === undefined || to === undefined || from === to ? [] : [{ id: link.id, label: link.label, from, to }];
  });

  // the links that point back to a piece still being visited close a circle
  const leaving = pieces.map((): number[] => []);
  edges.forEach((edge, k) => leaving[edge.from].push(k));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const closing = new Set<number>();
  const visit = (piece: number) => {
    visiting.add(piece);
    visited.add(piece);
    for (const k of leaving[piece]) {
      const next = edges[k].to;
      if (visiting.has(next)) closing.add(k);
      else if (!visited.has(next)) visit(next);
    }
    visiting.delete(piece);
  };
  pieces.forEach((_, i) => visited.has(i) || visit(i));

  const column: number[] = [];
  const columnOf = (piece: number): number => {
    if (column[piece] === undefined) {
      const before = edges.flatMap((edge, k) => (edge.to === piece && !closing.has(k) ? [columnOf(edge.from)] : []));
      column[piece] = Math.max(-1, ...before) + 1;
    }
    return column[piece];
  };
  pieces.forEach((_, i) => columnOf(i));
  const columns = Math.max(0, ...column) + 1;

  // how an arrow travels: to the right or the left, and the columns it crosses on the way
  const routes = edges.map((edge) => {
    const dir = Math.sign(column[edge.to] - column[edge.from]);
    const across: number[] = [];
    for (let c = column[edge.from] + dir; c !== column[edge.to]; c += dir) across.push(c);
    return { dir, across };
  });

  // a column holds its pieces, then one empty line for each arrow that crosses it
  const stacks: ({ piece: number } | { arrow: number })[][] = Array.from({ length: columns }, () => []);
  pieces.forEach((_, i) => stacks[column[i]].push({ piece: i }));
  routes.forEach(({ across }, k) => across.forEach((c) => stacks[c].push({ arrow: k })));
  const heights = stacks.map((stack) => stack.filter((slot) => "piece" in slot).length * BOX_H + (stack.length - 1) * GAP);
  const tallest = Math.max(...heights);

  const left = (c: number) => MARGIN + c * (BOX_W + GUTTER);
  const top: number[] = [];
  const lane = new Map<string, number>();
  stacks.forEach((stack, c) => {
    let y = MARGIN + (tallest - heights[c]) / 2;
    for (const slot of stack) {
      if ("piece" in slot) {
        top[slot.piece] = y;
        y += BOX_H + GAP;
      } else {
        lane.set(`${slot.arrow}/${c}`, y);
        y += GAP;
      }
    }
  });
  const middle = (piece: number) => top[piece] + BOX_H / 2;

  // Arrows meet a box on its left or right edge. Those on one edge are spread along it, in the
  // order of where they go, so two links between the same pieces never share a line.
  type Meeting = { piece: number; arrow: number; end: "from" | "to"; other: number };
  const edgesOf = new Map<string, Meeting[]>();
  const meet = (side: "left" | "right", found: Meeting) => {
    const key = `${found.piece}${side}`;
    edgesOf.set(key, [...(edgesOf.get(key) ?? []), found]);
  };
  edges.forEach((edge, k) => {
    const { dir, across } = routes[k];
    const next = across.length ? lane.get(`${k}/${across[0]}`)! : middle(edge.to);
    const previous = across.length ? lane.get(`${k}/${across[across.length - 1]}`)! : middle(edge.from);
    meet(dir > 0 ? "right" : "left", { piece: edge.from, arrow: k, end: "from", other: next });
    meet(dir > 0 ? "left" : "right", { piece: edge.to, arrow: k, end: "to", other: previous });
  });
  const meetingY = new Map<string, number>();
  for (const found of edgesOf.values()) {
    found
      .sort((a, b) => a.other - b.other || a.arrow - b.arrow)
      .forEach(({ piece, arrow, end }, i) => meetingY.set(`${arrow}${end}`, top[piece] + (BOX_H * (i + 1)) / (found.length + 1)));
  }

  // the lines first: each arrow's path, and its head
  const paths = edges.map((edge, k) => {
    const { dir, across } = routes[k];
    const points: Point[] = [{ x: left(column[edge.from]) + (dir > 0 ? BOX_W : 0), y: meetingY.get(`${k}from`)! }];
    for (const c of across) {
      const sides = [left(c), left(c) + BOX_W];
      for (const x of dir > 0 ? sides : sides.reverse()) points.push({ x, y: lane.get(`${k}/${c}`)! });
    }
    points.push({ x: left(column[edge.to]) + (dir > 0 ? 0 : BOX_W), y: meetingY.get(`${k}to`)! });
    const [from, to] = points.slice(-2);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const wing = (turn: number): Point => ({ x: to.x - HEAD * Math.cos(angle + turn), y: to.y - HEAD * Math.sin(angle + turn) });
    return { points, head: [wing(HEAD_SPREAD), to, wing(-HEAD_SPREAD)], from, to, dir };
  });

  // Every place a line of any arrow passes, to keep the labels off them: a label goes beside its
  // own arrow, where no other arrow, label or edge of the picture comes near it. When the gutter
  // is too busy for that, it sits on its own arrow, on a patch that hides the line behind it.
  const height = tallest + 2 * MARGIN;
  const spots: (Point & { arrow: number })[] = [];
  paths.forEach(({ points, head }, arrow) => {
    for (const run of [points, head]) {
      run.slice(1).forEach((to, i) => {
        const from = run[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3));
        for (let step = 0; step <= steps; step++) spots.push({ arrow, x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
      });
    }
  });
  type Area = { x0: number; x1: number; y0: number; y1: number };
  const placed: Area[] = [];
  const arrows = edges.map((edge, k): Arrow => {
    const { points, head, from, to, dir } = paths[k];
    const words = fitText(edge.label, GUTTER - LABEL_ROOM, LABEL_SIZE, 2);
    const w = Math.max(0, ...words.map((text) => textWidth(text, LABEL_SIZE)));
    const h = words.length * LABEL_LINE;
    const lineAt = (x: number) => from.y + ((x - from.x) * (to.y - from.y)) / (to.x - from.x);
    const gutterLeft = Math.min(from.x, to.x) + 2 + w / 2;
    const gutterRight = Math.max(gutterLeft, Math.max(from.x, to.x) - 2 - w / 2);
    // beside the middle of the last stretch (above it for an arrow going right, below it for one
    // coming back), else further along it or on its other side, else on it: the first clear spot
    let best: { area: Area; x: number; bad: number } | undefined;
    search: for (const place of ["beside", "on"] as const) {
      for (const t of [0.5, 0.38, 0.62, 0.25, 0.75, 0.12, 0.88]) {
        for (const above of dir > 0 ? [true, false] : [false, true]) {
          if (place === "on" && !above) continue;
          const x = Math.min(Math.max(from.x + t * (to.x - from.x), gutterLeft), gutterRight);
          const near = [lineAt(x - w / 2), lineAt(x + w / 2)];
          const y0 = place === "on" ? lineAt(x) - h / 2 : above ? Math.min(...near) - LABEL_GAP - h : Math.max(...near) + LABEL_GAP;
          const area = { x0: x - w / 2, x1: x + w / 2, y0, y1: y0 + h };
          const touching = spots.filter(
            (spot) =>
              (place === "beside" || spot.arrow !== k) &&
              spot.x > area.x0 - LABEL_CLEAR &&
              spot.x < area.x1 + LABEL_CLEAR &&
              spot.y > area.y0 - LABEL_CLEAR &&
              spot.y < area.y1 + LABEL_CLEAR,
          ).length;
          const crowding = placed.filter((other) => area.x0 < other.x1 && other.x0 < area.x1 && area.y0 < other.y1 && other.y0 < area.y1).length;
          const bad = touching + 1000 * crowding + (area.y0 < 0 || area.y1 > height ? 1000 : 0) + (place === "on" ? 0.5 : 0);
          if (!best || bad < best.bad) best = { area, x, bad };
          if (bad < 1) break search;
        }
      }
    }
    const { area, x } = best!;
    placed.push(area);
    const label = {
      x: round(x),
      patch: { x: round(area.x0 - LABEL_CLEAR), y: round(area.y0 - 1), w: round(area.x1 - area.x0 + 2 * LABEL_CLEAR), h: h + 2 },
      lines: words.map((text, n) => ({ text, y: round(area.y0 + LABEL_LINE / 2 + n * LABEL_LINE) })),
    };
    return { id: edge.id, d: `M${points.map(at).join("L")}M${at(head[0])}L${at(head[1])}L${at(head[2])}`, label };
  });

  const boxes = pieces.map((piece, i): Box => {
    const lines = fitText(piece.name, BOX_W - 2 * TEXT_PAD, NAME_SIZE, 2);
    return {
      id: piece.id,
      x: left(column[i]),
      y: top[i],
      w: BOX_W,
      h: BOX_H,
      lines: lines.map((text, n) => ({ text, y: middle(i) + (n - (lines.length - 1) / 2) * NAME_LINE })),
    };
  });

  return { width: left(columns - 1) + BOX_W + MARGIN, height, boxes, arrows };
}
