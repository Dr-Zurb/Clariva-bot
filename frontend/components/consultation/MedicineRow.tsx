"use client";

import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
import {
  DOSE_UNIT_OPTIONS,
  DURATION_UNIT_OPTIONS,
  FOOD_TIMING_OPTIONS,
  FREQUENCY_OPTIONS,
  ROUTE_OPTIONS,
  durationUnitTakesValue,
  formatDurationLegacyLabel,
  formatMedicineSigLine,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";
import { chartOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";

export interface MedicineRowValue {
  medicineName: string;
  /** Strength text (e.g. "5 mg"). Legacy free-text — also rendered into the PDF / SMS */
  dosage: string;
  /** Legacy free-text route — also rendered into the PDF / SMS */
  route: string;
  /** Legacy free-text frequency — also rendered into the PDF / SMS */
  frequency: string;
  /** Legacy free-text duration — also rendered into the PDF / SMS */
  duration: string;
  instructions: string;
  /**
   * Drug-master FK populated when the doctor picks a row from the
   * autocomplete. Free-text entries leave this null. Persisted to
   * `prescription_medicines.drug_master_id` (T2.9 / migration 090).
   */
  drugMasterId: string | null;
  // EHR Sub-batch B1 / T2.9 — structured columns. NULL when the doctor
  // hasn't picked a structured value (legacy free-text path).
  frequencyCode: FrequencyCode | null;
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  routeCode: RouteCode | null;
  // Migration 133 — dose details (medicine card redesign). NULL on rows
  // saved before the redesign.
  doseQty: number | null;
  doseUnit: DoseUnit | null;
  form: string | null;
  foodTiming: FoodTiming | null;
}

interface MedicineRowProps {
  index: number;
  value: MedicineRowValue;
  /**
   * Field-by-field free-text update path. Used by the medicine-name
   * autocomplete + legacy CUSTOM/other text inputs + the dosage input
   * + the instructions input. Structured fields go through `onPatch`
   * instead so multi-field updates land in a single setState.
   */
  onChange: (index: number, field: string, value: string) => void;
  /**
   * EHR Sub-batch B1 / T2.10 — atomic multi-field update path. Used by
   * the structured pickers so a single user action (e.g. picking BID)
   * can write both `frequencyCode` and the legacy mirror `frequency`
   * in a single setState (no flicker, no autosave-thrash).
   */
  onPatch: (index: number, patch: Partial<MedicineRowValue>) => void;
  onRemove: (index: number) => void;
  /**
   * EHR Sub-batch B1 / T2.8 — fired when the doctor picks a row from
   * <DrugAutocomplete>. The parent should merge the picked drug into
   * its medicines state in a single setState call.
   */
  onMedicineSelect?: (index: number, drug: DrugMasterRow) => void;
  /** Auth token forwarded to <DrugAutocomplete> for the search request. */
  token: string;
  disabled?: boolean;
  /**
   * R-RX-POLISH/2.1 (rxd-02): when false (and the row is `isMedicineRowComplete`),
   * render the compact summary line instead of the full editor. When true OR the
   * row is incomplete, render today's existing editor UI unchanged.
   *
   * Defaults to `true` to preserve legacy single-state behavior for callers that
   * haven't opted in (e.g. existing tests or non-cockpit mounts that haven't
   * been retrofitted with the parent active-row tracking).
   */
  isEditing?: boolean;
  /** Fired when the doctor taps the summary row (or presses Enter/Space on it). */
  onRequestEdit?: (index: number) => void;
  /** Fired when the row should collapse (Esc, blur-to-outside, sibling-tapped). */
  onRequestCollapse?: (index: number) => void;
  /**
   * When true, complete rows render an untappable summary recap (ended visit).
   * Incomplete rows still render the editor with `disabled` applied.
   */
  isReadOnly?: boolean;
  /** Passed through to the summary drag handle (DL-7). */
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
}

interface MedicineRowSummaryProps {
  index: number;
  value: MedicineRowValue;
  readOnly?: boolean;
  onRequestEdit?: (index: number) => void;
  onRemove?: (index: number) => void;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
}

function MedicineRowSummary({
  index,
  value,
  readOnly = false,
  onRequestEdit,
  onRemove,
  dragHandleProps,
}: MedicineRowSummaryProps) {
  const sigLine = formatMedicineSigLine(value);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRequestEdit?.(index);
    }
  }

  return (
    <div
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => onRequestEdit?.(index)}
      onKeyDown={readOnly ? undefined : handleKeyDown}
      className="group flex h-11 items-center gap-2 rounded-md border border-border bg-card px-2 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring data-[readonly=true]:hover:bg-card"
      aria-label={
        readOnly
          ? `Medicine row ${index + 1}`
          : `Medicine row ${index + 1} — tap to edit`
      }
      data-readonly={readOnly || undefined}
    >
      <div
        {...dragHandleProps}
        className="cursor-grab text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
        {value.form ? (
          <span className="shrink-0 text-xs capitalize text-muted-foreground">
            {value.form}
          </span>
        ) : null}
        <span className="truncate font-medium">{value.medicineName}</span>
        {sigLine ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="truncate text-muted-foreground">{sigLine}</span>
          </>
        ) : null}
      </div>

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestEdit?.(index);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Edit medicine row"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(index);
            }}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete medicine row"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

