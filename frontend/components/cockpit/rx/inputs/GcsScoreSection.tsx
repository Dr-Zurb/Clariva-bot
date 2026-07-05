"use client";

import { useEffect } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  RangeFlagIcon,
} from "@/components/cockpit/rx/inputs/VitalsExtended";
import { VitalContextFields } from "@/components/cockpit/rx/inputs/VitalContextFields";
import { GcsCriteriaHelp } from "@/components/cockpit/rx/inputs/GcsCriteriaHelp";
import { VitalRangeHelp } from "@/components/cockpit/rx/inputs/VitalRangeHelp";
import { VitalLowConfidenceBadge } from "@/components/cockpit/rx/inputs/VitalLowConfidenceBadge";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";
import {
  computeGcsTotalFromComponents,
  GCS_COMPONENT_KEYS,
  GCS_TOTAL_KEY,
  type GcsComponentKey,
} from "@/lib/cockpit/gcs-subscore";
import { evaluateRange, categorizeVital } from "@/lib/cockpit/vitals-derive";
import { resolveEffectiveMeasurementProvenance } from "@/lib/cockpit/measurement-context";
import { resolveVitalLowConfidence } from "@/lib/cockpit/vital-confidence";
import {
  vitalFieldShortLabel,
  vitalSparklineLabel,
  VITAL_CELL_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
} from "@/lib/cockpit/vitals-group-layout";
import { resolveVital, type RangeContext, type VitalKey } from "@/lib/cockpit/vitals-schema";

export interface GcsScoreSectionProps {
  visibleKeys?: ReadonlySet<VitalKey>;
  sparklineFor?: (vitalKey: VitalKey, label: string) => React.ReactNode;
  rangeCtx?: RangeContext;
}

function isVisible(key: VitalKey, visibleKeys?: ReadonlySet<VitalKey>): boolean {
  return visibleKeys == null || visibleKeys.has(key);
}

function hasVisibleGcsCluster(visibleKeys?: ReadonlySet<VitalKey>): boolean {
  if (isVisible(GCS_TOTAL_KEY, visibleKeys)) return true;
  return GCS_COMPONENT_KEYS.some((key) => isVisible(key, visibleKeys));
}

function GcsComponentInput({
  componentKey,
  shortLabel,
  value,
  onChange,
}: {
  componentKey: GcsComponentKey;
  shortLabel: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const def = resolveVital(componentKey);
  const unit = def.displayUnits[0]!;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <label htmlFor={componentKey} className="shrink-0 text-[11px] text-muted-foreground">
        {shortLabel}
      </label>
      <GcsCriteriaHelp componentKey={componentKey} variant="inline" />
      <input
        id={componentKey}
        type="number"
        inputMode="numeric"
        min={def.hardMin}
        max={def.hardMax}
        step={unit.step}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-12 shrink-0 py-1 text-xs sm:w-14")}
        aria-label={`${def.label} in ${unit.unit}`}
        data-testid={`gcs-component-${componentKey}`}
      />
      <span className="whitespace-nowrap text-xs text-muted-foreground">{unit.unit}</span>
    </div>
  );
}

const GCS_COMPONENT_SHORT_LABELS: Record<GcsComponentKey, string> = {
  vitalsGcsE: "E",
  vitalsGcsV: "V",
  vitalsGcsM: "M",
};

/** Unified GCS card — total plus inline E/V/M (vit-06). */
export function GcsScoreSection({
  visibleKeys,
  sparklineFor,
  rangeCtx,
}: GcsScoreSectionProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const label = vitalFieldShortLabel(GCS_TOTAL_KEY);
  const totalDef = resolveVital(GCS_TOTAL_KEY);
  const totalUnit = totalDef.displayUnits[0]!;
  const total = state.fields.vitalsGcsTotal;
  const totalFlag = evaluateRange(GCS_TOTAL_KEY, total, rangeCtx);
  const totalCategory = categorizeVital(GCS_TOTAL_KEY, total, rangeCtx);

  const effectiveMeasuredBy = resolveEffectiveMeasurementProvenance(
    state.fields.vitalsMeasurementContext,
    state.fields.vitalsProvenanceOverrides[GCS_TOTAL_KEY],
  ).measuredBy;
  const lowConfidenceReason = resolveVitalLowConfidence({
    measuredBy: effectiveMeasuredBy,
    vitalKey: GCS_TOTAL_KEY,
  });

  const showSection = hasVisibleGcsCluster(visibleKeys);

  useEffect(() => {
    if (!showSection) return;
    const sum = computeGcsTotalFromComponents(
      state.fields.vitalsGcsE,
      state.fields.vitalsGcsV,
      state.fields.vitalsGcsM,
    );
    if (sum == null) return;
    if (state.fields.vitalsGcsTotal === sum) return;
    setField("vitalsGcsTotal", sum);
  }, [
    setField,
    showSection,
    state.fields.vitalsGcsE,
    state.fields.vitalsGcsM,
    state.fields.vitalsGcsTotal,
    state.fields.vitalsGcsV,
  ]);

  if (!showSection) return null;

  return (
    <div className={VITAL_GRID_UNIT_SPAN_CLASS} data-testid="gcs-score-section">
      <div className={VITAL_CELL_CLASS}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={RX_FIELD_LABEL_CLASS}>{label}</span>
          <GcsCriteriaHelp variant="title" />
          <VitalRangeHelp
            kind="vitalsGcsTotal"
            rangeCtx={rangeCtx}
            currentCategory={totalCategory}
          />
          {lowConfidenceReason ? (
            <VitalLowConfidenceBadge
              reason={lowConfidenceReason}
              testId="vital-low-confidence-badge-vitalsGcsTotal"
            />
          ) : null}
          {sparklineFor?.(GCS_TOTAL_KEY, vitalSparklineLabel(GCS_TOTAL_KEY))}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {GCS_COMPONENT_KEYS.map((componentKey) => (
            <GcsComponentInput
              key={componentKey}
              componentKey={componentKey}
              shortLabel={GCS_COMPONENT_SHORT_LABELS[componentKey]}
              value={state.fields[componentKey]}
              onChange={(next) => setField(componentKey, next)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <label
              htmlFor="vitalsGcsTotal"
              className="shrink-0 text-[11px] text-muted-foreground"
            >
              Total
            </label>
            <input
              id="vitalsGcsTotal"
              type="number"
              inputMode="numeric"
              min={totalDef.hardMin}
              max={totalDef.hardMax}
              step={totalUnit.step}
              value={total ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setField("vitalsGcsTotal", null);
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                setField("vitalsGcsTotal", n);
              }}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-14 shrink-0 py-1 text-xs sm:w-16")}
              aria-label={`${label} in ${totalUnit.unit}`}
              data-testid="gcs-total-input"
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {totalUnit.unit}
            </span>
          </div>
          <RangeFlagIcon label={label} flag={totalFlag} category={totalCategory} />
        </div>

        <VitalContextFields
          parentKey={GCS_TOTAL_KEY}
          noteKey={GCS_TOTAL_KEY}
          noteLabel={label}
        />
      </div>
    </div>
  );
}
