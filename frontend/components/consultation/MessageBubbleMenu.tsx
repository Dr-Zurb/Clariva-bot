"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useExpiringMenu } from "@/lib/text/use-expiring-menu";
import type { ConsultationMessage } from "@/lib/text/types";

export interface MessageBubbleMenuProps {
  message: ConsultationMessage;
  isOwn: boolean;
  mode: "live" | "readonly";
  currentUserRole: "doctor" | "patient";
  onStartEdit: () => void;
  onSoftDelete: () => void;
  onStartReply: () => void;
  onAddReaction: (anchor: HTMLElement) => void;
  onTogglePin?: () => void;
  /** When true, Pin is disabled unless the message is already pinned. */
  pinCapReached?: boolean;
  /** Bubble body element — used as the reaction-picker anchor. */
  reactionAnchorRef: React.RefObject<HTMLElement | null>;
}

/**
 * text-B6 — per-bubble action menu (reply, react, edit, delete, pin).
 */
export function MessageBubbleMenu({
  message,
  isOwn,
  mode,
  currentUserRole,
  onStartEdit,
  onSoftDelete,
  onStartReply,
  onAddReaction,
  onTogglePin,
  pinCapReached = false,
  reactionAnchorRef,
}: MessageBubbleMenuProps): JSX.Element | null {
  const { canEdit, secondsRemaining } = useExpiringMenu(message);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (mode === "readonly" || message.kind === "system" || message.deleted_at) {
    return null;
  }

  const showEdit =
    isOwn && canEdit && message.kind !== "attachment";
  const showDelete = isOwn && canEdit;
  const showPin =
    currentUserRole === "doctor" &&
    !!onTogglePin &&
    (message.kind === "text" || message.kind === "attachment");
  const pinDisabled = showPin && !message.pinned_at && pinCapReached;
  const windowLabel = isOwn && canEdit ? ` (${secondsRemaining}s)` : "";

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 opacity-100 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:opacity-0 sm:group-hover/message:opacity-100"
        aria-label="Message actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-0.5 min-w-[9rem] rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
            onClick={() => {
              onStartReply();
              close();
            }}
          >
            Reply
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
            onClick={() => {
              if (reactionAnchorRef.current) onAddReaction(reactionAnchorRef.current);
              close();
            }}
          >
            Add reaction
          </button>
          {showEdit ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
              onClick={() => {
                onStartEdit();
                close();
              }}
            >
              Edit{windowLabel}
            </button>
          ) : null}
          {showDelete ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-red-700"
              onClick={() => {
                onSoftDelete();
                close();
              }}
            >
              Delete{windowLabel}
            </button>
          ) : null}
          {showPin ? (
            <button
              type="button"
              role="menuitem"
              disabled={pinDisabled}
              className={
                "block w-full px-3 py-1.5 text-left " +
                (pinDisabled
                  ? "cursor-not-allowed text-gray-400"
                  : "hover:bg-gray-50")
              }
              onClick={() => {
                if (pinDisabled) return;
                onTogglePin?.();
                close();
              }}
            >
              {message.pinned_at ? "Unpin" : "Pin"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
