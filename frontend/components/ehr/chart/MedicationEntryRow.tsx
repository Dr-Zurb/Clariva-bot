"use client";

import { ChartCardOptionToggle } from "@/components/ehr/chart/ChartCardOptionToggle";
import { ChartPillToggle } from "@/components/ehr/chart/ChartPillToggle";
import { CHART_CHIP_CLASS, CHART_COMPACT_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";
import type {
  PatientMedication,
  PatientMedicationIntakePattern,
  PatientMedicationSource,
  PatientMedicationStatus,
} from "@/types/patient-chart";

export const MED_STATUS_OPTIONS = [
  { value: "active" as const, label: "Active" },
  { value: "past" as const, label: "Past" },
];

export const INTAKE_OPTIONS = [
  { value: "regular" as const, label: "Regular" },
  { value: "irregular" as const, label: "Irregular" },
  { value: "prn" as const, label: "PRN" },
];

export const SOURCE_OPTIONS = [
  { value: "prescribed" as const, label: "Rx" },
  { value: "self" as const, label: "Self" },
  { value: "otc" as const, label: "OTC" },
];

export interface MedicationEntryRowProps {
  row: PatientMedication;
  readonly?: boolean;
  busy?: boolean;
  nested?: boolean;
  removeLabel?: string;
  testIdPrefix?: string;
  onPatch: (patch: {
    dose?: string;
    frequency?: string;
    status?: PatientMedicationStatus;
    intakePattern?: PatientMedicationIntakePattern | null;
    source?: PatientMedicationSource | null;
  }) => void;
  onRemove: () => void;
  onLocalDoseChange?: (dose: string | null) => void;
  onLocalFrequencyChange?: (frequency: string | null) => void;
}

export function MedicationEntryRow({
  row,
  readonly = false,
  busy = false,
  nested = false,
  removeLabel = "Remove",
  testIdPrefix = "medications",
  onPatch,
  onRemove,
  onLocalDoseChange,
  onLocalFrequencyChange,
}: MedicationEntryRowProps) {
  const isPast = row.status === "past";
  const isTemp = row.id.startsWith("temp-");

  return (
    <div
      className={cn("space-y-1.5", nested && "ml-3 border-l border-border/60 pl-3", isPast && "opacity-70")}
      data-testid={`${testIdPrefix}-entry-${row.id}`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,4.5rem)_minmax(0,4.5rem)_auto] items-center gap-x-2">
        <span className={cn(CHART_CHIP_CLASS, "min-w-0 justify-self-start")}>
          <span
            className={cn(
              "truncate font-medium text-foreground",
              isPast && "line-through",
            )}
          >
            {row.drug_name}
          </span>
        </span>
        <input
          type="text"
          value={row.dose ?? ""}
          disabled={readonly || busy || isTemp}
          placeholder="Dose"
          aria-label={`${row.drug_name} dose`}
          maxLength={100}
          className={cn(CHART_COMPACT_INPUT_CLASS, "min-w-0")}
          onChange={(e) => onLocalDoseChange?.(e.target.value || null)}
          onBlur={(e) => {
            const next = e.target.value;
            if (next !== (row.dose ?? "")) onPatch({ dose: next });
          }}
        />
        <input
          type="text"
          value={row.frequency ?? ""}
          disabled={readonly || busy || isTemp}
          placeholder="Freq"
          aria-label={`${row.drug_name} frequency`}
          maxLength={100}
          className={cn(CHART_COMPACT_INPUT_CLASS, "min-w-0")}
          onChange={(e) => onLocalFrequencyChange?.(e.target.value || null)}
          onBlur={(e) => {
            const next = e.target.value;
            if (next !== (row.frequency ?? "")) onPatch({ frequency: next });
          }}
        />
        {!readonly && (
          <button
            type="button"
            disabled={busy}
            aria-label={`${removeLabel} ${row.drug_name}`}
            onClick={onRemove}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {removeLabel}
          </button>
        )}
      </div>
      {!readonly && (
        <div className="flex flex-wrap items-center gap-2 pl-0.5">
          {nested ? (
            <>
              <ChartCardOptionToggle
                options={MED_STATUS_OPTIONS}
                value={row.status}
                disabled={busy}
                ariaLabel={`${row.drug_name} status`}
                testId={`${testIdPrefix}-status-${row.id}`}
                pastOptionValue="past"
                onChange={(status) => {
                  if (status !== row.status) onPatch({ status });
                }}
              />
              <ChartCardOptionToggle
                options={INTAKE_OPTIONS}
                value={row.intake_pattern ?? undefined}
                disabled={busy}
                ariaLabel={`${row.drug_name} intake pattern`}
                testId={`${testIdPrefix}-intake-${row.id}`}
                onChange={(intakePattern) => onPatch({ intakePattern })}
              />
              <ChartCardOptionToggle
                options={SOURCE_OPTIONS}
                value={row.source ?? undefined}
                disabled={busy}
                ariaLabel={`${row.drug_name} source`}
                testId={`${testIdPrefix}-source-${row.id}`}
                onChange={(source) => onPatch({ source })}
              />
            </>
          ) : (
            <>
              <ChartPillToggle
                options={MED_STATUS_OPTIONS}
                value={row.status}
                disabled={busy}
                ariaLabel={`${row.drug_name} status`}
                testId={`${testIdPrefix}-status-${row.id}`}
                onChange={(status) => {
                  if (status !== row.status) onPatch({ status });
                }}
              />
              <ChartPillToggle
                options={INTAKE_OPTIONS}
                value={row.intake_pattern ?? undefined}
                disabled={busy}
                ariaLabel={`${row.drug_name} intake pattern`}
                testId={`${testIdPrefix}-intake-${row.id}`}
                onChange={(intakePattern) => onPatch({ intakePattern })}
              />
              <ChartPillToggle
                options={SOURCE_OPTIONS}
                value={row.source ?? undefined}
                disabled={busy}
                ariaLabel={`${row.drug_name} source`}
                testId={`${testIdPrefix}-source-${row.id}`}
                onChange={(source) => onPatch({ source })}
              />
            </>
          )}
        </div>
      )}
      {readonly && (row.intake_pattern || row.source) && (
        <p className="text-[10px] text-muted-foreground">
          {[row.intake_pattern, row.source].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
