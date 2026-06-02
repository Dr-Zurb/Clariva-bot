"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { renderMarkdownLite } from "@/lib/text/markdown-lite";
import type { ConsultationMessage } from "@/lib/text/types";

const LONG_PRESS_MS = 500;

export interface PinnedMessagesBannerProps {
  pinned: ConsultationMessage[];
  currentUserRole: "doctor" | "patient";
  layout: "standalone" | "panel" | "canvas";
  onJumpToPin: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
}

function pinExcerpt(message: ConsultationMessage): string {
  const trimmed = message.body?.trim();
  if (trimmed) return trimmed;
  if (message.kind === "attachment") return "Attachment";
  return "Message";
}

function PinnedRow({
  message,
  compact,
  canUnpin,
  onJumpToPin,
  onUnpin,
}: {
  message: ConsultationMessage;
  compact: boolean;
  canUnpin: boolean;
  onJumpToPin: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
}): JSX.Element {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleUnpin = useCallback(() => {
    if (!onUnpin) return;
    onUnpin(message.id);
  }, [message.id, onUnpin]);

  return (
    <div
      className={
        "group/pin relative flex min-w-0 items-center gap-2 " +
        (compact ? "py-1" : "py-1.5")
      }
    >
      <button
        type="button"
        onClick={() => onJumpToPin(message.id)}
        onContextMenu={
          canUnpin
            ? (e) => {
                e.preventDefault();
                handleUnpin();
              }
            : undefined
        }
        onPointerDown={
          canUnpin
            ? (e) => {
                if (e.button !== 0) return;
                clearLongPress();
                longPressTimerRef.current = setTimeout(() => {
                  longPressTimerRef.current = null;
                  handleUnpin();
                }, LONG_PRESS_MS);
              }
            : undefined
        }
        onPointerUp={canUnpin ? clearLongPress : undefined}
        onPointerCancel={canUnpin ? clearLongPress : undefined}
        onPointerLeave={canUnpin ? clearLongPress : undefined}
        className="min-w-0 flex-1 truncate text-left text-xs text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm"
        aria-label={`Jump to pinned message: ${pinExcerpt(message)}`}
      >
        <span className="truncate">
          {renderMarkdownLite(pinExcerpt(message), { compact: true })}
        </span>
      </button>
      {canUnpin ? (
        <button
          type="button"
          onClick={handleUnpin}
          className="hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 group-hover/pin:inline-flex"
          aria-label="Unpin message"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * text-B7 — collapsible pinned-messages bar at the top of the message list.
 */
export function PinnedMessagesBanner({
  pinned,
  currentUserRole,
  layout,
  onJumpToPin,
  onUnpin,
}: PinnedMessagesBannerProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const compact = layout === "canvas";

  if (pinned.length === 0) return null;

  const countLabel =
    pinned.length === 1 ? "📌 1 pinned" : `📌 ${pinned.length} pinned`;
  const canUnpin = currentUserRole === "doctor" && !!onUnpin;

  return (
    <div
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5"
      data-testid="pinned-messages-banner"
      data-layout={layout}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={
          "flex w-full items-center justify-between gap-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm " +
          (compact ? "text-xs" : "text-sm")
        }
        aria-expanded={expanded}
        aria-controls="pinned-messages-list"
      >
        <span className="font-medium text-amber-900">{countLabel}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        )}
      </button>
      {expanded ? (
        <div
          id="pinned-messages-list"
          className="mt-1 space-y-0.5 border-t border-amber-200/80 pt-1"
        >
          {pinned.map((message) => (
            <PinnedRow
              key={message.id}
              message={message}
              compact={compact}
              canUnpin={canUnpin}
              onJumpToPin={onJumpToPin}
              onUnpin={onUnpin}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
