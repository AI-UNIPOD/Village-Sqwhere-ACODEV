import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { Lang } from "../locales";
import { CountryStep } from "./question-steps";
import { NO_ANSWERS } from "./steps";

afterEach(cleanup);

const showCountries = (lang: Lang) =>
  render(<CountryStep lang={lang} answers={NO_ANSWERS} update={vi.fn()} error={false} />);

test.each([
  {
    lang: "en" as const,
    filter: "Filter countries",
    title: "No match",
    sentence: 'No country matches "atlantis". Check the spelling or clear the filter.',
    clear: "Clear filter",
  },
  {
    lang: "fr" as const,
    filter: "Filtrer les pays",
    title: "Aucun résultat",
    sentence: "Aucun pays ne correspond à « atlantis ». Vérifiez l'orthographe ou effacez le filtre.",
    clear: "Effacer le filtre",
  },
])("a country filter with no match shows the empty state, and clearing it brings the list back ($lang)", (t) => {
  showCountries(t.lang);
  const filter = screen.getByLabelText(t.filter) as HTMLInputElement;
  expect(screen.getAllByRole("radio")).toHaveLength(54);

  fireEvent.change(filter, { target: { value: "atlantis" } });
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.getByRole("heading", { level: 2, name: t.title })).toBeTruthy();
  expect(screen.getByText(t.sentence)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: t.clear }));
  expect(filter.value).toBe("");
  expect(screen.getAllByRole("radio")).toHaveLength(54);
  expect(screen.queryByRole("heading", { level: 2, name: t.title })).toBeNull();
});
