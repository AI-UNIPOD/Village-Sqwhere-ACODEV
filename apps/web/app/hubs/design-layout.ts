// Where the boxes and arrows of a hub's design sketch go, worked out from the links alone, in the
// drawing's own coordinate space. Nothing is saved: the same pieces and links give the same layout.

export const BOX_W = 120;
export const BOX_H = 60;
export const GAP = 24;
export const GUTTER = 100;
// room around the drawing for the heads of arrows and the labels
export const MARGIN = 20;
export const NAME_LINE = 20;
export const LABEL_LINE = 14;
// What a character of the box names (15px) and of the arrow labels (12px) takes at most. The
// text is cut by counting characters, so it is never wider than its box or its gutter.
export const CHAR_W = { name: 8.5, label: 6.8 };
const TEXT_PAD = 8;
const HEAD = 8;
const HEAD_SPREAD = 0.5;
const LABEL_SPACE = 4;

export type Point = { x: number; y: number };
export type Box = { id: string; x: number; y: number; w: number; h: number; lines: { text: string; y: number }[] };
export type Arrow = { id: string; d: string; label: { x: number; lines: { text: string; y: number }[] } };
export type Layout = { width: number; height: number; boxes: Box[]; arrows: Arrow[] };

// `text` on at most `maxLines` lines of `perLine` characters: broken at spaces, a word longer
// than a line broken in the word, and the last line ended with an ellipsis when the text is longer.
export function fitText(text: string, perLine: number, maxLines: number): string[] {
  const chunks = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const letters = [...word];
      return Array.from({ length: Math.ceil(letters.length / perLine) }, (_, i) => letters.slice(i * perLine, (i + 1) * perLine).join(""));
    });
  const lines: string[] = [];
  for (const chunk of chunks) {
    const last = lines.length - 1;
    if (last >= 0 && [...lines[last]].length + 1 + [...chunk].length <= perLine) lines[last] += ` ${chunk}`;
    else lines.push(chunk);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${[...kept[maxLines - 1]].slice(0, perLine - 1).join("").trimEnd()}…`;
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

  const arrows = edges.map((edge, k): Arrow => {
    const { dir, across } = routes[k];
    const points: Point[] = [{ x: left(column[edge.from]) + (dir > 0 ? BOX_W : 0), y: meetingY.get(`${k}from`)! }];
    for (const c of across) {
      const sides = [left(c), left(c) + BOX_W];
      for (const x of dir > 0 ? sides : sides.reverse()) points.push({ x, y: lane.get(`${k}/${c}`)! });
    }
    points.push({ x: left(column[edge.to]) + (dir > 0 ? 0 : BOX_W), y: meetingY.get(`${k}to`)! });

    const [from, to] = points.slice(-2);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const wing = (turn: number) => at({ x: to.x - HEAD * Math.cos(angle + turn), y: to.y - HEAD * Math.sin(angle + turn) });
    const line = `M${points.map(at).join("L")}`;
    // The label sits beside the middle of the last stretch, in the gutter: above the line for an
    // arrow going right and below it for one coming back, so a pair of links do not share a place.
    const words = fitText(edge.label, Math.floor((GUTTER - 2 * TEXT_PAD) / CHAR_W.label), 2);
    const middle = (from.y + to.y) / 2;
    const first = (dir > 0 ? middle - LABEL_SPACE - words.length * LABEL_LINE : middle + LABEL_SPACE) + LABEL_LINE / 2;
    const label = { x: round((from.x + to.x) / 2), lines: words.map((text, n) => ({ text, y: round(first + n * LABEL_LINE) })) };
    return { id: edge.id, d: `${line}M${wing(HEAD_SPREAD)}L${at(to)}L${wing(-HEAD_SPREAD)}`, label };
  });

  // Labels in one gutter that would overlap are moved down, in their order, until they do not.
  const gutters = new Map<number, Arrow[]>();
  for (const arrow of arrows) gutters.set(arrow.label.x, [...(gutters.get(arrow.label.x) ?? []), arrow]);
  let lowest = 0;
  for (const found of gutters.values()) {
    let free = -Infinity;
    for (const { label } of found.sort((a, b) => a.label.lines[0].y - b.label.lines[0].y)) {
      const shift = Math.max(0, free - (label.lines[0].y - LABEL_LINE / 2));
      for (const line of label.lines) line.y = round(line.y + shift);
      free = label.lines.at(-1)!.y + LABEL_LINE / 2 + LABEL_SPACE;
      lowest = Math.max(lowest, free);
    }
  }

  const perLine = Math.floor((BOX_W - 2 * TEXT_PAD) / CHAR_W.name);
  const boxes = pieces.map((piece, i): Box => {
    const lines = fitText(piece.name, perLine, 2);
    return {
      id: piece.id,
      x: left(column[i]),
      y: top[i],
      w: BOX_W,
      h: BOX_H,
      lines: lines.map((text, n) => ({ text, y: middle(i) + (n - (lines.length - 1) / 2) * NAME_LINE })),
    };
  });

  return { width: left(columns - 1) + BOX_W + MARGIN, height: Math.max(tallest + MARGIN, lowest) + MARGIN, boxes, arrows };
}
