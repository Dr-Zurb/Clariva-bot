"use client";

import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { VitalProvenanceOverride } from "@/components/cockpit/rx/inputs/VitalProvenanceOverride";
import { VitalNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";
import {
  VITAL_CELL_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
} from "@/lib/cockpit/vitals-group-layout";
import type { CustomVitalDef } from "@/lib/cockpit/vitals-custom";
import { VitalTrendButton } from "@/components/cockpit/rx/objective/VitalTrendButton";
import type { CustomVitalTrendSeries } from "@/lib/cockpit/custom-vitals-trends";

export interface CustomVitalFieldProps {
  def: CustomVitalDef;
  value: number | string | null;
  onChange: (value: number | string | null) => void;
  disabled?: boolean;
  /** Read-only trend trigger for numeric customs with prior history. */
  trendSeries?: CustomVitalTrendSeries | null;
  trendsLoading?: boolean;
}

/**
 * vit-14: per-visit input for a doctor-authored custom vital — same card chrome
 * and field styling as shipped `VitalField` cells.
 */
export function CustomVitalField({
  def,
  value,
  onChange,
  disabled = false,
  trendSeries = null,
  trendsLoading = false,
}: CustomVitalFieldProps) {
  const inputId = `custom-vital-${def.id}`;
  const stringValue = value == null ? "" : String(value);

  return (
    <div className={VITAL_GRID_UNIT_SPAN_CLASS} data-testid={`custom-vital-field-${def.id}`}>
      <div className={VITAL_CELL_CLASS}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={RX_FIELD_LABEL_CLASS}>{def.label}</span>
          {def.kind === "numeric" && trendSeries && trendSeries.points.length > 0 ? (
            <VitalTrendButton
              customSeries={trendSeries}
              label={def.label}
              isLoading={trendsLoading}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[5.5rem] shrink-0 items-center gap-1.5">
            <input
              id={inputId}
              type={def.kind === "numeric" ? "number" : "text"}
              inputMode={def.kind === "numeric" ? "decimal" : undefined}
              value={stringValue}
              disabled={disabled}
              aria-label={def.label}
              data-testid={`custom-vital-input-${def.id}`}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  onChange(null);
                  return;
                }
                if (def.kind === "numeric") {
                  const n = Number(raw);
                  onChange(Number.isFinite(n) ? n : null);
                  return;
                }
                onChange(raw);
              }}
              className={`${RX_FIELD_INPUT_CLASS} mt-0 w-full max-w-[8rem]`}
            />
            {def.kind === "numeric" && def.unit ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground">{def.unit}</span>
            ) : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <VitalNoteField noteKey={def.id} label={def.label} />
          <VitalProvenanceOverride vitalKey={def.id} />
        </div>
      </div>
    </div>
  );
}

export interface CustomVitalsGridFieldsProps {
  defs: readonly CustomVitalDef[];
  values: Record<string, number | string | null>;
  onChange: (id: string, value: number | string | null) => void;
  disabled?: boolean;
  byCustomTrendId?: Readonly<Record<string, CustomVitalTrendSeries>>;
  trendsLoading?: boolean;
}

/** Render a list of custom vitals as grid cells (group-interleaved by caller). */
export function CustomVitalsGridFields({
  defs,
  values,
  onChange,
  disabled = false,
  byCustomTrendId,
  trendsLoading = false,
}: CustomVitalsGridFieldsProps): JSX.Element {
  return (
    <>
      {defs.map((def) => (
        <CustomVitalField
          key={def.id}
          def={def}
          value={values[def.id] ?? null}
          disabled={disabled}
          trendSeries={byCustomTrendId?.[def.id] ?? null}
          trendsLoading={trendsLoading}
          onChange={(next) => onChange(def.id, next)}
        />
      ))}
    </>
  );
}
