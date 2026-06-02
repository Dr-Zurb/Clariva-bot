"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarClock,
  Clock,
  ExternalLink,
  MoreHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { postDoctorMarkNoShow, postDoctorOfferEarlyJoin } from "@/lib/api";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import { cn } from "@/lib/utils";
import type { SlotSessionRow, SlotStatus } from "@/types/opd-doctor";
import type { AddSlotDialogMode } from "./AddSlotDialog";
import { trackOpdSlotEvent } from "./opdQueueTelemetry";
import { resolveSlotEarlyJoinTarget } from "./shared/opdToolbarResolvers";

export interface OpdSlotRowActionsProps {
  entry: SlotSessionRow;
  token: string;
  sessionDate: string;
  onMutationSuccess: () => void;
  /** Full session rows — used to resolve early-join eligibility (unfiltered). */
  allSessionEntries: SlotSessionRow[];
  overflowOpen?: boolean;
  onOverflowOpenChange?: (open: boolean) => void;
  onOpenAddSlotDialog?: (opts: {
    mode: AddSlotDialogMode;
    relatedAppointmentId?: string | null;
  }) => void;
  onRequestDelayPopover?: (entry: SlotSessionRow) => void;
  confirm?: (opts: {
    title: string;
    description?: string;
  }) => Promise<boolean>;
}

function defaultConfirm(opts: {
  title: string;
  description?: string;
}): Promise<boolean> {
  const msg = opts.description
    ? `${opts.title}\n\n${opts.description}`
    : opts.title;
  return Promise.resolve(window.confirm(msg));
}

type SlotActionTelemetry =
  | "mark_no_show"
  | "offer_early_join_sent"
  | "open_appointment_nav"
  | "reschedule_nav"
  | "cancel_slot_nav"
  | "rebook_nav"
  | "delay_menu_stub";

function emitSlotAction(
  row: Pick<SlotSessionRow, "appointmentId" | "slotStatus">,
  action: SlotActionTelemetry,
  outcome: "success" | "error"
): void {
  trackOpdSlotEvent({
    event: "opd_slot.action",
    kind: action,
    slotStatus: row.slotStatus,
    entryId: row.appointmentId,
    outcome,
  });
}

