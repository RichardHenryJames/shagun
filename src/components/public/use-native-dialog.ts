"use client";

import { useCallback, useEffect, useRef, type MouseEvent } from "react";

/** Native modal/Escape semantics plus explicit Tab wrapping; restore the invoking control. */
export function useNativeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const overflowRef = useRef<string | null>(null);

  const restoreFocus = useCallback(() => {
    if (overflowRef.current !== null) {
      document.body.style.overflow = overflowRef.current;
      overflowRef.current = null;
    }
    if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    openerRef.current = null;
  }, []);

  const openDialog = useCallback((opener?: HTMLElement) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    overflowRef.current = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>("[data-dialog-focus]")?.focus();
  }, []);

  const closeDialog = useCallback(() => { dialogRef.current?.close(); }, []);
  const dismissBackdrop = useCallback((event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
  }, [closeDialog]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const containTab = (event: KeyboardEvent) => {
      if (!dialog.open || event.key !== "Tab") return;
      // Some browsers allow native-dialog Tab navigation to reach browser chrome.
      // Recompute after slide/form updates rather than keeping stale focus targets.
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]',
      )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
      if (!controls.length) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[next].focus();
    };
    dialog.addEventListener("keydown", containTab);
    return () => { dialog.removeEventListener("keydown", containTab); restoreFocus(); };
  }, [restoreFocus]);
  return { dialogRef, openDialog, closeDialog, restoreFocus, dismissBackdrop };
}