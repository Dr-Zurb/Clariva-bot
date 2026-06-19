"use client";

import { CHART_DURATION_VALUE_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import {
  durationUnitChipLabel,
  maxForDurationUnit,
  normalizeStoredDurationUnit,
  SOCIAL_HISTORY_DURATION_UNITS,
  type SocialHistoryDurationUnit,
} from "@/lib/cockpit/social-history-indices";
import { cn } from "@/lib/utils";
import type { PatientConditionAgoUnit } from "@/types/patient-chart";

export const CONDITION_AGO_VALUE_MAX = 120;

const UNIT_CHIP_CLASS =
  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50";

/** UI + API units for condition timing (relative only — no exact date). */
export type ConditionAgoUnit = SocialHistoryDurationUnit;

export interface ConditionTimingValue {
  agoValue: number | null;
  agoUnit: PatientConditionAgoUnit | null;
}

export function conditionTimingFromRecord(condition: {
  diagnosed_ago_value?: number | null;
  diagnosed_ago_unit?: PatientConditionAgoUnit | null;
}): ConditionTimingValue {
  return {
    agoValue: condition.diagnosed_ago_value ?? null,
    agoUnit: condition.diagnosed_ago_unit ?? "years",
  };
}

export function formatConditionAgoSummary(
  agoValue: number | null | undefined,
  agoUnit: PatientConditionAgoUnit | null | undefined,
): string | null {
  if (agoValue == null || agoValue <= 0) return null;
  const unit = normalizeConditionAgoUnit(agoUnit);
  const suffix =
    unit === "months" ? "mo" : unit === "days" ? "d" : "yr";
  return `~${agoValue} ${suffix}`;
}

function normalizeConditionAgoUnit(
  unit: PatientConditionAgoUnit | null | undefined,
): ConditionAgoUnit {
  if (unit === "months" || unit === "days") return unit;
  return "years";
}

function maxForConditionAgoUnit(unit: ConditionAgoUnit): number {
  const socialMax = maxForDurationUnit(unit);
  if (unit === "years") return Math.max(socialMax, CONDITION_AGO_VALUE_MAX);
  return socialMax;
}

function toStoredAgoUnit(unit: ConditionAgoUnit): PatientConditionAgoUnit {
  return unit;
}

export function ChartFieldGroup({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      {children}
    </div>
  );
}

const ROW_LABEL_CLASS =
  "block w-16 min-w-16 max-w-16 shrink-0 pt-1 text-[10px] font-medium leading-tight text-muted-foreground";

/** Shared label + content grid — matches ChartMedicationCard EditorFieldRow. */
export function ChartEditorFieldRow({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-start gap-2" data-testid={testId}>
      <span className={ROW_LABEL_CLASS}>{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

interface RelativeAgoInlineProps {
  value: number | null;
  unit: PatientConditionAgoUnit | null;
  disabled?: boolean;
  ariaLabel: string;
  testIdPrefix: string;
  onChange: (value: number | null, unit: PatientConditionAgoUnit | null) => void;
}

/** Compact relative timing: [n] [Yr|Mo|D] — label carries "For" / "Resolved" / etc. */
function RelativeAgoInline({
  value,
  unit,
  disabled = false,
  ariaLabel,
  testIdPrefix,
  onChange,
}: RelativeAgoInlineProps) {
  const resolvedUnit = normalizeConditionAgoUnit(unit);
  const max = maxForConditionAgoUnit(resolvedUnit);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        disabled={disabled}
        value={value ?? ""}
        aria-label={ariaLabel}
        data-testid={`${testIdPrefix}-value`}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(null, null);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          onChange(Math.min(parsed, max), toStoredAgoUnit(resolvedUnit));
        }}
        className={CHART_DURATION_VALUE_INPUT_CLASS}
      />
      <div className="flex shrink-0 gap-0.5" role="group" aria-label={`${ariaLabel} unit`}>
        {SOCIAL_HISTORY_DURATION_UNITS.map((option) => {
          const isSelected = resolvedUnit === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={option.label}
              data-testid={`${testIdPrefix}-unit-${option.value}`}
              onClick={() =>
                onChange(
                  value && value > 0 ? value : 1,
                  toStoredAgoUnit(normalizeStoredDurationUnit(option.value) ?? option.value),
                )
              }
              className={cn(
                UNIT_CHIP_CLASS,
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60",
              )}
            >
              {durationUnitChipLabel(option.value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface ConditionTimingFieldProps {
  label: string;
  value: ConditionTimingValue;
  disabled?: boolean;
  testIdPrefix: string;
  onChange: (next: ConditionTimingValue) => void;
}

export function ConditionTimingField({
  label,
  value,
  disabled = false,
  testIdPrefix,
  onChange,
}: ConditionTimingFieldProps) {
  return (
    <ChartEditorFieldRow label={label} testId={`${testIdPrefix}-timing`}>
      <RelativeAgoInline
        value={value.agoValue}
        unit={value.agoUnit}
        disabled={disabled}
        ariaLabel={label}
        testIdPrefix={`${testIdPrefix}-ago`}
        onChange={(agoValue, agoUnit) => onChange({ agoValue, agoUnit })}
      />
    </ChartEditorFieldRow>
  );
}

export interface RelativeAgoFieldProps {
  label: string;
  agoValue: number | null;
  agoUnit: PatientConditionAgoUnit | null;
  disabled?: boolean;
  testIdPrefix: string;
  onChange: (agoValue: number | null, agoUnit: PatientConditionAgoUnit | null) => void;
}

export function RelativeAgoField({
  label,
  agoValue,
  agoUnit,
  disabled = false,
  testIdPrefix,
  onChange,
}: RelativeAgoFieldProps) {
  return (
    <ChartEditorFieldRow label={label} testId={`${testIdPrefix}-relative`}>
      <RelativeAgoInline
        value={agoValue}
        unit={agoUnit}
        disabled={disabled}
        ariaLabel={label}
        testIdPrefix={testIdPrefix}
        onChange={onChange}
      />
    </ChartEditorFieldRow>
  );
}