export function OpdSlotRowActions({
  entry,
  token,
  sessionDate,
  onMutationSuccess,
  allSessionEntries,
  confirm: confirmProp,
  overflowOpen,
  onOverflowOpenChange,
  onOpenAddSlotDialog,
  onRequestDelayPopover,
}: OpdSlotRowActionsProps): JSX.Element {
  const router = useRouter();
  const confirmFn = confirmProp ?? defaultConfirm;
  const [pending, setPending] = useState(false);

  const dropdownOpenProps =
    overflowOpen !== undefined
      ? { open: overflowOpen, onOpenChange: onOverflowOpenChange }
      : {};

  const apptPath = buildCockpitAppointmentPath(
    entry.appointmentId,
    "opd-today",
    { opdDate: sessionDate },
  );

  const navigateOpen = useCallback(
    (e: React.MouseEvent, telemetry: SlotActionTelemetry) => {
      e.stopPropagation();
      emitSlotAction(entry, telemetry, "success");
      router.push(apptPath);
    },
    [router, apptPath, entry]
  );

  const earlyJoinTarget = useMemo(
    () => resolveSlotEarlyJoinTarget(allSessionEntries),
    [allSessionEntries]
  );

  const showEarlyJoin =
    (entry.slotStatus === "upcoming" || entry.slotStatus === "grace") &&
    earlyJoinTarget?.appointmentId === entry.appointmentId;

  const runMutation = useCallback(
    async (fn: () => Promise<void>, telemetry: SlotActionTelemetry) => {
      setPending(true);
      try {
        await fn();
        emitSlotAction(entry, telemetry, "success");
        onMutationSuccess();
      } catch {
        emitSlotAction(entry, telemetry, "error");
      } finally {
        setPending(false);
      }
    },
    [onMutationSuccess, entry]
  );

  const handleOfferEarlyJoin = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ok = await confirmFn({
        title: `Offer early join to ${entry.patientName}?`,
        description: "Patient receives a 15-minute early join window.",
      });
      if (!ok) return;
      void runMutation(async () => {
        await postDoctorOfferEarlyJoin(token, entry.appointmentId, {
          expiresInMinutes: 15,
        });
      }, "offer_early_join_sent");
    },
    [confirmFn, entry.appointmentId, entry.patientName, runMutation, token]
  );

  const handleMarkNoShow = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ok = await confirmFn({
        title: `Mark ${entry.patientName} as no-show?`,
        description:
          "They'll be removed from today's active slots. This cannot be undone from this surface.",
      });
      if (!ok) return;
      void runMutation(async () => {
        await postDoctorMarkNoShow(token, entry.appointmentId);
      }, "mark_no_show");
    },
    [confirmFn, entry.patientName, entry.appointmentId, runMutation, token]
  );

  const handleOpenAddSlotOverflow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOverflowOpenChange?.(false);
      onOpenAddSlotDialog?.({
        mode: "overflow",
        relatedAppointmentId: entry.appointmentId,
      });
    },
    [entry.appointmentId, onOpenAddSlotDialog, onOverflowOpenChange]
  );

  const menuForStatus = (): JSX.Element => {
    const s = entry.slotStatus;
    const isWalkIn = entry.patientId == null;

    if (s === "cancelled") {
      return (
        <DropdownMenuItem
          onClick={(e) => navigateOpen(e, "open_appointment_nav")}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open
        </DropdownMenuItem>
      );
    }

    if (s === "completed") {
      return (
        <>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "open_appointment_nav")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open summary
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onOpenAddSlotDialog}
            onClick={handleOpenAddSlotOverflow}
          >
            <UserRound className="mr-2 h-4 w-4" />
            Post-consult return
          </DropdownMenuItem>
        </>
      );
    }

    if (s === "in_consultation") {
      const delayReady = Boolean(onRequestDelayPopover);
      return (
        <>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "open_appointment_nav")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!delayReady || pending}
            title={
              delayReady
                ? undefined
                : "Available after delay popover wiring (sl-05)"
            }
            onClick={(e) => {
              e.stopPropagation();
              if (!onRequestDelayPopover) {
                emitSlotAction(entry, "delay_menu_stub", "success");
                return;
              }
              onRequestDelayPopover(entry);
              emitSlotAction(entry, "delay_menu_stub", "success");
            }}
          >
            <Clock className="mr-2 h-4 w-4" />
            Set delay
          </DropdownMenuItem>
        </>
      );
    }

    if (s === "missed") {
      return (
        <>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "open_appointment_nav")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "reschedule_nav")}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Reschedule
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!onOpenAddSlotDialog}
            onClick={handleOpenAddSlotOverflow}
          >
            Convert to overflow
          </DropdownMenuItem>
        </>
      );
    }

    if (s === "running_late") {
      return (
        <>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "open_appointment_nav")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onClick={(e) => void handleMarkNoShow(e)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <X className="mr-2 h-4 w-4" />
            Mark no-show
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "rebook_nav")}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Send rebook link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending || !onOpenAddSlotDialog}
            onClick={handleOpenAddSlotOverflow}
          >
            Approve overflow
          </DropdownMenuItem>
        </>
      );
    }

    if (s === "upcoming" || s === "grace" || s === "overflow") {
      return (
        <>
          {s === "overflow" && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Overflow slot
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "open_appointment_nav")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>
          {showEarlyJoin && !isWalkIn && (
            <DropdownMenuItem
              disabled={pending}
              onClick={(e) => void handleOfferEarlyJoin(e)}
            >
              <UserRound className="mr-2 h-4 w-4" />
              Offer early join
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "reschedule_nav")}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Reschedule
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => navigateOpen(e, "cancel_slot_nav")}
          >
            Cancel slot
          </DropdownMenuItem>
        </>
      );
    }

    return (
      <DropdownMenuItem
        onClick={(e) => navigateOpen(e, "open_appointment_nav")}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Open
      </DropdownMenuItem>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-end">
        <DropdownMenu {...dropdownOpenProps}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  disabled={pending}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md",
                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-30",
                    "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100"
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
          </Tooltip>

          <DropdownMenuContent align="end" className="w-56">
            {menuForStatus()}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
