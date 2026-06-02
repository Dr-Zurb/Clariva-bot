"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { Badge } from "@/components/ui/badge";
import { listPatientVitals } from "@/lib/api/patient-chart";
import type { PatientVitalsReading } from "@/types/patient-chart";
import { ChartRailEmptyState } from "./ChartRailEmptyState";
import { mergeSnapshotVitals } from "./snapshot-vitals-merge";

export interface SnapshotVitalsSectionProps {
  patientId: string;
  token: string;
}

function SnapshotVitalRow({
  label,
  value,
  isDraft,
}: {
  label: string;
  value: string | null;
  isDraft: boolean;
}): JSX.Element | null {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{value}</span>
        {isDraft ? (
          <Badge
            variant="outline"
            className="text-[10px]"
            title="These vitals are from the current draft. They'll be saved when you send the Rx."
          >
            Live draft
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

export function SnapshotVitalsSection({
  patientId,
  token,
}: SnapshotVitalsSectionProps): JSX.Element {
  const rxForm = useOptionalRxForm();
  const draftFields = rxForm?.state.fields;

  const [persisted, setPersisted] = useState<PatientVitalsReading | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setPersisted(null);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoaded(false);
    setLoadError(null);

    void listPatientVitals(token, patientId, { limit: 1 })
      .then((res) => {
        if (cancelled) return;
        setPersisted(res.data.vitals[0] ?? null);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setPersisted(null);
        setLoadError(
          err instanceof Error ? err.message : "Failed to load vitals",
        );
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  const { displayed, isDraft, hasAnyData } = useMemo(
    () => mergeSnapshotVitals(persisted, draftFields),
    [persisted, draftFields],
  );

  if (!loaded) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading vitals…</p>;
  }

  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-destructive">
        {loadError}
      </p>
    );
  }

  if (!hasAnyData) {
    return (
      <ChartRailEmptyState
        icon={Heart}
        headline="No vitals on file"
        compact
      />
    );
  }

  return (
    <div
      className="space-y-2 px-1 py-1"
      data-testid="snapshot-vitals-section"
    >
      <SnapshotVitalRow
        label="Blood pressure"
        value={displayed.bp}
        isDraft={isDraft.bp}
      />
      <SnapshotVitalRow
        label="Heart rate"
        value={displayed.hr}
        isDraft={isDraft.hr}
      />
      <SnapshotVitalRow
        label="Temperature"
        value={displayed.tempC}
        isDraft={isDraft.tempC}
      />
      <SnapshotVitalRow
        label="SpO₂"
        value={displayed.spo2}
        isDraft={isDraft.spo2}
      />
      <SnapshotVitalRow
        label="Weight"
        value={displayed.weightKg}
        isDraft={isDraft.weightKg}
      />
      <SnapshotVitalRow
        label="Height"
        value={displayed.heightCm}
        isDraft={isDraft.heightCm}
      />
    </div>
  );
}
