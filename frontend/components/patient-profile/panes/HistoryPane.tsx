"use client";

/**
 * `<HistoryPane>` — past visit (prescription) list for the cockpit History leaf (cce-03).
 *
 * Fetches all prescriptions for the appointment's patient and renders compact
 * cards (most recent first). Tapping a card opens `<VisitDetailSideSheet>` via
 * the shell-scoped `useSideSheet()` primitive (cce-01).
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill } from "lucide-react";
import { listPrescriptionsByPatient } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import VisitDetailSideSheet from "@/components/patient-profile/side-sheets/VisitDetailSideSheet";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

function medicineCount(rx: PrescriptionWithRelations): number {
  return rx.prescription_medicines?.length ?? 0;
}

function sortByCreatedDesc(list: PrescriptionWithRelations[]): PrescriptionWithRelations[] {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function summarizeHistory(
  items: PrescriptionWithRelations[] | null,
  loading: boolean,
): string {
  if (loading || items === null) return "Loading visit history…";
  if (items.length === 0) return "No past visits";
  if (items.length === 1) {
    return `Last visit: ${formatDate(items[0].created_at)}`;
  }
  return `${items.length} past visits · Last: ${formatDate(items[0].created_at)}`;
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
  onOpen,
}: {
  rx: PrescriptionWithRelations;
  onOpen: (rx: PrescriptionWithRelations) => void;
}) {
  const absoluteDate = formatDate(rx.created_at);
  const relativeDate = formatRelative(rx.created_at);
  const count = medicineCount(rx);
  const dx = rx.provisional_diagnosis?.trim() || "No working diagnosis";

  const handleOpen = () => onOpen(rx);

  return (
    <Card
      className={cn(
        "cursor-pointer shadow-sm transition-colors",
        "hover:border-primary/40 hover:bg-muted/30",
        "focus-within:ring-2 focus-within:ring-ring",
      )}
      data-testid={`history-visit-card-${rx.id}`}
    >
      <button
        type="button"
        className="w-full rounded-xl text-left focus:outline-none"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
          }
        }}
        aria-label={`Open visit from ${absoluteDate}`}
      >
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <time
              className="text-xs font-medium text-muted-foreground"
              dateTime={rx.created_at}
              title={absoluteDate}
            >
              {relativeDate}
            </time>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              aria-label={`${count} medicines`}
            >
              <Pill className="h-3 w-3" aria-hidden />
              {count}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-foreground">{truncateCc(rx.cc)}</p>
          <p className="truncate text-xs text-muted-foreground">{dx}</p>
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

  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<PrescriptionWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listPrescriptionsByPatient(token, patientId);
      setItems(sortByCreatedDesc(res.data.prescriptions ?? []));
    } catch (err) {
      setItems(null);
      setError(err instanceof Error ? err.message : "Failed to load visit history");
    } finally {
      setLoading(false);
    }
  }, [patientId, token]);

  useEffect(() => {
    if (!patientId) {
      setItems(null);
      setError(null);
      setLoading(false);
      return;
    }
    void load();
  }, [load, patientId]);

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
        <div className="flex flex-col gap-2 pb-2">
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
            sortedItems.map((rx) => (
              <VisitHistoryCard key={rx.id} rx={rx} onOpen={handleOpenVisit} />
            ))
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
