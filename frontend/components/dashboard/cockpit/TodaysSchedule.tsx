"use client";

/**
 * TodaysSchedule — cockpit zone C5.
 *
 * Groups today's appointments by hour bucket for at-a-glance scanning.
 * Reuses `useTodaysAppointments` from C2 so both cards share one fetch cadence.
 *
 * pf-13 changes (P4.3 + P4.4):
 *   - Replaced the time-pastness `opacity-60` heuristic with outcome-based
 *     row styling via `getRowMeta` (see lib/dashboard/today-schedule-row-meta.ts).
 *   - Added inline "Mark no-show" 2-step confirmation on Late rows.
 *   - Optimistic no-show update: row immediately shows no_show styling while
 *     PATCH fires; reverts silently on error.
 *   - `lateThresholdMin` prop (default 15) so the chip aligns with the
 *     doctor's `auto_no_show_after_min` setting when the parent has it.
 *
 * @see docs/Work/Daily-plans/May 2026/07-05-2026/Tasks/task-pf-13-todays-schedule-outcomes.md
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-C5-cockpit-todays-schedule.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import { Check, MessageSquare, Phone, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { patchAppointment } from "@/lib/api";
import { invalidateAppointments } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import {
  getRowMeta,
  DEFAULT_LATE_THRESHOLD_MIN,
  type RowBadgeVariant,
} from "@/lib/dashboard/today-schedule-row-meta";
import { useTodaysAppointments } from "./useTodaysAppointments";
import type {
  Appointment,
  AppointmentStatus,
  ConsultationModality,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TodaysScheduleProps {
  token: string;
  /**
   * Minutes past `appointment_date` before the "Late" chip appears.
   * Defaults to 15. Pass `doctor_settings.auto_no_show_after_min` when the
   * cockpit has settings loaded so the chip aligns with the auto-no-show
   * worker threshold.
   */
  lateThresholdMin?: number;
}

