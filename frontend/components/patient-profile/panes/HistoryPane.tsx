"use client";

/**
 * `<HistoryPane>` — past visit (prescription) list for the cockpit History leaf (cce-03).
 *
 * Fetches all prescriptions for the appointment's patient and renders compact
 * cards (most recent first, one row per note). Notes that share an appointment
 * are grouped as the same visit. Tapping a card opens a read-only
 * `<VisitDetailSideSheet>` via the shell-scoped `useSideSheet()` primitive
 * (cce-01) and does not adopt the note into the live form.
 *
 * Built fresh per DL-2 — do not reuse `PatientVisitsTimeline` or
 * `PreviousRxSection` (different layout; patients-redesign deletion coupling).
 *
 * Note: only visits with a saved prescription appear. No-shows / cancellations
 * without an Rx are omitted until a unified visit list ships later.
 *
 * @see plan-cockpit-v2.md § R-CHART
 * @see plan-cockpit-chart-extraction-batch.md § DL-2
 */

import { useCallback, useMemo, useState } from "react";
import { ArrowUpRight, Pill } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import { usePatientPrescriptionsQuery } from "@/hooks/queries/usePatientPrescriptionsQuery";
import VisitDetailSideSheet from "@/components/patient-profile/side-sheets/VisitDetailSideSheet";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  groupHistoryNotesByAppointment,
  historyNoteClockIso,
  historyNoteState,
  historyNoteVersionLabel,
  type HistoryNoteState,
} from "@/components/patient-profile/historyNoteMeta";
import { PaneCollapseChevron } from "./PaneCollapseChevron";

export interface HistoryPaneProps {
  appointment: Appointment;
  token: string;
  /** When true, suppresses the pane header (e.g. isolated test mounts). */
  hideHeader?: boolean;
}

const CC_MAX = 60;

function truncateCc(text: string | null | undefined): string {
  const t = text?.trim() ?? "";
  if (!t) return "No chief complaint recorded";
  if (t.length <= CC_MAX) return t;
  return `${t.slice(0, CC_MAX)}…`;
}

function medicineCount(rx: PrescriptionWithRelations): number {
  return rx.prescription_medicines?.length ?? 0;
}

function medicineLabel(count: number): string {
  if (count === 0) return "No medicines";
  return `${count} medicine${count === 1 ? "" : "s"}`;
}

function summarizeHistory(
  items: PrescriptionWithRelations[] | null,
  loading: boolean,
): string {
  if (loading || items === null) return "Loading visit history…";
  if (items.length === 0) return "No past visits";
  const groups = groupHistoryNotesByAppointment(items);
  const latest = formatDate(historyNoteClockIso(items[0]));
  if (groups.length === 1) {
    return `Last visit: ${latest}`;
  }
  return `${groups.length} past visits · Last: ${latest}`;
}

function stateLabel(state: HistoryNoteState): string {
  if (state === "superseded") return "Superseded";
  if (state === "closed") return "Closed";
  return "Draft";
}

function HistoryCardSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-2 p-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </CardContent>
    </Card>
  );
}

