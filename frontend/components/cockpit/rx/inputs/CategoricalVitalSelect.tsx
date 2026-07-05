"use client";

import { useRxForm, type RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  categoricalVitalSelectMinWidthCh,
  resolveCategoricalVital,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { cn } from "@/lib/utils";
import { VitalNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";

export interface CategoricalVitalSelectProps {
  vitalKey: CategoricalVitalKey;
  /** `inline` — compact select under a parent numeric vital; `block` — standalone cell. */
  variant?: "block" | "inline";
  /** Override inline label styling (e.g. exam CVS pulse rhythm row). */
  inlineLabelClassName?: string;
}

const INLINE_CONTEXT_LABELS: Partial<Record<CategoricalVitalKey, string>> = {
  vitalsO2DeliveryMethod: "On",
  vitalsSpo2Device: "Device",
  vitalsPulseRhythm: "Rhythm",
  vitalsHrSource: "From",
  vitalsTempSite: "Site",
  vitalsTempDevice: "Device",
  vitalsGlucoseTiming: "Timing",
  vitalsGlucoseDevice: "Device",
  vitalsPupilReactivityLeft: "React.",
  vitalsPupilReactivityRight: "React.",
};

/** Registry-driven plain select — stores enum `value`, not display label (obj-07 / vit-06). */
export function CategoricalVitalSelect({
  vitalKey,
  variant = "block",
  inlineLabelClassName,
}: CategoricalVitalSelectProps): JSX.Element {
  const { state, setField } = useRxForm();
  const def = resolveCategoricalVital(vitalKey);
  const inlineLabel = INLINE_CONTEXT_LABELS[vitalKey] ?? def.label;
  const inlineSelectMinCh = categoricalVitalSelectMinWidthCh(def);

  if (variant === "inline") {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <label
          htmlFor={vitalKey}
          className={cn("shrink-0 text-[11px] text-muted-foreground", inlineLabelClassName)}
        >
          {inlineLabel}
        </label>
        <select
          id={vitalKey}
          value={state.fields[vitalKey] ?? ""}
          onChange={(e) =>
            setField(
              vitalKey,
              (e.target.value || null) as RxFormFields[typeof vitalKey],
            )
          }
          className={cn(
            RX_FIELD_INPUT_CLASS,
            "mt-0 h-7 w-auto max-w-full py-1 text-xs",
          )}
          style={{ minWidth: `${inlineSelectMinCh}ch` }}
          aria-label={def.label}
          data-testid={`vital-context-${vitalKey}`}
        >
          <option value="">—</option>
          {def.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={vitalKey} className={RX_FIELD_LABEL_CLASS}>
        {def.label}
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <select
          id={vitalKey}
          value={state.fields[vitalKey] ?? ""}
          onChange={(e) =>
            setField(
              vitalKey,
              (e.target.value || null) as RxFormFields[typeof vitalKey],
            )
          }
          className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-auto max-w-full py-1 text-xs")}
          style={{ minWidth: `${inlineSelectMinCh}ch` }}
          aria-label={def.label}
        >
          <option value="">—</option>
          {def.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <VitalNoteField noteKey={vitalKey} label={def.label} />
      </div>
    </div>
  );
}
