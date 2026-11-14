import type { Lang } from "../locales";

// How the hero's headline is edited into shape, once, when the page opens. The people are the
// landing page's made-up cast, shown with a country, as the product stores one. The headline itself stays in copy.ts.
export type HeadlineEdit = {
  /** The sentence as it first reads. Its last word is the one that gets edited. */
  draft: string;
  /**
   * Who types what, in order. The draft's last word is replaced by each step's text in turn,
   * and the last step types the full stop: the result is the headline.
   */
  steps: ReadonlyArray<{ name: string; country: string; text: string }>;
  /** The words under the Laterite underline in the finished headline. */
  underline: string;
};

export const headlineEdit: Record<Lang, HeadlineEdit> = {
  en: {
    draft: "Builders across Africa, one platform",
    steps: [
      { name: "Hamza", country: "Morocco", text: "place" },
      { name: "Thandiwe", country: "South Africa", text: "square" },
      { name: "Ọmọlará", country: "Nigeria", text: "." },
    ],
    underline: "one square",
  },
  // Needs a native French review before launch.
  fr: {
    draft: "Toute l'Afrique, une seule plateforme",
    steps: [
      { name: "Hamza", country: "Maroc", text: "place" },
      { name: "Kidist", country: "Éthiopie", text: "." },
    ],
    underline: "une seule place",
  },
};
