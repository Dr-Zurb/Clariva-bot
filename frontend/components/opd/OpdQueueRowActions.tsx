"use client";

/**
 * OpdQueueRowActions — ⋯ overflow menu only (post-redesign).
 *
 * Replaces the old [Open][Call][Skip] triplet with a single overflow menu
 * carrying the four real outcomes.  The whole row is clickable (handled by
 * OpdQueueDenseRow), so the explicit Open chevron was dropped — it was a
 * dim, redundant duplicate of the row click.  See:
 * docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-10-row-actions-overflow.md
 *
 * Visibility model:
 *   - ⋯ button: opacity-0, shown on row hover/focus-within via the parent
 *               row's `group` class.  Keeps the right-edge calm by default.
 */

import { useCallback, useState } from "react";
import {
  BellRing,
  ChevronsRight,
  MoreHorizontal,
  Undo2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  patchDoctorQueueEntry,
  postDoctorRequeueQueueEntry,
  postDoctorMarkNoShow,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import {
  trackOpdQueueEvent,
  type OpdQueueEvent,
} from "./opdQueueTelemetry";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OpdQueueRowActionsProps {
  entry: DoctorQueueSessionRow;
  /** Doctor JWT for the action calls. */
  token: string;
  /** Refetch the snapshot after a successful mutation. */
  onMutationSuccess: () => void;
  /**
   * Optional confirm dialog renderer.
   * Defaults to `window.confirm` for v1 — no AlertDialog UI primitive exists.
   */
  confirm?: (opts: { title: string; description?: string }) => Promise<boolean>;
  /**
   * Controlled open state for the overflow DropdownMenu.
   * When the S hotkey fires in useOpdQueueHotkeys (task-oq-13), the parent
   * sets this to true for the focused row, programmatically opening the menu.
   * Omit (undefined) to let the DropdownMenu remain uncontrolled.
   */
  overflowOpen?: boolean;
  /** Called when the DropdownMenu open state changes (controlled mode). */
  onOverflowOpenChange?: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUEUE_STATUSES = new Set(["waiting", "called", "skipped", "missed"]);

type RowActionName = Extract<
  OpdQueueEvent,
  { event: "opd_queue.action" }
>["action"];

function defaultConfirm(opts: {
  title: string;
  description?: string;
}): Promise<boolean> {
  const msg = opts.description ? `${opts.title}\n\n${opts.description}` : opts.title;
  return Promise.resolve(window.confirm(msg));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpdQueueRowActions({
  entry,
  token,
  onMutationSuccess,
  confirm: confirmProp,
  overflowOpen,
  onOverflowOpenChange,
}: OpdQueueRowActionsProps): JSX.Element {
  const confirmFn = confirmProp ?? defaultConfirm;
  const [pending, setPending] = useState(false);

  // Build controlled / uncontrolled DropdownMenu open props.
  const dropdownOpenProps =
    overflowOpen !== undefined
      ? { open: overflowOpen, onOpenChange: onOverflowOpenChange }
      : {};

  // ── Derived flags ──────────────────────────────────────────────────────────
  const canMarkCalled = entry.queueStatus === "waiting";
  const canRequeue = REQUEUE_STATUSES.has(entry.queueStatus);
  const canMarkNoShow =
    (entry.appointmentStatus === "pending" ||
      entry.appointmentStatus === "confirmed") &&
    entry.queueStatus !== "completed";

  const hasAnyOverflowItem = canMarkCalled || canRequeue || canMarkNoShow;

  // ── Toast helper ───────────────────────────────────────────────────────────
  // No toast library — an inline error banner is not worth the complexity for
  // this surface. Use console + a transient UI-less "couldn't update" is
  // acceptable for v1.  A toast library can be wired by oq-14.
  const showError = useCallback((err: unknown) => {
    const msg =
      err instanceof Error ? err.message : "Couldn't update. Please retry.";
    // eslint-disable-next-line no-console
    console.error("[OpdQueueRowActions]", msg);
  }, []);

  // ── Generic mutation wrapper ───────────────────────────────────────────────
  const runMutation = useCallback(
    async (fn: () => Promise<unknown>, action: RowActionName) => {
      setPending(true);
      try {
        await fn();
        trackOpdQueueEvent({
          event: "opd_queue.action",
          action,
          statusOfTargetRow: entry.queueStatus,
          outcome: "success",
        });
        onMutationSuccess();
      } catch (err) {
        trackOpdQueueEvent({
          event: "opd_queue.action",
          action,
          statusOfTargetRow: entry.queueStatus,
          outcome: "error",
        });
        showError(err);
      } finally {
        setPending(false);
      }
    },
    [onMutationSuccess, showError, entry.queueStatus]
  );

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleMarkCalled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void runMutation(
        () => patchDoctorQueueEntry(token, entry.entryId, "called"),
        "mark_called_silently"
      );
    },
    [token, entry.entryId, runMutation]
  );

  const handleRequeueAfterCurrent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void runMutation(
        () => postDoctorRequeueQueueEntry(token, entry.entryId, "after_current"),
        "requeue_after_current"
      );
    },
    [token, entry.entryId, runMutation]
  );

  const handleRequeueEnd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void runMutation(
        () => postDoctorRequeueQueueEntry(token, entry.entryId, "end_of_queue"),
        "send_to_end"
      );
    },
    [token, entry.entryId, runMutation]
  );

  const handleMarkNoShow = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ok = await confirmFn({
        title: `Mark ${entry.patientName} as no-show?`,
        description:
          "They'll be removed from today's queue. This action cannot be undone from this surface.",
      });
      if (!ok) return;
      void runMutation(
        () => postDoctorMarkNoShow(token, entry.appointmentId),
        "mark_no_show"
      );
    },
    [confirmFn, token, entry.appointmentId, entry.patientName, runMutation]
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-end">
        {/* ── Overflow: ⋯ button — hover-only via row's `group` class ── */}
        <DropdownMenu {...dropdownOpenProps}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  disabled={pending || !hasAnyOverflowItem}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md",
                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-30",
                    // hover-only — visible when the row is hovered or this button is focused
                    "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100"
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {!hasAnyOverflowItem && (
              <TooltipContent side="left">No actions available</TooltipContent>
            )}
          </Tooltip>

          <DropdownMenuContent align="end" className="w-52">
            {/* Mark called silently */}
            {canMarkCalled && (
              <DropdownMenuItem
                aria-label="Mark patient as called without opening chart"
                onClick={handleMarkCalled}
              >
                <BellRing className="mr-2 h-4 w-4" />
                Mark called silently
              </DropdownMenuItem>
            )}

            {/* Requeue actions */}
            {canRequeue && (
              <>
                {canMarkCalled && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  aria-label="Requeue patient after current consultation"
                  onClick={handleRequeueAfterCurrent}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Requeue after current
                </DropdownMenuItem>
                <DropdownMenuItem
                  aria-label="Send patient to end of queue"
                  onClick={handleRequeueEnd}
                >
                  <ChevronsRight className="mr-2 h-4 w-4" />
                  Send to end of queue
                </DropdownMenuItem>
              </>
            )}

            {/* Mark no-show — destructive, always last */}
            {canMarkNoShow && (
              <>
                {(canMarkCalled || canRequeue) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  aria-label="Mark patient as no-show"
                  onClick={(e) => void handleMarkNoShow(e)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <X className="mr-2 h-4 w-4" />
                  Mark as no-show
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
