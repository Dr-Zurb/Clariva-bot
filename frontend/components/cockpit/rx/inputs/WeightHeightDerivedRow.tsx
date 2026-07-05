"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DerivedVitalsHelp } from "@/components/cockpit/rx/inputs/DerivedVitalsHelp";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  BMI_DISPLAY_LABEL,
  BMI_FORMULA,
  BSA_CLINICAL_NOTE,
  BSA_DISPLAY_LABEL,
  BSA_MOSTELLER_FORMULA,
  DERIVED_VITALS_CARD_LABEL,
  type BmiResult,
} from "@/lib/cockpit/bmi";
import {
  VITAL_CELL_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
} from "@/lib/cockpit/vitals-group-layout";
import type { VitalKey } from "@/lib/cockpit/vitals-schema";

// BMI category colors — intentionally not semantic tokens (cpv-03 / cpv-06).
// See frontend/lib/cockpit/__color-exceptions.md
const categoryClass: Record<BmiResult["category"], string> = {
  underweight: "bg-blue-100 text-blue-800 border-blue-300",
  normal: "bg-green-100 text-green-800 border-green-300",
  overweight: "bg-amber-100 text-amber-800 border-amber-300",
  obese: "bg-red-100 text-red-800 border-red-300",
};

export function BmiBadge({ bmi }: { bmi: BmiResult }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
            categoryClass[bmi.category]
          }
          aria-label={`${BMI_DISPLAY_LABEL} ${bmi.value} — ${bmi.label}`}
          data-testid="bmi-badge"
        >
          BMI {bmi.value}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[14rem]">
        <p className="font-medium">{bmi.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{BMI_FORMULA}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click ? next to the title for full WHO ranges.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function BsaBadge({ bsa }: { bsa: number }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          aria-label={`${BSA_DISPLAY_LABEL} ${bsa} square metres`}
          data-testid="bsa-badge"
        >
          BSA {bsa}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[14rem]">
        <p className="font-medium">
          {BSA_DISPLAY_LABEL} {bsa} m²
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{BSA_MOSTELLER_FORMULA}</p>
        <p className="mt-1 text-xs text-muted-foreground">{BSA_CLINICAL_NOTE}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export interface WeightHeightDerivedRowProps {
  bmi: BmiResult | null;
  bsa: number | null;
  bmiSparkline?: React.ReactNode;
}

export function shouldShowWeightHeightDerivedRow(
  visibleNumericKeys: ReadonlySet<VitalKey>,
  bmi: BmiResult | null,
  bsa: number | null,
): boolean {
  if (!visibleNumericKeys.has("vitalsWtKg") || !visibleNumericKeys.has("vitalsHtCm")) {
    return false;
  }
  return bmi != null || bsa != null;
}

/** Read-only BMI/BSA card — one grid column beside Height (not full-width). */
export function WeightHeightDerivedRow({
  bmi,
  bsa,
  bmiSparkline,
}: WeightHeightDerivedRowProps): JSX.Element {
  return (
    <div className={VITAL_GRID_UNIT_SPAN_CLASS} data-testid="weight-height-derived-row">
      <div className={VITAL_CELL_CLASS}>
        <div className="flex items-center gap-1.5">
          <span className={RX_FIELD_LABEL_CLASS}>{DERIVED_VITALS_CARD_LABEL}</span>
          <DerivedVitalsHelp />
          {bmiSparkline}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bmi ? <BmiBadge bmi={bmi} /> : null}
          {bsa != null ? <BsaBadge bsa={bsa} /> : null}
        </div>
      </div>
    </div>
  );
}
