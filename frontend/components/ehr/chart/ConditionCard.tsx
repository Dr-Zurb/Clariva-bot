"use client";

import { ChartCardOptionToggle } from "@/components/ehr/chart/ChartCardOptionToggle";
import { usePersistedOpenFlag } from "@/lib/cockpit/use-persisted-entry-open";
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
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
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

/** Shared so the parent can refocus this condition's capture bar after a save. */
export function conditionMedCaptureInputId(conditionId: string): string {
  return `condition-med-capture-${conditionId}`;
}

/** Collapsed one-line summary: diagnosed/resolved timing, medication count, note. */
function conditionPreview(
  condition: ConditionWithMedications,
  timing: ConditionTimingValue,
  isPast: boolean,
): string {
  const parts: string[] = [];
  const diagnosed = formatConditionAgoSummary(timing.agoValue, timing.agoUnit);
  if (diagnosed) parts.push(`for ${diagnosed}`);
  if (isPast) {
    const resolved = formatConditionAgoSummary(
      condition.resolved_ago_value,
      condition.resolved_ago_unit,
    );
    if (resolved) parts.push(`resolved ${resolved}`);
  }
  const medCount = condition.medications.length;
  if (medCount > 0) parts.push(`${medCount} medication${medCount === 1 ? "" : "s"}`);
  if (condition.note?.trim()) parts.push(condition.note.trim());
  return parts.join(" · ");
}

export interface ConditionCardProps {
  condition: ConditionWithMedications;
  readonly?: boolean;
  /** Start collapsed (default) — the clinician expands to edit timing / meds / notes. */
  defaultCollapsed?: boolean;
  /**
   * When set (typically patientId), expanded/collapsed state survives refresh
   * and tab switches via sessionStorage.
   */
  uiScopeKey?: string | null;
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
  defaultCollapsed = true,
  uiScopeKey = null,
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
  const [expanded, setExpanded] = usePersistedOpenFlag(
    uiScopeKey,
    condition.id,
    !defaultCollapsed,
  );

  const timingValue: ConditionTimingValue = conditionTimingFromRecord(condition);

  const medCaptureInputId = conditionMedCaptureInputId(condition.id);
  const bodyId = `condition-body-${condition.id}`;

  const titleNode = (
    <>
      <span
        className={cn(
          "shrink-0 text-xs font-semibold text-foreground",
          isPast && "text-muted-foreground",
        )}
        title={condition.condition}
      >
        {condition.condition}
      </span>
      {condition.code ? (
        <span
          className="shrink-0 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          title={condition.code_title ?? condition.code}
          data-testid={`condition-code-chip-${condition.id}`}
        >
          {condition.code}
        </span>
      ) : null}
      {!readonly ? (
        <span
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ChartCardOptionToggle
            options={CONDITION_STATUS_OPTIONS}
            value={status}
            ariaLabel={`${condition.condition} status`}
            testId={`condition-status-toggle-${condition.id}`}
            pastOptionValue="resolved"
            onChange={onStatusChange}
          />
        </span>
      ) : (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {isPast ? "Past" : "Active"}
        </span>
      )}
    </>
  );

  return (
    <CollapsibleEntryCard
      title={titleNode}
      preview={conditionPreview(condition, timingValue, isPast)}
      toggleLabel={`${expanded ? "Collapse" : "Expand"} ${condition.condition}`}
      open={expanded}
      onToggle={() => setExpanded((v) => !v)}
      onRemove={readonly ? undefined : onRemove}
      removeLabel={`Remove condition ${condition.condition}`}
      testId={`condition-card-${condition.id}`}
      bodyId={bodyId}
      closeScrollToSelector='[data-testid="past-medical-history-field"]'
      scrollMarginClassName="scroll-mt-[var(--sticky-stack,2.75rem)]"
      className={isPast ? "bg-muted/30" : undefined}
    >
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
    </CollapsibleEntryCard>
  );
}