interface HourGroup {
  hour: number;
  appointments: Appointment[];
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

function groupByHour(appointments: Appointment[]): HourGroup[] {
  const map = new Map<number, Appointment[]>();
  for (const appt of appointments) {
    const h = new Date(appt.appointment_date).getHours();
    const bucket = map.get(h);
    if (bucket) {
      bucket.push(appt);
    } else {
      map.set(h, [appt]);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, appts]) => ({
      hour,
      appointments: appts.sort(
        (a, b) =>
          new Date(a.appointment_date).getTime() -
          new Date(b.appointment_date).getTime()
      ),
    }));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatHourLabel(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return timeFormatter.format(d);
}

function formatApptTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Clock — ticks every 60 s so rows don't re-render every second
// ---------------------------------------------------------------------------

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// Modality icon
// ---------------------------------------------------------------------------

function ModalityIcon({
  modality,
}: {
  modality: ConsultationModality | null | undefined;
}) {
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (modality === "voice") return <Phone className={cls} aria-hidden />;
  if (modality === "text") return <MessageSquare className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Inline 2-step "Mark no-show" button
//
// First click  → shows "Confirm no-show?" (destructive)
// Second click → fires `onConfirm()` and closes
// Blur / escape → resets to initial state
// ---------------------------------------------------------------------------

interface NoShowButtonProps {
  onConfirm: () => void;
  confirming: boolean;
}

function NoShowButton({ onConfirm, confirming }: NoShowButtonProps) {
  const [step, setStep] = useState<"idle" | "confirm">("idle");

  const handleClick = useCallback(() => {
    if (step === "idle") {
      setStep("confirm");
    } else {
      onConfirm();
      setStep("idle");
    }
  }, [step, onConfirm]);

  const handleBlur = useCallback(() => {
    setStep("idle");
  }, []);

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={handleClick}
        onBlur={handleBlur}
        disabled={confirming}
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border",
          "border-warning/40 text-warning bg-warning/5 hover:bg-warning/10",
          "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          // Always visible on mobile (no hover)
          "max-lg:opacity-100",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        aria-label="Mark this patient as no-show"
      >
        Mark no-show
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={confirming}
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border",
        "border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10",
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "animate-in fade-in duration-100",
        "disabled:opacity-40 disabled:cursor-not-allowed"
      )}
      aria-label="Confirm marking patient as no-show"
    >
      {confirming ? "Saving…" : "Confirm no-show?"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Appointment row
// ---------------------------------------------------------------------------

interface AppointmentRowProps {
  appointment: Appointment;
  /** Effective status (may differ from appointment.status due to optimistic update). */
  effectiveStatus: AppointmentStatus;
  now: Date;
  lateThresholdMin: number;
  onMarkNoShow: (id: string) => Promise<void>;
  markingNoShow: boolean;
}

function AppointmentRow({
  appointment,
  effectiveStatus,
  now,
  lateThresholdMin,
  onMarkNoShow,
  markingNoShow,
}: AppointmentRowProps) {
  // Build a synthetic appointment with the effective (possibly optimistic) status.
  const effective: Appointment =
    effectiveStatus !== appointment.status
      ? { ...appointment, status: effectiveStatus }
      : appointment;

  const meta = getRowMeta(effective, now, lateThresholdMin);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-sm px-1 py-1 text-sm",
        "hover:bg-muted/60 transition-colors",
        meta.dimmed && "opacity-60",
        meta.accentBorder && "border-l-2 border-green-500 pl-2 bg-primary/5"
      )}
    >
      {/* Pulsing live dot */}
      {meta.pulseDot && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </span>
      )}

      {/* Main clickable area — Link wraps content but NOT the action button */}
      <Link
        href={buildCockpitAppointmentPath(appointment.id, "today")}
        className={cn(
          "flex flex-1 min-w-0 items-center gap-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm"
        )}
      >
        {/* Appointment time */}
        <span className="w-14 shrink-0 tabular-nums text-xs text-muted-foreground font-medium flex items-center gap-1">
          {/* Amber dot — silent nudge */}
          {meta.amberDot && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          )}
          {formatApptTime(appointment.appointment_date)}
        </span>

        {/* Modality icon */}
        <ModalityIcon modality={appointment.consultation_type} />

        {/* ✓ icon for completed rows */}
        {meta.showCheckIcon && (
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
        )}

        {/* Patient name */}
        <span
          className={cn(
            "flex-1 truncate font-medium",
            meta.strikethrough && "line-through text-muted-foreground"
          )}
        >
          {appointment.patient_name}
        </span>

        {/* Status / outcome badge */}
        <Badge
          variant={meta.badgeVariant as RowBadgeVariant}
          className={cn(
            "shrink-0 capitalize text-[10px] px-1.5 py-0",
            meta.badgeClassName
          )}
        >
          {meta.badgeLabel}
        </Badge>
      </Link>

      {/* Mark no-show button — sibling of Link (not nested) */}
      {meta.showLateChip && (
        <NoShowButton
          onConfirm={() => void onMarkNoShow(appointment.id)}
          confirming={markingNoShow}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hour group block
// ---------------------------------------------------------------------------

interface HourGroupBlockProps {
  group: HourGroup;
  now: Date;
  lateThresholdMin: number;
  optimisticOverrides: Map<string, AppointmentStatus>;
  markingNoShowIds: Set<string>;
  onMarkNoShow: (id: string) => Promise<void>;
}

function HourGroupBlock({
  group,
  now,
  lateThresholdMin,
  optimisticOverrides,
  markingNoShowIds,
  onMarkNoShow,
}: HourGroupBlockProps) {
  const isCurrent = group.hour === now.getHours();

  return (
    <div
      className={cn(
        "rounded-md px-2 py-1.5",
        isCurrent && "bg-primary/5"
      )}
    >
      {/* Hour header row */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatHourLabel(group.hour)}
        </span>
        <span className="text-xs text-muted-foreground">
          {group.appointments.length}{" "}
          {group.appointments.length === 1 ? "appointment" : "appointments"}
        </span>
      </div>

      {/* Individual appointment rows */}
      <div className="space-y-0.5 pl-1">
        {group.appointments.map((appt) => {
          const effectiveStatus =
            optimisticOverrides.get(appt.id) ?? appt.status;
          return (
            <AppointmentRow
              key={appt.id}
              appointment={appt}
              effectiveStatus={effectiveStatus}
              now={now}
              lateThresholdMin={lateThresholdMin}
              onMarkNoShow={onMarkNoShow}
              markingNoShow={markingNoShowIds.has(appt.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ScheduleSkeleton() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading today's schedule"
    >
      {[2, 1, 3].map((rowCount, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: rowCount }).map((_, j) => (
            <Skeleton key={j} className="h-7 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TodaysSchedule({
  token,
  lateThresholdMin = DEFAULT_LATE_THRESHOLD_MIN,
}: TodaysScheduleProps) {
  const { appointments, loading, refetch } = useTodaysAppointments(token);
  const queryClient = useQueryClient();
  const now = useNowMinute();

  // Optimistic overrides: store status overrides for in-flight no-show PATCHes.
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Map<string, AppointmentStatus>
  >(new Map());
  const [markingNoShowIds, setMarkingNoShowIds] = useState<Set<string>>(
    new Set()
  );

  const handleMarkNoShow = useCallback(
    async (id: string) => {
      // Optimistic: immediately show no_show styling.
      setOptimisticOverrides((prev) => new Map(prev).set(id, "no_show"));
      setMarkingNoShowIds((prev) => new Set(prev).add(id));

      try {
        await patchAppointment(token, id, { status: "no_show" });
        void invalidateAppointments(queryClient);
        refetch();
      } catch (err) {
        console.error("[TodaysSchedule] mark no-show failed:", err);
        // Revert optimistic override so the row returns to "Late" state.
        setOptimisticOverrides((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } finally {
        setMarkingNoShowIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [token, refetch, queryClient]
  );

  // Telemetry — count only, no PHI
  const telemetryFiredRef = useRef(false);
  useEffect(() => {
    if (appointments !== null && !telemetryFiredRef.current) {
      telemetryFiredRef.current = true;
      console.debug("[cockpit] cockpit.todays_schedule.viewed", {
        count: appointments.length,
      });
    }
  }, [appointments]);

  // First-paint: show skeleton before any data arrives
  if (loading && appointments === null) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <p className="text-sm font-medium uppercase text-muted-foreground tracking-wide">
            Today&apos;s Schedule
          </p>
        </CardHeader>
        <CardContent>
          <ScheduleSkeleton />
        </CardContent>
      </Card>
    );
  }

  // No appointments today — hide card entirely (C2 State 3 covers the message)
  if (appointments !== null && appointments.length === 0) {
    return null;
  }

  const groups = appointments ? groupByHour(appointments) : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium uppercase text-muted-foreground tracking-wide">
            Today&apos;s Schedule
          </p>
          {appointments !== null && (
            <Badge variant="secondary" className="text-xs tabular-nums">
              {appointments.length}{" "}
              {appointments.length === 1 ? "appointment" : "appointments"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-1">
        {groups.map((group, i) => (
          <div key={group.hour}>
            {i > 0 && <Separator className="my-1" />}
            <HourGroupBlock
              group={group}
              now={now}
              lateThresholdMin={lateThresholdMin}
              optimisticOverrides={optimisticOverrides}
              markingNoShowIds={markingNoShowIds}
              onMarkNoShow={handleMarkNoShow}
            />
          </div>
        ))}
      </CardContent>

      <CardFooter className="pt-2 pb-3">
        <Link
          href="/dashboard/opd-today"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          View OPD schedule →
        </Link>
      </CardFooter>
    </Card>
  );
}
