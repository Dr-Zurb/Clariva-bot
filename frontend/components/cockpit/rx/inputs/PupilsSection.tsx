"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { CategoricalVitalSelect } from "@/components/cockpit/rx/inputs/CategoricalVitalSelect";
import { VitalNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";
import { RangeFlagIcon } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { VitalContextFields } from "@/components/cockpit/rx/inputs/VitalContextFields";
import { VitalLowConfidenceBadge } from "@/components/cockpit/rx/inputs/VitalLowConfidenceBadge";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import type { CategoricalVitalKey } from "@/lib/cockpit/categorical-vitals-schema";
import { resolveEffectiveMeasurementProvenance } from "@/lib/cockpit/measurement-context";
import {
  PUPIL_CLUSTER_MENU_KEY,
  PUPIL_CLUSTER_MENU_LABEL,
  PUPIL_CLUSTER_SIDES,
  PUPIL_REACTIVITY_KEYS,
  PUPIL_SIZE_KEYS,
  type PupilSizeKey,
} from "@/lib/cockpit/pupil-cluster";
import { evaluateRange, categorizeVital } from "@/lib/cockpit/vitals-derive";
import { resolveVitalLowConfidence } from "@/lib/cockpit/vital-confidence";
import {
  VITAL_CELL_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
  isCategoricalVitalVisible,
  isVitalVisible,
} from "@/lib/cockpit/vitals-group-layout";
import { resolveVital, type RangeContext, type VitalKey } from "@/lib/cockpit/vitals-schema";
import { cn } from "@/lib/utils";

export interface PupilsSectionProps {
  visibleNumericKeys?: ReadonlySet<VitalKey>;
  visibleCategoricalKeys?: ReadonlySet<CategoricalVitalKey>;
  rangeCtx?: RangeContext;
}

export function hasVisiblePupilCluster(
  visibleNumericKeys?: ReadonlySet<VitalKey>,
  visibleCategoricalKeys?: ReadonlySet<CategoricalVitalKey>,
): boolean {
  if (PUPIL_SIZE_KEYS.some((key) => isVitalVisible(key, visibleNumericKeys))) return true;
  return PUPIL_REACTIVITY_KEYS.some((key) =>
    isCategoricalVitalVisible(key, visibleCategoricalKeys),
  );
}

function PupilSizeInput({ sizeKey }: { sizeKey: PupilSizeKey }): JSX.Element {
  const { state, setField } = useRxForm();
  const def = resolveVital(sizeKey);
  const unit = def.displayUnits[0]!;
  const value = state.fields[sizeKey];

  return (
    <input
      id={sizeKey}
      type="number"
      inputMode="decimal"
      min={def.hardMin}
      max={def.hardMax}
      step={unit.step}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          setField(sizeKey, null);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        setField(sizeKey, n);
      }}
      className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-14 shrink-0 py-1 text-xs sm:w-16")}
      aria-label={`${def.label} in ${unit.unit}`}
      data-testid={`pupil-size-${sizeKey}`}
    />
  );
}

/** Unified pupils card — L/R size (mm) + reactivity (vit-06). */
export function PupilsSection({
  visibleNumericKeys,
  visibleCategoricalKeys,
  rangeCtx,
}: PupilsSectionProps): JSX.Element | null {
  const { state } = useRxForm();

  const showSection = hasVisiblePupilCluster(visibleNumericKeys, visibleCategoricalKeys);
  if (!showSection) return null;

  const effectiveMeasuredBy = resolveEffectiveMeasurementProvenance(
    state.fields.vitalsMeasurementContext,
    state.fields.vitalsProvenanceOverrides[PUPIL_CLUSTER_MENU_KEY],
  ).measuredBy;

  return (
    <div className={VITAL_GRID_UNIT_SPAN_CLASS} data-testid="pupils-section">
      <div className={VITAL_CELL_CLASS}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={RX_FIELD_LABEL_CLASS}>{PUPIL_CLUSTER_MENU_LABEL}</span>
        </div>

        <div className="space-y-1.5">
          {PUPIL_CLUSTER_SIDES.map(({ sideLabel, sizeKey, reactivityKey }) => {
            const sizeDef = resolveVital(sizeKey);
            const unit = sizeDef.displayUnits[0]!;
            const sizeValue = state.fields[sizeKey];
            const sizeFlag = evaluateRange(sizeKey, sizeValue, rangeCtx);
            const sizeCategory = categorizeVital(sizeKey, sizeValue, rangeCtx);
            const lowConfidenceReason = resolveVitalLowConfidence({
              measuredBy: effectiveMeasuredBy,
              vitalKey: sizeKey,
            });

            return (
              <div
                key={sizeKey}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                data-testid={`pupil-row-${sideLabel.toLowerCase()}`}
              >
                <span className="w-4 shrink-0 text-[11px] font-medium text-muted-foreground">
                  {sideLabel}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <label
                    htmlFor={sizeKey}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    Size
                  </label>
                  <PupilSizeInput sizeKey={sizeKey} />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {unit.unit}
                  </span>
                  <RangeFlagIcon label={sizeDef.label} flag={sizeFlag} category={sizeCategory} />
                </div>
                {lowConfidenceReason ? (
                  <VitalLowConfidenceBadge
                    reason={lowConfidenceReason}
                    testId={`vital-low-confidence-badge-${sizeKey}`}
                  />
                ) : null}
                <CategoricalVitalSelect vitalKey={reactivityKey} variant="inline" />
                <VitalNoteField noteKey={sizeKey} label={`${sideLabel} pupil size`} />
                <VitalNoteField noteKey={reactivityKey} label={`${sideLabel} pupil reactivity`} />
              </div>
            );
          })}
        </div>

        <VitalContextFields parentKey={PUPIL_CLUSTER_MENU_KEY} />
      </div>
    </div>
  );
}
