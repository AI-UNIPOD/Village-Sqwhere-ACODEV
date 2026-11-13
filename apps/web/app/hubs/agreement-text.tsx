import type { ReactNode } from "react";

type Block = { kind: "heading"; level: 1 | 2 | 3; text: string } | { kind: "list"; items: string[] } | { kind: "text"; text: string };

// Splits the agreement's Markdown into headings, lists and paragraphs. Nothing else is read:
// bold marks, links and any HTML stay as the characters they are, so the page shows exactly
// the text that is signed and can never run markup from it.
export function blocksOf(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "text", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const line of body.split(/\r?\n/).map((raw) => raw.trim())) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    } else if (item) {
      flush();
      const last = blocks.at(-1);
      if (last?.kind === "list") last.items.push(item[1]);
      else blocks.push({ kind: "list", items: [item[1]] });
    } else if (line === "") flush();
    else {
      // a numbered clause starts its own paragraph and keeps its number, as written
      if (/^\d+[.)]\s/.test(line)) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

// The page already has a title and a section heading above this text, so "#" starts at h3.
const HEADINGS = { 1: "h3", 2: "h4", 3: "h5" } as const;

export function AgreementText({ body }: { body: string }): ReactNode {
  return blocksOf(body).map((block, at) => {
    if (block.kind === "heading") {
      const Heading = HEADINGS[block.level];
      return <Heading key={at}>{block.text}</Heading>;
    }
    if (block.kind === "list") {
      return (
        <ul key={at}>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }
    return <p key={at}>{block.text}</p>;
  });
}
