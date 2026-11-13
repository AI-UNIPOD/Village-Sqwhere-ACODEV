"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./confirm-dialog.module.css";
import landing from "./landing/landing-page.module.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** What will happen, in a sentence or two. */
  children: ReactNode;
  confirm: string;
  cancel: string;
  /** The action deletes or ends something: the confirm button takes the danger style. */
  danger?: boolean;
  /** The action is being sent: the confirm button keeps its label and ignores presses. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Asks before an action that cannot be undone (docs/design-system/components.md, Dialogs). A
// native <dialog>: Escape closes it, focus is held inside and goes back to the button that
// opened it.
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, title, children, confirm, cancel, danger, busy, onConfirm, onCancel } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open === open) return;
    // a browser without the dialog methods still shows and hides it, in the page
    if (open && element.showModal) element.showModal();
    else if (!open && element.close) element.close();
    else element.toggleAttribute("open", open);
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onClose={() => open && onCancel()}
    >
      <h2 id={`${id}-title`} className={styles.title}>
        {title}
      </h2>
      <div id={`${id}-text`} className={styles.text}>
        {children}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={danger ? `${landing.ghost} ${styles.danger}` : landing.btn}
          aria-busy={busy || undefined}
          onClick={() => !busy && onConfirm()}
        >
          {confirm}
        </button>
        <button type="button" className={landing.ghost} onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </dialog>
  );
}
