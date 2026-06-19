"use client";

import { Sparkles, Plus, X } from "lucide-react";

import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import type { PatientConditionAgoUnit } from "@/types/patient-chart";
import {
  formatStrengthComponents,
  formatStrengthLabel,
  formatChartMedFormLabel,
  formatStartedAgoSummary,
  getChartFrequencyLabel,
} from "@/lib/chart/chart-medication";
import { getFoodTimingLabel } from "@/lib/medicineCodes";
import type { FrequencyCode, FoodTiming, StrengthUnit } from "@/types/prescription";

export type ChartMedAiStatus = "loading" | "error" | "ready";

interface ChartMedAiProposalProps {
  status: ChartMedAiStatus;
  medicines: AiParsedMedicine[];
  onAdd: (index: number) => void;
  onAddAll: () => void;
  onDismiss: () => void;
  /**
   * Auto-gate path (Enter): commit the doctor's typed line as-is. When set, a
   * "Keep as typed" action replaces the dismiss "✕" so the text is never lost.
   * Absent on the explicit "✨" path (the text is still in the capture field).
   */
  onKeepAsTyped?: () => void;
}

/** One-line sig summary for an AI-detected medicine. */
function summarize(med: AiParsedMedicine): string {
  const parts: string[] = [];
  const comboStrength =
    med.strengthComponents && med.strengthComponents.length >= 2
      ? formatStrengthComponents(
          med.strengthComponents.map((c) => ({
            value: c.value,
            unit: (c.unit as StrengthUnit | null) ?? null,
          })),
        )
      : "";
  const strength =
    comboStrength ||
    formatStrengthLabel(
      med.strengthValue ?? null,
      (med.strengthUnit as StrengthUnit | null) ?? null,
    );
  if (strength) parts.push(strength);
  if (med.doseQty != null) {
    parts.push(med.doseUnit ? `${med.doseQty} ${med.doseUnit}` : `${med.doseQty}`);
  }
  if (med.frequencyCode) {
    parts.push(getChartFrequencyLabel(med.frequencyCode as FrequencyCode));
  }
  if (med.doseSchedule) parts.push(med.doseSchedule);
  if (med.form) parts.push(formatChartMedFormLabel(med.form));
  const food = getFoodTimingLabel(med.foodTiming as FoodTiming | null);
  if (food) parts.push(food);
  if (med.startedAgoValue != null && med.startedAgoUnit) {
    parts.push(`For ${formatStartedAgoSummary(med.startedAgoValue, med.startedAgoUnit as PatientConditionAgoUnit)}`);
  }
  if (med.intakePattern === "regular") parts.push("Regular");
  else if (med.intakePattern === "irregular") parts.push("Irregular");
  if (med.source === "prescribed") parts.push("Prescribed");
  else if (med.source === "self") parts.push("Self-started");
  return parts.join(" · ");
}

/**
 * Suggestion-only proposal panel for the chart-medicine AI parse
 * (confirm-to-apply). Non-blocking: it never gates capture. The doctor adds
 * detected medicines explicitly (per-item or "Add all"); nothing is committed
 * silently. Mirrors the subj-14 `AiRefineProposal`.
 */
export function ChartMedAiProposal({
  status,
  medicines,
  onAdd,
  onAddAll,
  onDismiss,
  onKeepAsTyped,
}: ChartMedAiProposalProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
      data-testid="chart-med-ai-proposal"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-xs font-medium text-foreground">
          {status === "loading"
            ? "Reading with AI…"
            : status === "error"
              ? "Couldn’t read — keeping your typed text."
              : medicines.length === 0
                ? "No medicines found."
                : medicines.length === 1
                  ? "AI suggestion"
                  : `AI found ${medicines.length} medicines`}
        </span>
        {status === "ready" && medicines.length > 1 ? (
          <button
            type="button"
            onClick={onAddAll}
            className="rounded-sm border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Add all
          </button>
        ) : null}
        {onKeepAsTyped ? (
          <button
            type="button"
            onClick={onKeepAsTyped}
            className="rounded-sm border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Keep as typed
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss AI suggestions"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {status === "ready" && medicines.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {medicines.map((med, index) => {
            const detail = summarize(med);
            return (
              <li
                key={`${med.name}-${index}`}
                className="flex items-start gap-1.5 rounded-sm bg-background/60 px-1.5 py-1"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground">{med.name}</span>
                  {detail ? (
                    <span className="ml-1 text-xs text-muted-foreground">{detail}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(index)}
                  className="flex shrink-0 items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                  aria-label={`Add ${med.name}`}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Add
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
