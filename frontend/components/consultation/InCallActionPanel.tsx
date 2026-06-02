"use client";

import { type ReactNode, useEffect } from "react";

/**
 * In-call action panel shell (Sub-batch C · task-video-C6).
 *
 * Side-panel modal overlay used by the in-call quick actions to render
 * either the Rx writer or the follow-up booker. Slides in from the
 * right on desktop (~400px wide, fixed-overlay so the underlying video
 * pane stays interactable behind it); slides up from the bottom on
 * mobile (covers ~80% of the viewport height).
 *
 * Why a fixed overlay vs. a flex-layout shift:
 *   The video grid + companion chat panel inside `<VideoRoom>` is
 *   already a complex flex tree (desktop two-pane + mobile tab
 *   switcher). A layout shift would risk regressing one of those
 *   modes. A fixed-overlay keeps the existing layout untouched and
 *   the doctor can still monitor the patient's video in the visible
 *   strip behind the panel — actually a better clinical outcome than
 *   covering the video entirely.
 *
 * Recording boundary: opening / closing this panel does NOT pause
 * recording (per task-video-C6 §Notes #5).
 */
export interface InCallActionPanelProps {
  /** Whether the panel is open. */
  open: boolean;
  /** Header title (e.g. "Send prescription"). */
  title: string;
  /** Body content. Typically a form (PrescriptionForm or
   *  FollowUpInlineBooker). */
  children: ReactNode;
  /** Called when the doctor clicks the close X or hits ESC. */
  onClose: () => void;
}

export default function InCallActionPanel({
  open,
  title,
  children,
  onClose,
}: InCallActionPanelProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      aria-modal="true"
      role="dialog"
      aria-labelledby="in-call-action-panel-title"
      data-testid="in-call-action-panel"
    >
      <div
        className="
          pointer-events-auto
          absolute
          right-0 bottom-0
          flex flex-col
          bg-white
          shadow-2xl
          border-l border-t border-gray-200
          /* Mobile: full-width sheet from bottom, ~80% height */
          w-full
          h-[80vh]
          rounded-t-2xl
          /* Desktop: anchored panel on the right, full-height, ~400px wide */
          md:top-0
          md:bottom-0
          md:right-0
          md:h-full
          md:w-[400px]
          md:max-w-[400px]
          md:rounded-t-none
          md:rounded-l-2xl
          md:border-t-0
          md:border-l
        "
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2
            id="in-call-action-panel-title"
            className="text-base font-semibold text-gray-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close panel"
            data-testid="in-call-action-panel-close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
