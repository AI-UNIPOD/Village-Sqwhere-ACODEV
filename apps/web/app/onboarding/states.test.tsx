import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import OnboardingError from "../[lang]/onboarding/error";
import { OnboardingSkeleton } from "./onboarding-skeleton";

const route = vi.hoisted(() => ({ lang: "en" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }) }));

afterEach(cleanup);

test.each([
  ["en", "Getting your profile ready"],
  ["fr", "Préparation de votre profil"],
])("the loading screen says what is happening in %s", (lang, label) => {
  route.lang = lang;
  render(<OnboardingSkeleton />);
  expect(screen.getByRole("status").textContent).toBe(label);
});

test.each([
  ["en", "We couldn't show this page", "Try again"],
  ["fr", "Nous n'avons pas pu afficher cette page", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  route.lang = lang;
  const onRetry = vi.fn();
  render(<OnboardingError retry={onRetry} />);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});
