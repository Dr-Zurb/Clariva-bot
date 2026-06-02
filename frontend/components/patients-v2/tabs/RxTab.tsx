"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import { Pill } from "lucide-react";
import {
  createPrescriptionShareLink,
} from "@/lib/api";
import { usePatientPrescriptionsQuery } from "@/hooks/queries/usePatientPrescriptionsQuery";
import { formatDate } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import type { PrescriptionWithRelations } from "@/types/prescription";
import { buildRxSummaryText, groupPrescriptionsByYear } from "./history-tabs-utils";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface RxTabProps {
  patientId: string;
  token: string;
}

type ToastKind = "success" | "info" | "error";

export function RxTab({ patientId, token }: RxTabProps) {
  const { data: prescriptions = [], isLoading: loading } =
    usePatientPrescriptionsQuery(token, patientId);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);
  const [busyPdfId, setBusyPdfId] = useState<string | null>(null);

  useTabOpenedTelemetry("rx", patientId);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" ? 6000 : 3500;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  const yearGroups = useMemo(
    () => groupPrescriptionsByYear(prescriptions),
    [prescriptions],
  );

  const showToast = (kind: ToastKind, message: string) => setToast({ kind, message });

  const handleReissue = () => {
    showToast("info", "Reissue is coming soon — Rx form seeding ships in a later release.");
  };

  const handleViewPdf = async (prescriptionId: string) => {
    setBusyPdfId(prescriptionId);
    try {
      const res = await createPrescriptionShareLink(token, prescriptionId);
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Could not open prescription PDF",
      );
    } finally {
      setBusyPdfId(null);
    }
  };

  const handleCopySummary = async (rx: PrescriptionWithRelations) => {
    const text = buildRxSummaryText(rx);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("success", "Prescription summary copied");
        return;
      }
    } catch {
      /* fall through */
    }
    showToast("info", text);
  };

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading prescriptions…</p>;
  }

  if (prescriptions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <Pill className="h-8 w-8 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No prescriptions issued yet.</p>
      </div>
    );
  }

  const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-6 p-4" aria-label="Prescription history">
      {sortedYears.map((year) => {
        const rows = yearGroups.get(year) ?? [];
        return (
          <section key={year}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {year}
            </h3>
            <ul className="space-y-3">
              {rows.map((rx) => (
                <li
                  key={rx.id}
                  className="rounded-md border border-border bg-card px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{formatDate(rx.created_at)}</span>
                    {rx.appointment_id ? (
                      <Link
                        href={buildCockpitAppointmentPath(
                          rx.appointment_id,
                          "patients-v2",
                          { patientId },
                        )}
                        className="text-xs text-primary hover:underline"
                      >
                        Issued during visit
                      </Link>
                    ) : null}
                  </div>
                  {(rx.prescription_medicines?.length ?? 0) > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {rx.prescription_medicines!.map((m) => (
                        <li key={m.id}>
                          <span className="text-foreground">{m.medicine_name}</span>
                          {[m.dosage, m.frequency, m.duration]
                            .filter(Boolean)
                            .map((part, i) => (
                              <span key={i}> · {part}</span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No medicines listed.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleReissue}>
                      Reissue
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyPdfId === rx.id}
                      onClick={() => void handleViewPdf(rx.id)}
                    >
                      {busyPdfId === rx.id ? "Opening…" : "View PDF"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopySummary(rx)}
                    >
                      Copy summary
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg " +
            (toast.kind === "success"
              ? "bg-green-600 text-white"
              : toast.kind === "error"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-white")
          }
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
