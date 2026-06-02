"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

const FADE_MS = 150;

/**
 * Sub-batch A · voice T1.5 / A2 (shared with video A4 pull-forward).
 *
 * Lightweight 2-button confirmation modal in front of the destructive
 * "End call" action. Defaults focus to **Cancel** (the safe choice for
 * destructive confirmations — reduces accidental Enter-key confirms),
 * supports Esc-to-cancel and backdrop-click-to-cancel, and adapts layout
 * for mobile (bottom sheet) vs desktop (centered overlay).
 *
 * Behavior contract:
 *   - `isOpen === false` → 150ms fade-out, then unmount (no listeners).
 *   - `isOpen === true`  → renders the dialog and:
 *       · focuses the Cancel button on mount (voice decision §1).
 *       · binds an Escape-key listener that calls `onCancel`.
 *       · clicking the backdrop calls `onCancel`.
 *   - `onConfirm` runs the parent's call-end path; the modal does NOT
 *     close itself afterward — the parent controls `isOpen`.
 *
 * Shift-click bypass lives on the trigger button upstream — this modal
 * does not need to know about it.
 */
export interface EndCallConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function EndCallConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
}: EndCallConfirmModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setRendered(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    },
    [onCancel],
  );

  if (!rendered) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={
        "fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 transition-opacity duration-150 sm:items-center sm:px-4 " +
        (visible ? "opacity-100" : "opacity-0")
      }
      data-testid="end-call-confirm-modal"
      onClick={handleBackdropClick}
    >
      <div
        className={
          "w-full rounded-t-xl bg-white p-6 shadow-2xl transition-[opacity,transform] duration-150 sm:max-w-md sm:rounded-xl " +
          (visible
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 sm:translate-y-0")
        }
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          End this call?
        </h2>
        <p id={bodyId} className="mt-2 text-sm text-gray-700">
          Are you sure you want to end the call? Your conversation will not be
          deleted.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
            data-testid="end-call-confirm-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            data-testid="end-call-confirm-modal-confirm"
          >
            End call
          </button>
        </div>
      </div>
    </div>
  );
}