/** Label + chip-row line inside the editor card. */
function EditorFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
    </div>
  );
}

const EDITOR_INPUT_CLASS =
  "h-8 rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50";

/** Short chip labels for frequency codes (long form goes in `title`). */
const FREQUENCY_CHIP_LABELS: Record<FrequencyCode, string> = {
  OD: "OD",
  BID: "BID",
  TID: "TID",
  QID: "QID",
  QHS: "HS",
  PRN: "PRN",
  STAT: "STAT",
  CUSTOM: "Custom\u2026",
};

/**
 * Single medicine card for the prescription form (medicine card
 * redesign — chip-based editor matching the chief-complaint /
 * condition-card pattern).
 *
 * Structured chips (dose unit, frequency, duration, food timing) write
 * both the structured columns and the legacy free-text mirrors
 * (`frequency` / `duration` / `route`) so older readers (PDF, SMS,
 * viewer pre-T3) keep working unchanged (Decision T2-D4).
 *
 * Escape hatches:
 *   - Frequency: "Custom…" chip → reveals free-text input bound to the
 *     legacy `frequency` column (`frequencyCode = 'CUSTOM'`).
 *   - Route: "Other…" option → free-text input bound to legacy `route`.
 */
export default function MedicineRow({
  index,
  value,
  onChange,
  onPatch,
  onRemove,
  onMedicineSelect,
  token,
  disabled,
  isEditing = true,
  onRequestEdit,
  onRequestCollapse,
  isReadOnly = false,
  dragHandleProps,
}: MedicineRowProps) {
  const rowDisabled = disabled || isReadOnly;
  const shouldShowSummary =
    isMedicineRowComplete(value) && (isReadOnly || isEditing === false);

  if (shouldShowSummary) {
    return (
      <MedicineRowSummary
        index={index}
        value={value}
        readOnly={isReadOnly}
        onRequestEdit={onRequestEdit}
        onRemove={onRemove}
        dragHandleProps={dragHandleProps}
      />
    );
  }

  // ---- dose (qty + unit chips) ---------------------------------------------

  const handleDoseQty = (raw: string) => {
    if (raw === "") {
      onPatch(index, { doseQty: null });
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n <= 0) return;
    onPatch(index, { doseQty: n });
  };

  const handleDoseUnit = (unit: DoseUnit) => {
    if (value.doseUnit === unit) {
      onPatch(index, { doseUnit: null });
      return;
    }
    onPatch(index, { doseUnit: unit });
  };

  // ---- frequency chips ------------------------------------------------------

  const handleFrequencyChip = (code: FrequencyCode) => {
    if (value.frequencyCode === code) {
      onPatch(index, { frequencyCode: null, frequency: "" });
      return;
    }
    if (code === "CUSTOM") {
      // Keep any existing free-text the doctor already typed.
      onPatch(index, { frequencyCode: "CUSTOM" });
      return;
    }
    onPatch(index, {
      frequencyCode: code,
      frequency: getFrequencyLegacyLabel(code),
    });
  };

  // ---- duration (value + unit chips) ----------------------------------------

  const handleDurationUnit = (unit: DurationUnit) => {
    if (value.durationUnit === unit) {
      onPatch(index, { durationUnit: null, duration: "" });
      return;
    }
    if (!durationUnitTakesValue(unit)) {
      // 'until-finished' / 'continue' — no numeric value.
      onPatch(index, {
        durationUnit: unit,
        durationValue: null,
        duration: formatDurationLegacyLabel(null, unit),
      });
      return;
    }
    // Keep the existing numeric value; refresh the legacy label.
    onPatch(index, {
      durationUnit: unit,
      duration: formatDurationLegacyLabel(value.durationValue, unit),
    });
  };

  const handleDurationValue = (raw: string) => {
    if (raw === "") {
      onPatch(index, {
        durationValue: null,
        duration: value.durationUnit
          ? formatDurationLegacyLabel(null, value.durationUnit)
          : "",
      });
      return;
    }
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n <= 0) return; // ignore garbage; input enforces >0
    onPatch(index, {
      durationValue: n,
      duration: formatDurationLegacyLabel(n, value.durationUnit),
    });
  };

  // ---- food timing chips -----------------------------------------------------

  const handleFoodTiming = (code: FoodTiming) => {
    onPatch(index, { foodTiming: value.foodTiming === code ? null : code });
  };

  // ---- route picker -----------------------------------------------------------

  const handleRouteCode = (code: RouteCode | "") => {
    if (code === "") {
      onPatch(index, { routeCode: null, route: "" });
      return;
    }
    if (code === "other") {
      // Keep any existing free-text route.
      onPatch(index, { routeCode: "other" });
      return;
    }
    onPatch(index, {
      routeCode: code,
      route: getRouteLegacyLabel(code),
    });
  };

  const showFrequencyCustomInput = value.frequencyCode === "CUSTOM";
  const showRouteOtherInput = value.routeCode === "other";
  const durationTakesValue =
    value.durationUnit === null || durationUnitTakesValue(value.durationUnit);

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && isMedicineRowComplete(value)) {
          onRequestCollapse?.(index);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (isMedicineRowComplete(value)) {
            onRequestCollapse?.(index);
          }
        }
      }}
    >
      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        {/* Name + strength + remove */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`med-name-${index}`} className="sr-only">
              Medicine name
            </label>
            <DrugAutocomplete
              inputId={`med-name-${index}`}
              value={value.medicineName}
              onChange={(text) => onChange(index, "medicineName", text)}
              onSelect={(drug) => onMedicineSelect?.(index, drug)}
              token={token}
              placeholder="Medicine name"
              disabled={rowDisabled}
            />
          </div>
          <div>
            <label htmlFor={`med-dosage-${index}`} className="sr-only">
              Dosage
            </label>
            <input
              id={`med-dosage-${index}`}
              type="text"
              value={value.dosage}
              onChange={(e) => onChange(index, "dosage", e.target.value)}
              placeholder="Strength"
              className={`${EDITOR_INPUT_CLASS} w-24`}
              maxLength={100}
              disabled={rowDisabled}
            />
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={rowDisabled}
            className="h-8 w-8 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive disabled:opacity-50"
            aria-label={`Remove medicine ${index + 1}`}
          >
            <Trash2 className="mx-auto h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Dose: qty + unit chips */}
        <EditorFieldRow label="Dose">
          <label htmlFor={`med-dose-qty-${index}`} className="sr-only">
            Dose quantity
          </label>
          <input
            id={`med-dose-qty-${index}`}
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={value.doseQty ?? ""}
            onChange={(e) => handleDoseQty(e.target.value)}
            placeholder="#"
            className={`${EDITOR_INPUT_CLASS} w-[4.25rem]`}
            disabled={rowDisabled}
          />
          <div
            role="group"
            aria-label="Dose unit"
            className="flex flex-wrap gap-1"
          >
            {DOSE_UNIT_OPTIONS.map((opt) => (
              <button
                key={opt.unit}
                type="button"
                onClick={() => handleDoseUnit(opt.unit)}
                disabled={rowDisabled}
                aria-pressed={value.doseUnit === opt.unit}
                className={chartOptionChipClass(value.doseUnit === opt.unit)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </EditorFieldRow>

        {/* Frequency chips */}
        <EditorFieldRow label="Frequency">
          <div
            role="group"
            aria-label="Frequency"
            className="flex flex-wrap gap-1"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleFrequencyChip(opt.code)}
                disabled={rowDisabled}
                aria-pressed={value.frequencyCode === opt.code}
                title={opt.label}
                className={chartOptionChipClass(value.frequencyCode === opt.code)}
              >
                {FREQUENCY_CHIP_LABELS[opt.code]}
              </button>
            ))}
          </div>
        </EditorFieldRow>
        {showFrequencyCustomInput && (
          <EditorFieldRow label="">
            <label htmlFor={`med-frequency-custom-${index}`} className="sr-only">
              Custom frequency
            </label>
            <input
              id={`med-frequency-custom-${index}`}
              type="text"
              value={value.frequency}
              onChange={(e) => onChange(index, "frequency", e.target.value)}
              placeholder="e.g. Every 6 hours after meals"
              className={`${EDITOR_INPUT_CLASS} w-full`}
              maxLength={100}
              disabled={rowDisabled}
            />
          </EditorFieldRow>
        )}

        {/* Duration: value + unit chips */}
        <EditorFieldRow label="Duration">
          <label htmlFor={`med-duration-value-${index}`} className="sr-only">
            Duration value
          </label>
          <input
            id={`med-duration-value-${index}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={value.durationValue ?? ""}
            onChange={(e) => handleDurationValue(e.target.value)}
            placeholder="#"
            className={`${EDITOR_INPUT_CLASS} w-[4.25rem] ${
              durationTakesValue ? "" : "invisible"
            }`}
            disabled={rowDisabled || !durationTakesValue}
            aria-hidden={!durationTakesValue}
          />
          <div
            role="group"
            aria-label="Duration unit"
            className="flex flex-wrap gap-1"
          >
            {DURATION_UNIT_OPTIONS.map((opt) => (
              <button
                key={opt.unit}
                type="button"
                onClick={() => handleDurationUnit(opt.unit)}
                disabled={rowDisabled}
                aria-pressed={value.durationUnit === opt.unit}
                className={chartOptionChipClass(value.durationUnit === opt.unit)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </EditorFieldRow>

        {/* Food timing chips */}
        <EditorFieldRow label="Food">
          <div
            role="group"
            aria-label="Food timing"
            className="flex flex-wrap gap-1"
          >
            {FOOD_TIMING_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleFoodTiming(opt.code)}
                disabled={rowDisabled}
                aria-pressed={value.foodTiming === opt.code}
                className={chartOptionChipClass(value.foodTiming === opt.code)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </EditorFieldRow>

        {/* Route + notes */}
        <div className="flex items-center gap-2">
          <label htmlFor={`med-route-code-${index}`} className="sr-only">
            Route
          </label>
          <select
            id={`med-route-code-${index}`}
            value={value.routeCode ?? ""}
            onChange={(e) => handleRouteCode(e.target.value as RouteCode | "")}
            className={`${EDITOR_INPUT_CLASS} w-28 bg-background`}
            disabled={rowDisabled}
          >
            <option value="">Route…</option>
            {ROUTE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
          {showRouteOtherInput && (
            <>
              <label htmlFor={`med-route-other-${index}`} className="sr-only">
                Other route
              </label>
              <input
                id={`med-route-other-${index}`}
                type="text"
                value={value.route}
                onChange={(e) => onChange(index, "route", e.target.value)}
                placeholder="e.g. Buccal"
                className={`${EDITOR_INPUT_CLASS} w-28`}
                maxLength={100}
                disabled={rowDisabled}
              />
            </>
          )}
          <label htmlFor={`med-instructions-${index}`} className="sr-only">
            Instructions
          </label>
          <input
            id={`med-instructions-${index}`}
            type="text"
            value={value.instructions}
            onChange={(e) => onChange(index, "instructions", e.target.value)}
            placeholder="Notes (e.g. avoid face, with plenty of water)"
            className={`${EDITOR_INPUT_CLASS} min-w-0 flex-1`}
            maxLength={100}
            disabled={rowDisabled}
          />
        </div>
      </div>
    </div>
  );
}
