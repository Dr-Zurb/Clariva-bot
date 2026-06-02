"use client";

import { useEffect } from "react";

export interface UseReviewKeyboardOptions {
  enabled: boolean;
  count: number;
  onMove: (delta: number) => void;
  onConfirm: () => void;
  onReassign: () => void;
  onCancel: () => void;
  onOpenDetail: () => void;
  onFocusFilter: () => void;
  onToggleHelp: () => void;
}

export function isReviewKeyboardTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
    return true;
  }
  return false;
}

/** Window-scoped inbox triage shortcuts (brr-12). Inert while typing or when `enabled` is false. */
export function useReviewKeyboard(opts: UseReviewKeyboardOptions): void {
  const {
    enabled,
    count,
    onMove,
    onConfirm,
    onReassign,
    onCancel,
    onOpenDetail,
    onFocusFilter,
    onToggleHelp,
  } = opts;

  useEffect(() => {
    if (!enabled || count === 0) return undefined;

    const handler = (e: KeyboardEvent) => {
      if (isReviewKeyboardTypingTarget(e.target)) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          onMove(1);
          break;
        case "k":
          e.preventDefault();
          onMove(-1);
          break;
        case "c":
          e.preventDefault();
          onConfirm();
          break;
        case "r":
          e.preventDefault();
          onReassign();
          break;
        case "x":
          e.preventDefault();
          onCancel();
          break;
        case "Enter":
          e.preventDefault();
          onOpenDetail();
          break;
        case "/":
          e.preventDefault();
          onFocusFilter();
          break;
        case "?":
          e.preventDefault();
          onToggleHelp();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled,
    count,
    onMove,
    onConfirm,
    onReassign,
    onCancel,
    onOpenDetail,
    onFocusFilter,
    onToggleHelp,
  ]);
}
