"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { resolveVital, type VitalKey } from "@/lib/cockpit/vitals-schema";
import {
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

const PUPIL_SIZE_KEYS = [
  { key: "vitalsPupilSizeLeftMm" as const, short: "L" },
  { key: "vitalsPupilSizeRightMm" as const, short: "R" },
];

export interface ExamCnsPupilsFieldProps {
  disabled?: boolean;
}

/**
 * Pupil size captured inside the CNS exam card, bound to the canonical vitals
 * fields (`vitalsPupilSizeLeftMm/RightMm`) so it stays the single source of
 * truth. Mirrors the GCS field; reactivity/shape is captured on the
 * Eye-movements & pupils card.
 */
export function ExamCnsPupilsField({ disabled = false }: ExamCnsPupilsFieldProps) {
  const { state, setField } = useRxForm();

  function setSize(key: VitalKey, raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField(key, null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField(key, next);
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="cns-pupils-fields"
    >
      <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>Pupil size</span>
      {PUPIL_SIZE_KEYS.map(({ key, short }) => {
        const def = resolveVital(key);
        return (
          <div key={key} className="flex shrink-0 items-center gap-1">
            <label htmlFor={`cns-${key}`} className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
              {short}
            </label>
            <input
              id={`cns-${key}`}
              type="number"
              inputMode="decimal"
              min={def.hardMin}
              max={def.hardMax}
              step={0.5}
              value={state.fields[key] ?? ""}
              onChange={(event) => setSize(key, event.target.value)}
              disabled={disabled}
              placeholder="—"
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-14 py-1 text-xs")}
              aria-label={def.label}
              data-testid={`cns-pupil-${key}`}
            />
            <span className={RX_EXAM_FIELD_LABEL_CLASS}>mm</span>
          </div>
        );
      })}
    </div>
  );
}
