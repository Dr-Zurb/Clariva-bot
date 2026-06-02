"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  MessageSquare,
  Phone,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AddAppointmentModal from "@/components/appointments/AddAppointmentModal";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import { formatLocalIsoDate } from "@/lib/dates";
import { useTodaysAppointments } from "./useTodaysAppointments";
import { formatTime as formatTimePinned } from "@/lib/format-date";
import type { Appointment, ConsultationModality } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

function tomorrowOpdHref(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `/dashboard/opd-today?date=${formatLocalIsoDate(d)}`;
}

interface NowNextCardProps {
  token: string;
}

// ---------------------------------------------------------------------------
// Active-session detection helpers
// ---------------------------------------------------------------------------

/**
 * C2 Note 1: Any session with `actual_started_at` older than 12 h is treated
 * as stale and ignored — this guards against yesterday's `live` sessions that
 * were never explicitly ended (missed `ended_at` flush). Fall-through to
 * State 2 (next-up) in that case.
 */
const STALE_SESSION_HOURS = 12;

function isSessionStale(startedAt: string | null): boolean {
  if (!startedAt) return false;
  return (
    Date.now() - new Date(startedAt).getTime() >
    STALE_SESSION_HOURS * 60 * 60 * 1000
  );
}

function findActiveAppointment(appointments: Appointment[]): Appointment | null {
  for (const appt of appointments) {
    const s = appt.consultation_session;
    if (!s) continue;
    if (s.status !== "live") continue;
    if (isSessionStale(s.actual_started_at)) continue;
    return appt;
  }
  return null;
}

function findNextAppointment(appointments: Appointment[]): Appointment | null {
  const now = Date.now();
  const upcoming = appointments
    .filter(
      (appt) =>
        (appt.status === "pending" || appt.status === "confirmed") &&
        new Date(appt.appointment_date).getTime() >= now,
    )
    .sort(
      (a, b) =>
        new Date(a.appointment_date).getTime() -
        new Date(b.appointment_date).getTime(),
    );
  return upcoming[0] ?? null;
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function ModalityIcon({
  modality,
}: {
  modality: ConsultationModality | null | undefined;
}) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (modality === "voice") return <Phone className={cls} aria-hidden />;
  if (modality === "text") return <MessageSquare className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function formatTime(iso: string): string {
  return formatTimePinned(iso);
}

function relativeHint(iso: string): string {
  const diffMin = Math.round(
    (new Date(iso).getTime() - Date.now()) / 60_000,
  );
  if (diffMin <= 0) return "now";
  if (diffMin < 60)
    return `in ${diffMin} minute${diffMin === 1 ? "" : "s"}`;
  const diffH = Math.round(diffMin / 60);
  return `in ${diffH} hour${diffH === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Elapsed timer (updates every second while active)
// ---------------------------------------------------------------------------

function useElapsed(startedAt: string | null | undefined): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    if (!startedAt) return;
    const startMs = new Date(startedAt).getTime();
    const tick = () => {
      const totalSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) {
        setDisplay(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      } else {
        setDisplay(
          `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
        );
      }
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [startedAt]);
  return display;
}

// ---------------------------------------------------------------------------
// State 1 — Active session
// ---------------------------------------------------------------------------

function ActiveState({ appointment }: { appointment: Appointment }) {
  const router = useRouter();
  const elapsed = useElapsed(
    appointment.consultation_session?.actual_started_at,
  );

  return (
    <div className="space-y-3">
      {/* Badge with pulsing indicator */}
      <div className="flex items-center gap-2">
        <Badge
          variant="default"
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-600 border-transparent"
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          In consult
        </Badge>
      </div>

      {/* Patient name + modality */}
      <div className="flex items-center gap-2">
        <ModalityIcon modality={appointment.consultation_type} />
        <p className="text-2xl font-semibold leading-tight">
          {appointment.patient_name}
        </p>
      </div>

      {/* Elapsed timer */}
      {elapsed && (
        <p className="text-sm text-muted-foreground tabular-nums font-mono">
          {elapsed}
        </p>
      )}

      {/* CTAs */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          className="w-full sm:w-auto"
          onClick={() =>
            router.push(
              buildCockpitAppointmentPath(appointment.id, "today"),
            )
          }
        >
          Resume
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto text-muted-foreground"
          asChild
        >
          <Link
            href={buildCockpitAppointmentPath(appointment.id, "today")}
          >
            View appointment
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 2 — Next-up appointment
// ---------------------------------------------------------------------------

function NextUpState({ appointment }: { appointment: Appointment }) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Next up</Badge>
      </div>

      {/* Patient name + modality */}
      <div className="flex items-center gap-2">
        <ModalityIcon modality={appointment.consultation_type} />
        <p className="text-2xl font-semibold leading-tight">
          {appointment.patient_name}
        </p>
      </div>

      {/* Time + relative hint */}
      <p className="text-sm text-muted-foreground">
        {formatTime(appointment.appointment_date)}
        <span className="ml-2 text-xs opacity-70">
          ({relativeHint(appointment.appointment_date)})
        </span>
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          className="w-full sm:w-auto"
          onClick={() =>
            router.push(
              buildCockpitAppointmentPath(appointment.id, "today"),
            )
          }
        >
          Start consult
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto text-muted-foreground"
          asChild
        >
          <Link
            href={buildCockpitAppointmentPath(appointment.id, "today")}
          >
            View appointment
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 3 — Empty (no more appointments today)
// ---------------------------------------------------------------------------

function EmptyState({ token }: { token: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CalendarCheck
          className="h-10 w-10 text-muted-foreground/40"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          All caught up. No more appointments today.
        </p>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setShowModal(true)}
        >
          Add appointment
        </Button>
        <p className="text-xs text-muted-foreground/60">
          Or browse{" "}
          <Link
            href={tomorrowOpdHref()}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            tomorrow&apos;s schedule
          </Link>
        </p>
      </div>

      <AddAppointmentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => setShowModal(false)}
        token={token}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading Now/Next">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-32 rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Now / Next card — cockpit zone C2.
 *
 * Three mutually-exclusive render states:
 *   1. Active session   — consultation_session.status === "live" (non-stale)
 *   2. Next-up          — earliest pending/confirmed appointment from now
 *   3. Empty            — no more appointments today
 *
 * Refreshes every 60 s and on tab visibility-change (via useTodaysAppointments).
 *
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-C2-cockpit-now-next.md
 */
export function NowNextCard({ token }: NowNextCardProps) {
  const { appointments, loading, error, refetch } =
    useTodaysAppointments(token);

  const activeAppt = appointments ? findActiveAppointment(appointments) : null;
  const nextAppt =
    !activeAppt && appointments ? findNextAppointment(appointments) : null;
  const isEmpty =
    !loading && !error && appointments !== null && !activeAppt && !nextAppt;

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-sm font-medium uppercase text-muted-foreground tracking-wide">
          Now / Next
        </p>
      </CardHeader>

      <CardContent>
        {/* First-paint loading skeleton (only before we have any data) */}
        {loading && appointments === null && <LoadingSkeleton />}

        {/* Error — muted, non-breaking, with retry */}
        {!loading && error && (
          <div className="py-3 text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load.{" "}
              <button
                type="button"
                onClick={refetch}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Tap to retry.
              </button>
            </p>
          </div>
        )}

        {/* State 1 — active session */}
        {activeAppt && <ActiveState appointment={activeAppt} />}

        {/* State 2 — next-up */}
        {nextAppt && <NextUpState appointment={nextAppt} />}

        {/* State 3 — empty */}
        {isEmpty && <EmptyState token={token} />}
      </CardContent>

    </Card>
  );
}
