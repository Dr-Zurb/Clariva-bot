"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Mic,
  Video,
} from "lucide-react";
import { getAppointmentsForPatient, listPrescriptionsByPatient } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  chiefComplaintForVisit,
  filterVisits,
  groupByMonth,
  modalityLabel,
  statusLabel,
  truncate,
  type VisitDateRange,
  type VisitModalityFilter,
  type VisitStatusFilter,
} from "./history-tabs-utils";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface VisitsTabProps {
  patientId: string;
  token: string;
  initialVisitFocus?: string;
}

const MODALITY_ICONS = {
  video: Video,
  voice: Mic,
  text: MessageSquare,
  in_clinic: Building2,
} as const;

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  confirmed: "border-transparent bg-success/15 text-success",
  pending: "border-transparent bg-warning/20 text-warning-foreground",
  cancelled: "border-transparent bg-muted text-muted-foreground",
  completed: "border-transparent bg-info/15 text-info",
  no_show: "border-transparent bg-destructive/15 text-destructive",
};

export function VisitsTab({ patientId, token, initialVisitFocus }: VisitsTabProps) {
  const [visits, setVisits] = useState<Appointment[]>([]);
  const [rxByAppointment, setRxByAppointment] = useState<
    Record<string, PrescriptionWithRelations>
  >({});
  const [loading, setLoading] = useState(true);
  const [modalityFilter, setModalityFilter] = useState<VisitModalityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<VisitStatusFilter>("all");
  const [dateRange, setDateRange] = useState<VisitDateRange>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useTabOpenedTelemetry("visits", patientId);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getAppointmentsForPatient(token, patientId),
      listPrescriptionsByPatient(token, patientId),
    ])
      .then(([apptRes, rxRes]) => {
        if (cancelled) return;
        const list = (apptRes.data.appointments ?? []).sort(
          (a, b) =>
            new Date(b.appointment_date).getTime() -
            new Date(a.appointment_date).getTime(),
        );
        setVisits(list);
        const map: Record<string, PrescriptionWithRelations> = {};
        for (const rx of rxRes.data.prescriptions ?? []) {
          if (rx.appointment_id && !map[rx.appointment_id]) {
            map[rx.appointment_id] = rx;
          }
        }
        setRxByAppointment(map);
      })
      .catch(() => {
        if (!cancelled) {
          setVisits([]);
          setRxByAppointment({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  useEffect(() => load(), [load]);

  const filtered = useMemo(
    () => filterVisits(visits, modalityFilter, statusFilter, dateRange),
    [visits, modalityFilter, statusFilter, dateRange],
  );

  const monthGroups = useMemo(() => groupByMonth(filtered), [filtered]);

  useEffect(() => {
    if (!initialVisitFocus || loading) return;
    setExpandedId(initialVisitFocus);
    const el = rowRefs.current[initialVisitFocus];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [initialVisitFocus, loading, filtered.length]);

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading visits…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={modalityFilter}
          onValueChange={(v) => setModalityFilter(v as VisitModalityFilter)}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Modality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modalities</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="in_clinic">In-clinic</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as VisitStatusFilter)}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dateRange} onValueChange={(v) => setDateRange(v as VisitDateRange)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No visits recorded for this patient yet.
        </div>
      ) : (
        <div className="space-y-6" aria-label="Visit history">
          {Array.from(monthGroups.entries()).map(([month, items]) => (
            <section key={month}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {month}
              </h3>
              <div className="space-y-2">
                {items.map((visit) => (
                  <VisitRow
                    key={visit.id}
                    visit={visit}
                    rx={rxByAppointment[visit.id]}
                    expanded={expandedId === visit.id}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === visit.id ? null : visit.id))
                    }
                    rowRef={(el) => {
                      rowRefs.current[visit.id] = el;
                    }}
                    patientId={patientId}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitRow({
  visit,
  rx,
  expanded,
  onToggle,
  rowRef,
  patientId,
}: {
  visit: Appointment;
  rx: PrescriptionWithRelations | undefined;
  expanded: boolean;
  onToggle: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
  patientId: string;
}) {
  const modality = visit.consultation_type ?? "video";
  const ModIcon = MODALITY_ICONS[modality] ?? Video;
  const medicineCount = rx?.prescription_medicines?.length ?? 0;
  const attachmentCount = rx?.prescription_attachments?.length ?? 0;
  const diagnosis = rx?.provisional_diagnosis ?? null;
  const draftSummary =
    rx?.cc || rx?.hopi
      ? truncate([rx.cc, rx.hopi].filter(Boolean).join(" · "), 120)
      : null;

  return (
    <div
      ref={rowRef}
      className={cn(
        "rounded-md border border-border bg-card transition-colors",
        expanded && "ring-1 ring-primary/20",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/40"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{formatDateTime(visit.appointment_date)}</span>
            <Badge variant="outline" className="gap-1 text-xs">
              <ModIcon className="h-3 w-3" aria-hidden />
              {modalityLabel(modality)}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", STATUS_CLASSES[visit.status])}>
              {statusLabel(visit.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {chiefComplaintForVisit(visit)}
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
          {draftSummary ? (
            <p>
              <span className="font-medium text-muted-foreground">Draft snapshot: </span>
              {draftSummary}
            </p>
          ) : null}
          {diagnosis ? (
            <p>
              <span className="font-medium text-muted-foreground">Diagnosis: </span>
              {diagnosis}
            </p>
          ) : null}
          {medicineCount > 0 ? (
            <p className="flex flex-wrap items-center gap-2">
              <span>
                <span className="font-medium text-muted-foreground">Rx: </span>
                {medicineCount} medicine{medicineCount === 1 ? "" : "s"}
              </span>
              <Link
                href={`/dashboard/patients-v2/${patientId}?tab=rx`}
                className="text-xs font-medium text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View Rx
              </Link>
            </p>
          ) : (
            <p className="text-muted-foreground">No prescription on file for this visit.</p>
          )}
          {attachmentCount > 0 ? (
            <p>
              <span className="font-medium text-muted-foreground">Attachments: </span>
              {attachmentCount}
            </p>
          ) : null}
          {visit.notes || visit.clinical_notes ? (
            <p>
              <span className="font-medium text-muted-foreground">Notes: </span>
              {visit.clinical_notes ?? visit.notes}
            </p>
          ) : null}
          <div className="pt-1">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildCockpitAppointmentPath(visit.id, "patients-v2", {
                  patientId,
                })}
              >
                Open appointment
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
