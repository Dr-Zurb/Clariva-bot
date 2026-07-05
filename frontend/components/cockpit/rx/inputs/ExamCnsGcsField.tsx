"use client";

import { useEffect } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { GcsCriteriaHelp } from "@/components/cockpit/rx/inputs/GcsCriteriaHelp";
import {
  computeGcsTotalFromComponents,
  GCS_COMPONENT_KEYS,
  GCS_TOTAL_KEY,
  type GcsComponentKey,
} from "@/lib/cockpit/gcs-subscore";
import { resolveVital } from "@/lib/cockpit/vitals-schema";
import {
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

const GCS_COMPONENT_SHORT_LABELS: Record<GcsComponentKey, string> = {
  vitalsGcsE: "E",
  vitalsGcsV: "V",
  vitalsGcsM: "M",
};

export interface ExamCnsGcsFieldProps {
  disabled?: boolean;
}

/**
 * GCS captured inside the CNS exam card, but bound to the canonical vitals
 * fields (`vitalsGcsE/V/M` + auto-summed `vitalsGcsTotal`) so it stays the
 * single source of truth for trends, categorization, and templates. Mirrors the
 * Respiratory section's RR/SpO₂ block, which reads/writes vitals directly.
 */
export function ExamCnsGcsField({ disabled = false }: ExamCnsGcsFieldProps) {
  const { state, setField } = useRxForm();
  const total = state.fields.vitalsGcsTotal;
  const totalDef = resolveVital(GCS_TOTAL_KEY);

  useEffect(() => {
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
    state.fields.vitalsGcsE,
    state.fields.vitalsGcsV,
    state.fields.vitalsGcsM,
    state.fields.vitalsGcsTotal,
  ]);

  function setComponent(key: GcsComponentKey, raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField(key, null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField(key, next);
  }

  function setTotal(raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField(GCS_TOTAL_KEY, null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField(GCS_TOTAL_KEY, next);
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="cns-gcs-fields"
    >
      <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>GCS</span>
      {GCS_COMPONENT_KEYS.map((key) => {
        const def = resolveVital(key);
        return (
          <div key={key} className="flex shrink-0 items-center gap-1">
            <label htmlFor={`cns-${key}`} className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
              {GCS_COMPONENT_SHORT_LABELS[key]}
            </label>
            <GcsCriteriaHelp componentKey={key} variant="inline" />
            <input
              id={`cns-${key}`}
              type="number"
              inputMode="numeric"
              min={def.hardMin}
              max={def.hardMax}
              value={state.fields[key] ?? ""}
              onChange={(event) => setComponent(key, event.target.value)}
              disabled={disabled}
              placeholder="—"
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-12 py-1 text-xs")}
              aria-label={def.label}
              data-testid={`cns-gcs-${key}`}
            />
          </div>
        );
      })}
      <div className="flex shrink-0 items-center gap-1">
        <label htmlFor="cns-vitalsGcsTotal" className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
          Total
        </label>
        <input
          id="cns-vitalsGcsTotal"
          type="number"
          inputMode="numeric"
          min={totalDef.hardMin}
          max={totalDef.hardMax}
          value={total ?? ""}
          onChange={(event) => setTotal(event.target.value)}
          disabled={disabled}
          placeholder="—"
          className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-14 py-1 text-xs")}
          aria-label={totalDef.label}
          data-testid="cns-gcs-total"
        />
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>/15</span>
      </div>
    </div>
  );
}
