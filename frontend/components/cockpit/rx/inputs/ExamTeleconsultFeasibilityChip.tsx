"use client";

import {
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Matches subsection "Patient-assisted" tag styling (ExamSubsectionCollapsible). */
export const EXAM_PATIENT_ASSISTED_PILL_CLASS =
  "shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary";

export interface ExamTeleconsultFeasibilityChipProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  testId?: string;
  /** Chip is limited or in-person-only on teleconsult (independent of selection). */
  flagged?: boolean;
  /** Shown on hover/focus when flagged and not yet selected. */
  hint?: string;
  /** Dashed styling for definite in-person-only chips when unselected. */
  inPersonOnly?: boolean;
  onClick: () => void;
}

/**
 * Exam quick chip with optional teleconsult feasibility tooltip (cranial nerves).
 * Selected flagged chips show a "Patient-assisted" pill (tc-02 / TC-D3).
 */
export function ExamTeleconsultFeasibilityChip({
  label,
  selected,
  disabled = false,
  testId,
  flagged = false,
  hint,
  inPersonOnly = false,
  onClick,
}: ExamTeleconsultFeasibilityChipProps) {
  const showPatientAssisted = flagged && selected;

  const chip = (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={
        showPatientAssisted
          ? `${label}. Patient-assisted`
          : hint
            ? `${label}. ${hint}`
            : label
      }
      data-testid={testId}
      data-teleconsult-limited={flagged && !selected ? "true" : "false"}
      data-in-person-only={inPersonOnly && !selected ? "true" : "false"}
      data-patient-assisted={showPatientAssisted ? "true" : "false"}
      onClick={onClick}
      className={cn(
        chartSelectChipClass(selected),
        inPersonOnly && !selected && "border-dashed opacity-80",
        flagged && !inPersonOnly && !selected && "border-dashed border-border/80",
      )}
    >
      {label}
    </button>
  );

  const chipWithOptionalTooltip =
    hint && !showPatientAssisted ? (
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[16rem] text-left">
          {hint}
        </TooltipContent>
      </Tooltip>
    ) : (
      chip
    );

  if (!showPatientAssisted) return chipWithOptionalTooltip;

  return (
    <span className="inline-flex items-center gap-1">
      {chipWithOptionalTooltip}
      <span className={EXAM_PATIENT_ASSISTED_PILL_CLASS} data-testid={`${testId}-patient-assisted`}>
        Patient-assisted
      </span>
    </span>
  );
}
