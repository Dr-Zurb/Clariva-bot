"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  FileCheck,
  FlaskConical,
  Plus,
  UserPlus,
  X,
} from "lucide-react";

/**
 * In-call quick actions FAB (Sub-batch C · task-video-C6).
 *
 * Floating action button at the bottom-right of the video pane.
 * Click to expand into a vertical menu of clinical quick actions:
 *
 *   - Schedule         — opens the in-call follow-up booker.
 *   - Invite           — opens the three-way invite panel.
 *   - Labs (greyed)    — v2; deferred per decision §15.
 *   - Consent (greyed) — v2; deferred per decision §15.
 *
 * The in-call Rx surface has been removed (cockpit-6 / lane γ). Rx is
 * now always-visible in the cockpit right pane (lane β); opening an
 * overlay here would hide patient video and duplicate the Rx writer.
 *
 * Doctor-only — `<VideoRoom>` mounts this only when `role === 'doctor'`
 * AND `inCallActions` is supplied.
 */
export type QuickAction = "schedule" | "invite";

export interface InCallQuickActionsProps {
  /** Called when the doctor picks an action from the menu. */
  onAction: (action: QuickAction) => void;
  /** Whether the menu starts collapsed (default true). Test hook. */
  initialCollapsed?: boolean;
  /**
   * If set, disables the Schedule action with a tooltip explanation.
   * Used when the consultation has no `patient_id` (walk-in) — the
   * appointment-create API requires a patient record we don't have.
   */
  scheduleDisabledReason?: string | null;
}

export default function InCallQuickActions({
  onAction,
  initialCollapsed = true,
  scheduleDisabledReason = null,
}: InCallQuickActionsProps) {
  const [open, setOpen] = useState(!initialCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the menu when clicking outside the FAB.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handlePick = useCallback(
    (action: QuickAction) => {
      setOpen(false);
      onAction(action);
    },
    [onAction],
  );

  return (
    <div
      ref={containerRef}
      // `fixed` positioning so the FAB anchors to the viewport
      // bottom-right regardless of where it's mounted in the
      // VideoRoom JSX tree. `bottom-20` clears the bottom toolbar
      // (Snapshot / Leave-call buttons sit at `bottom-0`-ish in the
      // toolbar bar). `z-40` sits above normal video content (z-30
      // tiles) and just below the action panel modal (z-60).
      className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 md:bottom-24"
      data-testid="in-call-quick-actions"
    >
      {open ? (
        <div
          className="flex flex-col gap-2 rounded-lg bg-white shadow-xl border border-gray-200 p-2 min-w-[180px]"
          role="menu"
        >
          <button
            type="button"
            onClick={() => handlePick("schedule")}
            disabled={Boolean(scheduleDisabledReason)}
            title={scheduleDisabledReason ?? undefined}
            className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-800 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            role="menuitem"
            data-testid="quick-action-schedule"
          >
            <CalendarPlus size={18} aria-hidden="true" />
            <span>Schedule follow-up</span>
          </button>

          <button
            type="button"
            onClick={() => handlePick("invite")}
            className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-800 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            role="menuitem"
            data-testid="quick-action-invite"
          >
            <UserPlus size={18} aria-hidden="true" />
            <span>Invite participant</span>
          </button>

          <div className="border-t border-gray-100 my-1" />

          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
            title="Lab orders coming in v2"
            data-testid="quick-action-labs-disabled"
          >
            <FlaskConical size={18} aria-hidden="true" />
            <span>Order labs</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
              soon
            </span>
          </button>

          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
            title="Additional consent forms coming in v2"
            data-testid="quick-action-consent-disabled"
          >
            <FileCheck size={18} aria-hidden="true" />
            <span>Request consent</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
              soon
            </span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full bg-blue-600 text-white shadow-lg p-3 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        aria-label={open ? "Close in-call quick actions" : "Open in-call quick actions"}
        aria-expanded={open}
        data-testid="quick-actions-fab"
      >
        {open ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <Plus size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
