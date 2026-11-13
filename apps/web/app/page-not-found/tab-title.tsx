"use client";

import { useEffect } from "react";

// Sets the tab title of a not-found page to the document's language, once the page is running.
// The document for an unmatched address is sent with the English title; its early script puts
// the right one there, and React puts the English one back when it takes over. The page drawn
// after notFound() gets no title from the server at all.
export function TabTitle({ titles }: { titles: Record<string, string> }) {
  useEffect(() => {
    const title = titles[document.documentElement.lang];
    if (title) document.title = title;
  }, [titles]);
  return null;
}
