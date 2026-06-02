"use client";

import { useEffect } from "react";

/**
 * text-C6 — composer-scoped hardware-keyboard shortcuts.
 *
 * Bound to the composer textarea (not `window`) so other inputs keep
 * their own key handling — locale select, file picker, dictation mic,
 * future search box, etc. (Note #1 in task-text-C6.)
 *
 * Three shortcuts:
 *
 * - **`Esc`** (priority order):
 *   1. open per-bubble menu / picker → close via `onCloseMenus`.
 *   2. composer has content → clear via `onClear` (draft survives via
 *      `useComposerDraft` (text-D1) once that ships).
 *   3. `replyToActive` → cancel reply via `onCancelReply`.
 *   4. else → no-op (let Esc bubble for modal close behaviour).
 *
 * - **`↑`** (Up arrow): when composer is empty, fires `onEditLastOwn`.
 *   The consumer is responsible for finding the most recent own
 *   message still inside the 60s edit window
 *   (`findLastEditableOwnMessage` in `edit-message-eligibility.ts`)
 *   and entering edit mode. If no eligible message, the consumer
 *   no-ops. The hook always `preventDefault()`s here because the
 *   composer is empty — there's no cursor movement to preserve.
 *
 * - **`Cmd+Enter` / `Ctrl+Enter`**: calls `onForceSend` regardless of
 *   `connection !== 'online'` state. The send helper still flows
 *   through the optimistic queue; "force" signals user intent to
 *   bypass the queued-state UX from text-A3. When connection is
 *   `'online'`, behaves identically to plain Enter.
 */
export interface UseComposerHotkeysOptions {
  /** Composer textarea ref. Null when the composer is unmounted (e.g. `mode='readonly'`). */
  composerEl: HTMLTextAreaElement | null;
  /** True when the composer textarea has no trimmed content. */
  composerEmpty: boolean;
  /** True when reply-mode is active (text-B4 `replyTo` state non-null). */
  replyToActive: boolean;
  /**
   * True when any per-bubble menu / picker is open
   * (reaction picker, lightbox, camera preview, delete-confirm,
   * inline edit). Esc closes these before clearing the composer.
   */
  menuOpen: boolean;
  /** Clear the composer (text-D1 draft persistence applies if shipped). */
  onClear: () => void;
  /** Cancel reply mode (text-B4 `setReplyTo(null)`). */
  onCancelReply: () => void;
  /**
   * Enter edit mode on the most recent own message still inside the
   * 60s window (text-B6). Caller resolves eligibility and no-ops
   * when none exists.
   */
  onEditLastOwn: () => void;
  /**
   * Force-send. Equivalent to plain Enter when connection is
   * `'online'`; on reconnecting/offline, bypasses the queued-state
   * UX and treats the send as ready (the optimistic bubble still
   * resolves through the queue on reconnect).
   */
  onForceSend: () => void;
  /**
   * Close all per-bubble menus / pickers in priority order.
   * Implementations typically close reaction picker, lightbox,
   * camera preview, delete-confirm toast, and inline edit mode.
   */
  onCloseMenus: () => void;
}

export function useComposerHotkeys({
  composerEl,
  composerEmpty,
  replyToActive,
  menuOpen,
  onClear,
  onCancelReply,
  onEditLastOwn,
  onForceSend,
  onCloseMenus,
}: UseComposerHotkeysOptions): void {
  useEffect(() => {
    if (!composerEl) return undefined;

    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Enter — force-send. Stop propagation so the
      // composer's plain-Enter onKeyDown doesn't double-fire.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onForceSend();
        return;
      }

      if (e.key === "Escape") {
        if (menuOpen) {
          e.preventDefault();
          e.stopPropagation();
          onCloseMenus();
          return;
        }
        if (!composerEmpty) {
          e.preventDefault();
          e.stopPropagation();
          onClear();
          return;
        }
        if (replyToActive) {
          e.preventDefault();
          e.stopPropagation();
          onCancelReply();
          return;
        }
        // No menu, empty composer, no reply — let Esc bubble for
        // any ancestor modal-close behaviour.
        return;
      }

      // Up arrow — edit last own message when composer is empty.
      // When composer has content, Up moves the textarea cursor up a
      // line; preserve that default (Note #4 in task-text-C6).
      if (e.key === "ArrowUp" && composerEmpty) {
        e.preventDefault();
        e.stopPropagation();
        onEditLastOwn();
        return;
      }
    };

    composerEl.addEventListener("keydown", handler);
    return () => composerEl.removeEventListener("keydown", handler);
  }, [
    composerEl,
    composerEmpty,
    replyToActive,
    menuOpen,
    onClear,
    onCancelReply,
    onEditLastOwn,
    onForceSend,
    onCloseMenus,
  ]);
}
