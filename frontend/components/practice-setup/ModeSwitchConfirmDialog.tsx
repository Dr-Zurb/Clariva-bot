"use client";

/**
 * Plan 03 · Task 12: confirmation dialog for catalog-mode switches.
 *
 * Used for both directions:
 *   - multi_service → single_fee : "snapshot + replace" semantics warning
 *   - single_fee   → multi_service : offer restore-from-backup OR start fresh
 *
 * Intentionally a thin, self-contained modal rather than a new shared primitive:
 *   - The frontend has no `AlertDialog` library; existing overlays in the
 *     practice-setup area all use a fixed / `role="dialog"` fallback pattern
 *     (see `AiSuggestionDiffModal` in `ServiceOfferingDetailDrawer.tsx` and
 *     `CatalogReviewPanel.tsx`). Mirroring that keeps the bundle small.
 *   - Consumers control all copy + actions, so the same component covers both
 *     directions without branching on mode inside.
 *
 * Accessibility:
 *   - Backdrop click / Escape dismiss via `onCancel`.
 *   - Actions are explicit `<button>`s; the primary action gets autofocus via
 *     the `primaryRef` callback so keyboard users land on the safe default
 *     (Cancel) if they press Escape.
 */

import { useEffect, useRef } from "react";

export type ModeSwitchAction = {
  /**
   * Stable React key. Optional — the dialog falls back to the list index,
   * but callers that reorder actions (e.g. restore-vs-start-fresh single→multi
   * flow) should provide one so button state doesn't cross-wire on re-render.
   */
  id?: string;
  label: string;
  onClick: () => void;
  /** `primary` gets the blue button; `danger` gets red; `secondary` is outlined. */
  variant: "primary" | "danger" | "secondary";
  disabled?: boolean;
  testId?: string;
};

type Props = {
  open: boolean;
  title: string;
  /** Multi-paragraph body. Rendered as `<p>` elements to preserve spacing. */
  body: string | string[];
  /** Cancel label; defaults to "Cancel". */
  cancelLabel?: string;
  onCancel: () => void;
  /** Primary / confirm actions, rendered right-to-left inside the footer. */
  actions: ModeSwitchAction[];
  /** Lock all actions while a PATCH is in flight. */
  busy?: boolean;
};

export function ModeSwitchConfirmDialog({
  open,
  title,
  body,
  cancelLabel = "Cancel",
  onCancel,
  actions,
  busy = false,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus Cancel by default — never start focus on a destructive primary.
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const paragraphs = Array.isArray(body) ? body : [body];

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 px-3"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-switch-dialog-title"
        data-testid="mode-switch-confirm-dialog"
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2
            id="mode-switch-dialog-title"
            className="text-base font-semibold text-gray-900"
          >
            {title}
          </h2>
          <div className="mt-2 space-y-2 text-sm text-gray-700">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          {actions.map((a, i) => (
            <button
              key={a.id ?? i}
              type="button"
              onClick={a.onClick}
              disabled={busy || a.disabled}
              data-testid={a.testId}
              className={actionClass(a.variant)}
            >
              {busy && i === actions.length - 1 ? "Working…" : a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function actionClass(variant: ModeSwitchAction["variant"]): string {
  const base =
    "rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  switch (variant) {
    case "primary":
      return `${base} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
    case "danger":
      return `${base} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
    case "secondary":
      return `${base} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:ring-blue-500`;
  }
}
