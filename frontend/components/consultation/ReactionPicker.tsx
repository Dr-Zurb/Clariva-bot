"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  REACTION_EMOJIS,
  type ReactionEmoji,
} from "@/lib/text/aggregate-reactions";

export interface ReactionPickerProps {
  messageId: string;
  anchor: HTMLElement | null;
  /** text-C4 — touch-point anchor; falls back to `anchor` rect when omitted. */
  coords?: { x: number; y: number };
  open: boolean;
  onClose: () => void;
  onPick: (emoji: ReactionEmoji) => void;
}

const PICKER_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

/**
 * text-B5 — five-emoji reaction picker anchored to a message bubble.
 * Positioned via `getBoundingClientRect`; flips below when no room above.
 */
export function ReactionPicker({
  messageId,
  anchor,
  coords,
  open,
  onClose,
  onPick,
}: ReactionPickerProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPosition(null);
      return;
    }
    const popover = popoverRef.current;
    const popoverHeight = popover?.offsetHeight ?? 40;
    const popoverWidth = popover?.offsetWidth ?? 200;

    let top: number;
    let left: number;

    if (coords) {
      const spaceAbove = coords.y;
      const placeAbove =
        spaceAbove >= popoverHeight + PICKER_GAP_PX + VIEWPORT_MARGIN_PX;
      top = placeAbove
        ? coords.y - popoverHeight - PICKER_GAP_PX
        : coords.y + PICKER_GAP_PX;
      left = coords.x - popoverWidth / 2;
    } else {
      const rect = anchor.getBoundingClientRect();
      const spaceAbove = rect.top;
      const placeAbove =
        spaceAbove >= popoverHeight + PICKER_GAP_PX + VIEWPORT_MARGIN_PX;
      top = placeAbove
        ? rect.top - popoverHeight - PICKER_GAP_PX
        : rect.bottom + PICKER_GAP_PX;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
    }

    left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(left, window.innerWidth - popoverWidth - VIEWPORT_MARGIN_PX),
    );
    setPosition({ top, left });
  }, [anchor, coords, open, messageId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose, open]);

  if (!open || !anchor || typeof document === "undefined") return null;

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Add reaction"
      data-testid="reaction-picker"
      data-message-id={messageId}
      className="fixed z-[80] flex gap-1 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-lg animate-in fade-in duration-200"
      style={
        position
          ? { top: position.top, left: position.left }
          : { visibility: "hidden" as const, top: 0, left: 0 }
      }
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onPick(emoji);
            onClose();
          }}
          className="rounded-full px-2 py-1 text-lg leading-none transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}
