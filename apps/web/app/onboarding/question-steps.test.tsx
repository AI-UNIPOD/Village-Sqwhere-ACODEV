import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { Lang } from "../locales";
import { CountryStep } from "./question-steps";
import { NO_ANSWERS, type Answers } from "./steps";

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

// The page keeps the answers; this stands in for it so a click really chooses a country.
function CountryStepWithAnswers({ lang }: { lang: Lang }) {
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  return (
    <CountryStep
      lang={lang}
      answers={answers}
      update={(patch) => setAnswers({ ...answers, ...patch })}
      error={false}
    />
  );
}

test.each([
  { lang: "en" as const, filter: "Filter countries", nigeria: "Nigeria", line: "Selected: Nigeria" },
  { lang: "fr" as const, filter: "Filtrer les pays", nigeria: "Nigeria", line: "Sélection: Nigeria" },
])("a chosen country stays shown when the filter hides it ($lang)", (t) => {
  render(<CountryStepWithAnswers lang={t.lang} />);
  expect(screen.queryByText(t.line)).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: t.nigeria }));
  fireEvent.change(screen.getByLabelText(t.filter), { target: { value: "ken" } });

  expect(screen.queryByRole("radio", { name: t.nigeria })).toBeNull();
  const status = screen.getByRole("status");
  expect(status.textContent).toBe(t.line);
});
