import { notFound } from "next/navigation";

import { notFoundMetadata } from "../../page-not-found/metadata";

// Every address under /en or /fr that no page matches lands here, so the 404 is shown by
// [lang]/not-found.tsx in that address's language instead of Next's default English page.
export const generateMetadata = notFoundMetadata;

// The page always 404s, so there is no instant navigation to validate.
export const instant = false;

export default function CatchAll() {
  notFound();
}
