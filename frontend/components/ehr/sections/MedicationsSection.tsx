"use client";

/**
 * MedicationsSection — patient_medications with structured chart-med cards.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartMedicationCard } from "@/components/ehr/chart/ChartMedicationCard";
import { ChartMedicationCaptureBar } from "@/components/ehr/chart/ChartMedicationCaptureBar";
import { useChartMedDuplicateNotice } from "@/components/ehr/chart/useChartMedDuplicateNotice";
import {
  countActivePast,
  sortActiveFirst,
} from "@/components/ehr/chart/ChartPillToggle";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import {
  MEDICATIONS_SECTION_CAPTURE_INPUT_ID,
  MEDICATIONS_SECTION_ID,
} from "@/lib/chart/chart-medication-scroll";
import { COMMON_MEDICATION_QUICK_ADD } from "@/lib/cockpit/common-medications";
import {
  type ChartMedicationPatch,
  chartMedPatchToApiPayload,
  chartMedPatchToLocalPatch,
  findDuplicateMedication,
} from "@/lib/chart/chart-medication";
import { useStableMedKey } from "@/lib/chart/use-stable-med-key";
import {
  archivePatientMedication,
  createPatientMedication,
  listPatientMedications,
  updatePatientMedication,
} from "@/lib/api";
import type {
  CreatePatientMedicationPayload,
  PatientChartLayout,
  PatientChartMode,
  PatientMedication,
  UpdatePatientMedicationPayload,
} from "@/types/patient-chart";

interface MedicationsSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  onCountChange?: (count: number) => void;
  onStatusCountsChange?: (counts: { active: number; past: number }) => void;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function reportCounts(
  rows: PatientMedication[],
  onCountChange?: (count: number) => void,
  onStatusCountsChange?: (counts: { active: number; past: number }) => void,
) {
  onCountChange?.(rows.length);
  const { active, past } = countActivePast(rows);
  onStatusCountsChange?.({ active, past });
}

export default function MedicationsSection({
  patientId,
  token,
  layout: _layout,
  mode,
  addOpen = false,
  onAddOpenChange,
  onCountChange,
  onStatusCountsChange,
}: MedicationsSectionProps) {
  const captureInputId = MEDICATIONS_SECTION_CAPTURE_INPUT_ID;
  const { stableKey, linkRealId } = useStableMedKey();
  const [rows, setRows] = useState<PatientMedication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const readonly = mode === "readonly";
  const { notifyDuplicate, noticePortal } = useChartMedDuplicateNotice();

  useEffect(() => {
    if (!addOpen) return;
    document.getElementById(captureInputId)?.focus();
    onAddOpenChange?.(false);
  }, [addOpen, captureInputId, onAddOpenChange]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientMedications(token, patientId);
        if (cancelled) return;
        const data = res.data.medications ?? [];
        setRows(data);
        reportCounts(data, onCountChange, onStatusCountsChange);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load medications");
        setRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, onCountChange, onStatusCountsChange]);

  const sortedRows = useMemo(() => (rows ? sortActiveFirst(rows) : []), [rows]);

  const quickAddLabels = useMemo(() => {
    const selected = new Set((rows ?? []).map((row) => normalizeKey(row.drug_name)));
    return COMMON_MEDICATION_QUICK_ADD.filter((label) => !selected.has(normalizeKey(label)));
  }, [rows]);

  const commitMedication = useCallback(
    async (payload: CreatePatientMedicationPayload) => {
      const trimmed = payload.drugName.trim();
      if (!trimmed || busy || readonly) return;
      const duplicate = rows
        ? findDuplicateMedication(rows, { drugName: trimmed, drugMasterId: payload.drugMasterId })
        : null;
      if (duplicate) {
        notifyDuplicate(duplicate);
        return;
      }

      setActionError(null);
      setBusy(true);

      const tempId = `temp-${Date.now()}`;
      const optimistic: PatientMedication = {
        id: tempId,
        doctor_id: "",
        patient_id: patientId,
        drug_name: trimmed,
        dose: payload.dose ?? payload.strength ?? null,
        frequency: payload.frequency ?? null,
        status: payload.status ?? "active",
        intake_pattern: payload.intakePattern ?? null,
        source: payload.source ?? null,
        started_on: null,
        stopped_on: null,
        note: payload.note ?? null,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        strength: payload.strength ?? payload.dose ?? null,
        strength_value: payload.strengthValue ?? null,
        strength_unit: payload.strengthUnit ?? null,
        strength_components: payload.strengthComponents ?? null,
        dose_qty: payload.doseQty ?? null,
        dose_unit: payload.doseUnit ?? null,
        frequency_code: payload.frequencyCode ?? null,
        form: payload.form ?? null,
        drug_master_id: payload.drugMasterId ?? null,
        stopped_ago_value: payload.stoppedAgoValue ?? null,
        stopped_ago_unit: payload.stoppedAgoUnit ?? null,
        started_ago_value: payload.startedAgoValue ?? null,
        started_ago_unit: payload.startedAgoUnit ?? null,
        stop_reason: payload.stopReason ?? null,
        dose_schedule: payload.doseSchedule ?? null,
        food_timing: payload.foodTiming ?? null,
      };
      setRows((prev) => {
        const next = [optimistic, ...(prev ?? [])];
        reportCounts(next, onCountChange, onStatusCountsChange);
        return next;
      });

      try {
        const res = await createPatientMedication(token, patientId, {
          ...payload,
          drugName: trimmed,
        });
        const created = res.data.medication;
        // Preserve the card's React key across the temp → real id swap so a
        // just-opened card isn't remounted (and collapsed) when the id changes.
        linkRealId(tempId, created.id);
        setRows((prev) => {
          if (!prev) return [created];
          return prev.map((r) => (r.id === tempId ? created : r));
        });
        onAddOpenChange?.(false);
      } catch (err) {
        setRows((prev) => {
          if (!prev) return prev;
          const next = prev.filter((r) => r.id !== tempId);
          reportCounts(next, onCountChange, onStatusCountsChange);
          return next;
        });
        setActionError(err instanceof Error ? err.message : "Failed to add medication");
      } finally {
        setBusy(false);
      }
    },
    [busy, linkRealId, notifyDuplicate, onAddOpenChange, onCountChange, onStatusCountsChange, patientId, readonly, rows, token],
  );

  const patchMedication = async (row: PatientMedication, patch: ChartMedicationPatch) => {
    if (busy || row.id.startsWith("temp-")) return;
    setActionError(null);
    setBusy(true);
    const apiPatch = chartMedPatchToApiPayload(patch) as UpdatePatientMedicationPayload;
    const localPatch = chartMedPatchToLocalPatch(patch);
    const snapshot = rows ?? [];
    setRows((prev) => {
      const next =
        prev?.map((r) => (r.id === row.id ? { ...r, ...localPatch } : r)) ?? prev;
      if (next) reportCounts(next, onCountChange, onStatusCountsChange);
      return next;
    });
    try {
      await updatePatientMedication(token, patientId, row.id, apiPatch);
    } catch (err) {
      setRows(snapshot);
      reportCounts(snapshot, onCountChange, onStatusCountsChange);
      setActionError(err instanceof Error ? err.message : "Failed to update medication");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (row: PatientMedication) => {
    if (busy || row.id.startsWith("temp-")) return;
    setActionError(null);
    setBusy(true);
    const snapshot = rows ?? [];
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.id !== row.id);
      reportCounts(next, onCountChange, onStatusCountsChange);
      return next;
    });
    try {
      await archivePatientMedication(token, patientId, row.id);
    } catch (err) {
      setRows(snapshot);
      reportCounts(snapshot, onCountChange, onStatusCountsChange);
      setActionError(err instanceof Error ? err.message : "Failed to remove medication");
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading medications…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  return (
    <div id={MEDICATIONS_SECTION_ID} className="scroll-mt-2 space-y-3">
      {!readonly && (
        <ChartMedicationCaptureBar
          token={token}
          inputId={captureInputId}
          disabled={busy}
          onAddPayload={(payload) => void commitMedication(payload)}
        />
      )}

      {sortedRows.length > 0 && (
        <div className="space-y-2" data-testid="medications-chip-list">
          {sortedRows.map((row) => (
            <ChartMedicationCard
              key={stableKey(row.id)}
              med={row}
              readonly={readonly}
              busy={busy}
              defaultCollapsed
              token={token}
              captureInputId={captureInputId}
              medSectionId={MEDICATIONS_SECTION_ID}
              testIdPrefix="medications"
              onPatch={(patch) => void patchMedication(row, patch)}
              onRemove={() => void archive(row)}
            />
          ))}
        </div>
      )}

      {!readonly && (
        <ChartQuickAddChips
          labels={quickAddLabels}
          disabled={busy}
          groupLabel="Common medications"
          testId="medications-quick-add"
          onAdd={(label) => void commitMedication({ drugName: label, status: "active" })}
        />
      )}

      {rows.length === 0 && readonly && (
        <p className="px-1 py-1 text-xs text-muted-foreground">No medications recorded.</p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
      {noticePortal}
    </div>
  );
}