function VisitHistoryCard({
  rx,
  showTime,
  onOpen,
}: {
  rx: PrescriptionWithRelations;
  showTime: boolean;
  onOpen: (rx: PrescriptionWithRelations) => void;
}) {
  const clockIso = historyNoteClockIso(rx);
  const absoluteDate = showTime ? formatDateTime(clockIso) : formatDate(clockIso);
  const count = medicineCount(rx);
  const dx = rx.provisional_diagnosis?.trim() || "No working diagnosis";
  const state = historyNoteState(rx);
  const version = historyNoteVersionLabel(rx);

  const handleOpen = () => onOpen(rx);

  return (
    <Card
      className={cn(
        "cursor-pointer rounded-xl border-border/80 bg-card shadow-sm transition-[border-color,box-shadow,background-color] duration-150",
        "hover:border-primary/35 hover:bg-muted/20 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring",
        state === "superseded" && "bg-muted/30",
      )}
      data-testid={`history-visit-card-${rx.id}`}
    >
      <button
        type="button"
        className="group w-full rounded-xl text-left focus:outline-none"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
          }
        }}
        aria-label={`Open visit from ${absoluteDate}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-3">
            <time
              className="text-xs font-medium text-muted-foreground"
              dateTime={clockIso}
              title={absoluteDate}
            >
              {absoluteDate}
            </time>
            <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
              {version ? (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                  data-testid={`history-note-version-${rx.id}`}
                >
                  {version}
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  state === "draft"
                    ? "bg-amber-50 text-amber-950"
                    : "bg-muted",
                )}
                data-testid={`history-note-state-${rx.id}`}
              >
                {stateLabel(state)}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                aria-label={medicineLabel(count)}
              >
                <Pill className="h-3 w-3" aria-hidden />
                {medicineLabel(count)}
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary"
                aria-hidden
              />
            </div>
          </div>
          <p className="mt-2 line-clamp-1 text-sm font-semibold leading-5 text-foreground">
            {truncateCc(rx.cc)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{dx}</p>
        </CardContent>
      </button>
    </Card>
  );
}

export default function HistoryPane({
  appointment,
  token,
  hideHeader = false,
}: HistoryPaneProps): JSX.Element {
  const { open } = useSideSheet();
  const patientId = appointment.patient_id ?? null;
  // The ribbon prefetches this query as the visit loads. When history is
  // opened, its prescription list normally comes straight from that cache.
  const historyQuery = usePatientPrescriptionsQuery(token, patientId ?? "");

  const [collapsed, setCollapsed] = useState(false);
  const items = historyQuery.data ?? null;
  const error = historyQuery.error
    ? historyQuery.error instanceof Error
      ? historyQuery.error.message
      : "Failed to load visit history"
    : null;
  const loading = historyQuery.isLoading;
  const load = historyQuery.refetch;

  const handleOpenVisit = useCallback(
    (rx: PrescriptionWithRelations) => {
      open({
        id: `visit-detail-${rx.id}`,
        title: `Visit · ${formatDate(rx.created_at)}`,
        content: <VisitDetailSideSheet rxId={rx.id} token={token} />,
        defaultWidth: 480,
        canDock: false,
      });
    },
    [open, token],
  );

  const sortedItems = useMemo(() => items ?? [], [items]);
  const noteGroups = useMemo(
    () => groupHistoryNotesByAppointment(sortedItems),
    [sortedItems],
  );
  const historySummary = useMemo(
    () => summarizeHistory(items, loading || items === null),
    [items, loading],
  );

  if (!patientId) {
    return (
      <div className="flex h-full min-h-0 flex-col p-4" data-testid="history-pane">
        {!hideHeader ? (
          <PaneHeader title="History" titleId="cockpit-history-title" />
        ) : null}
        <p className="text-sm text-muted-foreground">No patient context for this appointment.</p>
      </div>
    );
  }

  const listBody = (
    <>
      {error ? (
        <div
          className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
          role="alert"
        >
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="mt-1 text-sm font-medium text-primary underline hover:no-underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3 pb-2">
          {loading || items === null ? (
            <>
              <HistoryCardSkeleton />
              <HistoryCardSkeleton />
              <HistoryCardSkeleton />
              <HistoryCardSkeleton />
            </>
          ) : sortedItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No past visits for this patient.
            </p>
          ) : (
            <>
              {noteGroups.map((group) => {
                const grouped = group.length > 1;
                if (!grouped) {
                  const rx = group[0]!;
                  return (
                    <VisitHistoryCard
                      key={rx.id}
                      rx={rx}
                      showTime={false}
                      onOpen={handleOpenVisit}
                    />
                  );
                }
                const appointmentId = group[0]?.appointment_id ?? group[0]!.id;
                return (
                  <div
                    key={appointmentId}
                    className="flex flex-col gap-2"
                    data-testid={`history-visit-group-${appointmentId}`}
                  >
                    <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Same visit · {group.length} notes
                    </p>
                    {group.map((rx) => (
                      <VisitHistoryCard
                        key={rx.id}
                        rx={rx}
                        showTime
                        onOpen={handleOpenVisit}
                      />
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="history-pane">
      {!hideHeader ? (
        <PaneHeader
          title="History"
          titleId="cockpit-history-title"
          actions={
            <PaneCollapseChevron
              paneTitle="History"
              collapsed={collapsed}
              onToggle={() => setCollapsed((c) => !c)}
            />
          }
        />
      ) : null}

      {collapsed ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">{historySummary}</div>
      ) : (
        listBody
      )}
    </div>
  );
}
