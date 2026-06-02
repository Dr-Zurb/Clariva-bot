"use client";

/**
 * `<VisitDetailSideSheet>` — read-only DL-24 prescription detail (cce-03 / DL-5).
 *
 * Fetches a single Rx by id and renders all structured SOAP fields for the
 * cockpit History pane's visit-detail side sheet. Field names on the wire use
 * the Prescription V1 shape (`cc`, `hopi`, flat vitals columns, etc.).
 *
 * @see plan-cockpit-v2.md § R-CHART
 * @see plan-cockpit-chart-extraction-batch.md § DL-5
 */

import { useCallback, useEffect, useState } from "react";
import { getPrescription } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import type {
  FollowUpUnit,
  PrescriptionMedicine,
  PrescriptionWithRelations,
} from "@/types/prescription";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface VisitDetailSideSheetProps {
  rxId: string;
  token: string;
}

function emDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
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

function formatFollowUp(
  value: number | null | undefined,
  unit: FollowUpUnit | null | undefined,
  legacy: string | null | undefined,
): string {
  if (value != null && unit) {
    const unitLabel =
      unit === "as_needed"
        ? "as needed"
        : value === 1
          ? unit.replace(/s$/, "")
          : unit;
    return `in ${value} ${unitLabel}`;
  }
  return emDash(legacy);
}

function computeBmi(wtKg: number | null | undefined, htCm: number | null | undefined): string {
  if (wtKg == null || htCm == null || htCm <= 0) return "—";
  const m = htCm / 100;
  const bmi = wtKg / (m * m);
  return Number.isFinite(bmi) ? bmi.toFixed(1) : "—";
}

function FieldBlock({
  label,
  value,
  large,
  preserveBreaks,
}: {
  label: string;
  value: string;
  large?: boolean;
  preserveBreaks?: boolean;
}) {
  const empty = value === "—";
  return (
    <section className="space-y-1">
      <h3
        className={cn(
          "text-xs font-medium uppercase tracking-wide",
          empty ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {label}
      </h3>
      <div
        className={cn(
          "text-sm text-foreground",
          large && "text-base font-medium",
          preserveBreaks && "whitespace-pre-wrap",
          empty && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </section>
  );
}

function VitalsGrid({ rx }: { rx: PrescriptionWithRelations }) {
  const bp =
    rx.vitals_bp_systolic != null && rx.vitals_bp_diastolic != null
      ? `${rx.vitals_bp_systolic}/${rx.vitals_bp_diastolic}`
      : "—";
  const chips: { label: string; value: string }[] = [
    { label: "BP", value: bp },
    { label: "HR", value: rx.vitals_hr != null ? `${rx.vitals_hr}` : "—" },
    {
      label: "Temp",
      value: rx.vitals_temp_c != null ? `${rx.vitals_temp_c} °C` : "—",
    },
    { label: "SpO₂", value: rx.vitals_spo2 != null ? `${rx.vitals_spo2}%` : "—" },
    { label: "Wt", value: rx.vitals_wt_kg != null ? `${rx.vitals_wt_kg} kg` : "—" },
    { label: "Ht", value: rx.vitals_ht_cm != null ? `${rx.vitals_ht_cm} cm` : "—" },
    { label: "BMI", value: computeBmi(rx.vitals_wt_kg, rx.vitals_ht_cm) },
  ];

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Vitals
      </h3>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
          >
            <span className="font-medium text-muted-foreground">{chip.label}</span>
            <span className={chip.value === "—" ? "text-muted-foreground" : "text-foreground"}>
              {chip.value}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

function MedicinesList({ medicines }: { medicines: PrescriptionMedicine[] }) {
  if (medicines.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <ul className="space-y-2">
      {medicines.map((med) => (
        <li
          key={med.id}
          className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
        >
          <p className="font-medium text-foreground">{med.medicine_name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[med.dosage, med.frequency, med.duration].filter(Boolean).join(" · ") ||
              "—"}
          </p>
          {med.instructions?.trim() ? (
            <p className="mt-1 text-xs text-foreground/80">{med.instructions}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function VisitDetailBody({ rx }: { rx: PrescriptionWithRelations }) {
  const meds = [...(rx.prescription_medicines ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const diff = rx.differential_diagnosis ?? [];
  const investigations = rx.investigations_orders ?? rx.investigations ?? null;

  return (
    <div className="space-y-5 p-4">
      <p className="text-xs text-muted-foreground">
        {formatDate(rx.created_at)} · {formatRelative(rx.created_at)}
      </p>
      <FieldBlock label="Chief complaint" value={emDash(rx.cc)} large />
      <FieldBlock
        label="History of present illness"
        value={emDash(rx.hopi)}
        preserveBreaks
      />
      <VitalsGrid rx={rx} />
      <FieldBlock
        label="Examination findings"
        value={emDash(rx.examination_findings)}
        preserveBreaks
      />
      <FieldBlock
        label="Provisional diagnosis"
        value={emDash(rx.provisional_diagnosis)}
      />
      <section className="space-y-1.5">
        <h3
          className={cn(
            "text-xs font-medium uppercase tracking-wide",
            diff.length === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
          )}
        >
          Differential diagnosis
        </h3>
        {diff.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diff.map((item) => (
              <span
                key={item}
                className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>
      <FieldBlock
        label="Investigations orders"
        value={emDash(investigations)}
        preserveBreaks
      />
      <section className="space-y-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Medicines
        </h3>
        <MedicinesList medicines={meds} />
      </section>
      <FieldBlock label="Advice" value={emDash(rx.advice)} preserveBreaks />
      <FieldBlock
        label="Follow-up"
        value={formatFollowUp(rx.follow_up_value, rx.follow_up_unit, rx.follow_up)}
      />
      <FieldBlock label="Test results" value={emDash(rx.test_results)} preserveBreaks />
      <FieldBlock label="Referral" value={emDash(rx.referral)} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4" data-testid="visit-detail-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function VisitDetailSideSheet({
  rxId,
  token,
}: VisitDetailSideSheetProps): JSX.Element {
  const [rx, setRx] = useState<PrescriptionWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPrescription(token, rxId);
      setRx(res.data.prescription);
    } catch (err) {
      setRx(null);
      setError(err instanceof Error ? err.message : "Failed to load prescription");
    } finally {
      setLoading(false);
    }
  }, [rxId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4" role="alert">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-primary underline hover:no-underline"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!rx) {
    return (
      <p className="p-4 text-sm text-muted-foreground">Prescription not found.</p>
    );
  }

  return <VisitDetailBody rx={rx} />;
}
