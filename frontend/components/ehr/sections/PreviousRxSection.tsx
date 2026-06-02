"use client";

/**
 * PreviousRxSection (EHR Sub-batch A / T1.6)
 *
 * Lists the last N (default 3) prescriptions for the patient inside
 * `<PatientChartPanel>`. Each row is a collapsed card showing:
 *   - the provisional diagnosis (or "Untitled prescription")
 *   - relative date ("2 days ago" / "3 weeks ago")
 *   - medicine count
 *   - sent/draft state pill
 *
 * Tap a row to expand inline → lazy-fetches the full prescription via
 * the existing `getPrescription` endpoint and renders the medicine
 * list + clinical notes. Lazy-loading keeps the initial chart-panel
 * paint cheap.
 *
 * "View all" links to the appointment-detail page of the most recent
 * Rx (a placeholder route for the dedicated patient-history page that
 * lands later — keeps the affordance present without inventing a
 * stub URL that 404s).
 *
 * Empty state ("No prior prescriptions") for new patients.
 *
 * @see backend/src/services/prescription-service.ts:listRecentPrescriptionsByPatient
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { buildCockpitAppointmentPathFromCurrentOrigin } from "@/lib/cockpit/back-target";
import {
  getPrescription,
  listRecentPrescriptionsByPatient,
} from "@/lib/api";
import type {
  PrescriptionRecentSummary,
  PrescriptionWithRelations,
} from "@/types/prescription";
import type {
  PatientChartLayout,
  PatientChartMode,
} from "@/types/patient-chart";

export type PreviousRxFilter = "active-only" | "most-recent-visit";

interface PreviousRxSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /** Max rows to fetch. Defaults to 3 (matches the chart panel design). */
  limit?: number;
  /**
   * Client-side filter applied after fetch. Omitted = show all fetched rows
   * (legacy chart-panel behaviour). `active-only` = sent-to-patient Rxs only.
   * `most-recent-visit` = sent Rxs from the patient's latest visit only
   * (Snapshot pane current-medications glance).
   */
  filter?: PreviousRxFilter;
  /** Optional callback fired with the current row count for the SectionWrapper badge. */
  onCountChange?: (count: number) => void;
}

function applyPreviousRxFilter(
  items: PrescriptionRecentSummary[],
  filter?: PreviousRxFilter,
): PrescriptionRecentSummary[] {
  if (!filter || items.length === 0) return items;
  if (filter === "active-only") {
    return items.filter((rx) => rx.sent_to_patient_at != null);
  }
  const sent = items.filter((rx) => rx.sent_to_patient_at != null);
  if (sent.length === 0) return [];
  const latestAppointmentId = sent[0].appointment_id;
  return sent.filter((rx) => rx.appointment_id === latestAppointmentId);
}

export default function PreviousRxSection({
  patientId,
  token,
  layout,
  mode: _mode,
  limit = 3,
  filter,
  onCountChange,
}: PreviousRxSectionProps) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PrescriptionRecentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PrescriptionWithRelations>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    listRecentPrescriptionsByPatient(token, patientId, { limit })
      .then((res) => {
        if (cancelled) return;
        const filtered = applyPreviousRxFilter(res.data.prescriptions, filter);
        setItems(filtered);
        onCountChange?.(filtered.length);
      })
      .catch((err) => {
        if (cancelled) return;
        // Same UI for "no permission" and "load failed" — the chart
        // panel's other sections also degrade quietly.
        setError(err instanceof Error ? err.message : "Failed to load prescriptions");
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, token, limit, filter, onCountChange]);

  const handleToggle = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (details[id]) return;

      setDetailLoadingId(id);
      setDetailError(null);
      try {
        const res = await getPrescription(token, id);
        setDetails((prev) => ({ ...prev, [id]: res.data.prescription }));
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Failed to load prescription");
      } finally {
        setDetailLoadingId(null);
      }
    },
    [details, expandedId, token]
  );

  if (error) {
    return (
      <p className="px-1 py-2 text-xs text-red-600" role="alert">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <p className="px-1 py-2 text-xs text-gray-400">Loading…</p>;
  }

  if (items.length === 0) {
    return <p className="px-1 py-2 text-xs text-gray-500">No prior prescriptions.</p>;
  }

  const isCompact = layout === "in-call";

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((rx) => {
        const isOpen = expandedId === rx.id;
        const detail = details[rx.id];
        return (
          <div
            key={rx.id}
            className="rounded border border-gray-200 bg-white"
            data-testid={`previous-rx-card-${rx.id}`}
          >
            <button
              type="button"
              onClick={() => handleToggle(rx.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-medium ${isCompact ? "text-xs" : "text-sm"} text-gray-900`}
                >
                  {rx.provisional_diagnosis || "Untitled prescription"}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {formatRelative(rx.created_at)}
                  {" · "}
                  {rx.medicine_count}
                  {rx.medicine_count === 1 ? " medicine" : " medicines"}
                </p>
              </div>
              <SentPill sent={Boolean(rx.sent_to_patient_at)} />
              <ChevronDown
                aria-hidden="true"
                size={14}
                className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 px-2 py-2 text-[11px]">
                {detailLoadingId === rx.id && (
                  <p className="text-gray-400">Loading details…</p>
                )}
                {detailError && expandedId === rx.id && !detail && (
                  <p className="text-red-600" role="alert">
                    {detailError}
                  </p>
                )}
                {detail && (
                  <PrescriptionDetailBody rx={detail} />
                )}
                {rx.appointment_id ? (
                  <Link
                    href={buildCockpitAppointmentPathFromCurrentOrigin(
                      rx.appointment_id,
                      searchParams,
                    )}
                    className="mt-2 inline-block text-[11px] font-medium text-blue-600 hover:text-blue-800"
                  >
                    Open full appointment →
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        );
      })}

      {/* "View all" — links to the most recent appointment as a stand-in
          for the dedicated patient-history page that lands later. */}
      {items.length > 0 && items[0].appointment_id ? (
        <Link
          href={buildCockpitAppointmentPathFromCurrentOrigin(
            items[0].appointment_id,
            searchParams,
          )}
          className="mt-1 self-end text-[11px] font-medium text-blue-600 hover:text-blue-800"
          data-testid="previous-rx-view-all"
        >
          View all →
        </Link>
      ) : null}
    </div>
  );
}

function PrescriptionDetailBody({ rx }: { rx: PrescriptionWithRelations }) {
  const meds = rx.prescription_medicines ?? [];
  return (
    <div className="space-y-1.5 text-gray-700">
      {meds.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4">
          {meds.map((med) => (
            <li key={med.id}>
              <span className="font-medium text-gray-900">{med.medicine_name}</span>
              {med.dosage ? ` · ${med.dosage}` : ""}
              {med.frequency ? ` · ${med.frequency}` : ""}
              {med.duration ? ` · ${med.duration}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No medicines recorded.</p>
      )}
      {rx.clinical_notes && (
        <p className="whitespace-pre-wrap text-gray-600">{rx.clinical_notes}</p>
      )}
    </div>
  );
}

function SentPill({ sent }: { sent: boolean }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        sent ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      {sent ? "Sent" : "Draft"}
    </span>
  );
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
