"use client";

import { ChartCardOptionToggle } from "@/components/ehr/chart/ChartCardOptionToggle";
import { ChartMedicationCard } from "@/components/ehr/chart/ChartMedicationCard";
import { ChartMedicationCaptureBar } from "@/components/ehr/chart/ChartMedicationCaptureBar";
import {
  ChartFieldGroup,
  ConditionTimingField,
  conditionTimingFromRecord,
  formatConditionAgoSummary,
  RelativeAgoField,
  type ConditionTimingValue,
} from "@/components/ehr/chart/ConditionTimingField";
import { CHART_COMPACT_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import type { ChartMedicationPatch } from "@/lib/chart/chart-medication";
import { chartMedPatchToLocalPatch } from "@/lib/chart/chart-medication";
import { conditionMedSectionId } from "@/lib/chart/chart-medication-scroll";
import { cn } from "@/lib/utils";
import type {
  ConditionWithMedications,
  CreatePatientMedicationPayload,
  PatientConditionAgoUnit,
  PatientConditionStatus,
  PatientMedication,
} from "@/types/patient-chart";

const CONDITION_STATUS_OPTIONS = [
  { value: "active" as const, label: "Active" },
  { value: "resolved" as const, label: "Past" },
];

function conditionStatusReveal(status: PatientConditionStatus): boolean {
  return status === "active" || status === "resolved";
}

/** Shared so the parent can refocus this condition's capture bar after a save. */
export function conditionMedCaptureInputId(conditionId: string): string {
  return `condition-med-capture-${conditionId}`;
}

export interface ConditionCardProps {
  condition: ConditionWithMedications;
  readonly?: boolean;
  token: string;
  onStatusChange: (status: PatientConditionStatus) => void;
  onRemove: () => void;
  onTimingChange: (timing: ConditionTimingValue) => void;
  onResolvedAgoChange: (agoValue: number | null, agoUnit: PatientConditionAgoUnit | null) => void;
  onNoteChange: (note: string) => void;
  onCommitMedication: (payload: CreatePatientMedicationPayload) => void;
  onPatchMedication: (med: PatientMedication, patch: ChartMedicationPatch) => void;
  onRemoveMedication: (med: PatientMedication) => void;
  onLocalMedPatch: (medId: string, patch: Partial<PatientMedication>) => void;
  /** Maps a medication id to a stable React key (survives temp → real id swap). */
  getMedKey?: (medId: string) => string;
}

export function ConditionCard({
  condition,
  readonly = false,
  token,
  onStatusChange,
  onRemove,
  onTimingChange,
  onResolvedAgoChange,
  onNoteChange,
  onCommitMedication,
  onPatchMedication,
  onRemoveMedication,
  onLocalMedPatch,
  getMedKey,
}: ConditionCardProps) {
  const status = condition.status ?? "active";
  const isPast = status === "resolved";
  const showDetails = conditionStatusReveal(status);

  const timingValue: ConditionTimingValue = conditionTimingFromRecord(condition);

  const medCaptureInputId = conditionMedCaptureInputId(condition.id);

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border px-2.5 py-2",
        isPast ? "border-border/60 bg-muted/30" : "border-border/50 bg-background/60",
      )}
      data-testid={`condition-card-${condition.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "shrink-0 text-xs font-semibold text-foreground",
              isPast && "text-muted-foreground",
            )}
            title={condition.condition}
          >
            {condition.condition}
          </span>
          {!readonly && (
            <ChartCardOptionToggle
              options={CONDITION_STATUS_OPTIONS}
              value={status}
              ariaLabel={`${condition.condition} status`}
              testId={`condition-status-toggle-${condition.id}`}
              pastOptionValue="resolved"
              onChange={onStatusChange}
            />
          )}
          {readonly && (
            <span className="text-[10px] text-muted-foreground">
              {isPast ? "Past" : "Active"}
            </span>
          )}
        </div>

        {!readonly && (
          <button
            type="button"
            aria-label={`Remove condition ${condition.condition}`}
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              ×
            </span>
          </button>
        )}
      </div>

      {showDetails && (
        <>
          {readonly ? (
            <>
              {formatConditionAgoSummary(timingValue.agoValue, timingValue.agoUnit) && (
                <p className="text-xs text-muted-foreground">
                  For {formatConditionAgoSummary(timingValue.agoValue, timingValue.agoUnit)}
                </p>
              )}
              {isPast &&
                formatConditionAgoSummary(
                  condition.resolved_ago_value,
                  condition.resolved_ago_unit,
                ) && (
                  <p className="text-xs text-muted-foreground">
                    Resolved{" "}
                    {formatConditionAgoSummary(
                      condition.resolved_ago_value,
                      condition.resolved_ago_unit,
                    )}
                  </p>
                )}
            </>
          ) : (
            <>
              <ConditionTimingField
                label="For"
                value={timingValue}
                testIdPrefix={`condition-diagnosed-${condition.id}`}
                onChange={onTimingChange}
              />

              {isPast && (
                <RelativeAgoField
                  label="Resolved"
                  agoValue={condition.resolved_ago_value}
                  agoUnit={condition.resolved_ago_unit}
                  testIdPrefix={`condition-resolved-${condition.id}`}
                  onChange={onResolvedAgoChange}
                />
              )}
            </>
          )}

          <div
            id={conditionMedSectionId(condition.id)}
            className="scroll-mt-2 space-y-2 rounded-md border border-border/50 bg-muted/10 p-2"
          >
            <p className="text-xs font-medium text-foreground/80">
              Medications for {condition.condition}
            </p>
            {!readonly && (
              <ChartMedicationCaptureBar
                token={token}
                inputId={medCaptureInputId}
                placeholder={`Add medication for ${condition.condition} — search or type a full line and press Enter`}
                conditionStatus={status}
                onAddPayload={onCommitMedication}
              />
            )}
            {condition.medications.map((med) => (
              <ChartMedicationCard
                key={getMedKey ? getMedKey(med.id) : med.id}
                med={med}
                conditionStatus={status}
                readonly={readonly}
                nested
                defaultCollapsed
                token={token}
                captureInputId={medCaptureInputId}
                medSectionId={conditionMedSectionId(condition.id)}
                testIdPrefix={`condition-med-${condition.id}`}
                onPatch={(patch) => {
                  onLocalMedPatch(med.id, chartMedPatchToLocalPatch(patch));
                  onPatchMedication(med, patch);
                }}
                onRemove={() => onRemoveMedication(med)}
              />
            ))}
          </div>

          <ChartFieldGroup label="Notes (optional)" testId={`condition-note-${condition.id}`}>
            <input
              type="text"
              defaultValue={condition.note ?? ""}
              key={`${condition.id}-${condition.note ?? ""}`}
              disabled={readonly}
              placeholder="Additional notes"
              maxLength={500}
              className={cn(CHART_COMPACT_INPUT_CLASS, "w-full")}
              onBlur={(e) => onNoteChange(e.target.value)}
            />
          </ChartFieldGroup>
        </>
      )}
    </div>
  );
}
