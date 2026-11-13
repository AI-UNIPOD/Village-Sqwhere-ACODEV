import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);

function ask(props: { open?: boolean; busy?: boolean; danger?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open={props.open ?? true}
      title="Leave this hub?"
      confirm="Leave hub"
      cancel="Stay"
      busy={props.busy}
      danger={props.danger}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>Your team keeps the work.</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

test("it asks the question, says what will happen and names both answers", () => {
  ask();
  const dialog = screen.getByRole("dialog", { name: "Leave this hub?" });
  expect(dialog.textContent).toContain("Your team keeps the work.");
  expect(screen.getByRole("button", { name: "Leave hub" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Stay" })).toBeTruthy();
});

test("each button answers once", () => {
  const { onConfirm, onCancel } = ask();
  fireEvent.click(screen.getByRole("button", { name: "Leave hub" }));
  expect(onConfirm).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

test("while the action is being sent, the confirm button keeps its label and ignores presses", () => {
  const { onConfirm } = ask({ busy: true });
  const confirm = screen.getByRole("button", { name: "Leave hub" });
  expect(confirm.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("closed, it shows nothing", () => {
  ask({ open: false });
  expect(screen.queryByRole("dialog")).toBeNull();
});
