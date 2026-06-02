"use client";

import type { HTMLAttributes, KeyboardEvent } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  DurationUnit,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
import {
  DURATION_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  ROUTE_OPTIONS,
  durationUnitTakesValue,
  formatDurationLegacyLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";

export interface MedicineRowValue {
  medicineName: string;
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
  const frequencyShort =
    value.frequencyCode != null
      ? getFrequencyLegacyLabel(value.frequencyCode)
      : value.frequency;
  const durationShort =
    value.durationValue != null && value.durationUnit != null
      ? formatDurationLegacyLabel(value.durationValue, value.durationUnit)
      : value.duration;

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
        <span className="truncate font-medium">{value.medicineName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap">{value.dosage}</span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap text-muted-foreground">
          {frequencyShort}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="whitespace-nowrap text-muted-foreground">
          {durationShort}
        </span>
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

/**
 * Single medicine row for prescription form.
 *
 * EHR Sub-batch B1 / T2.10 — frequency, duration, route are now
 * structured pickers. Selecting a structured value also writes a
 * canonical human-readable label into the legacy `frequency` /
 * `duration` / `route` columns so older readers (PDF, SMS, viewer
 * pre-T3) keep working unchanged (Decision T2-D4).
 *
 * Escape hatches:
 *   - Frequency: pick "Custom\u2026" → reveals free-text input bound
 *     to the legacy `frequency` column. `frequencyCode` stores
 *     `'CUSTOM'` so we can tell apart "doctor opted out" from "row
 *     pre-dates structured columns".
 *   - Route: pick "Other\u2026" → free-text input bound to legacy
 *     `route`. `routeCode` stores `'other'`.
 *   - Duration: pick "until finished" / "continue" → number input
 *     hides itself; legacy `duration` carries the readable label.
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

  // ---- frequency picker ---------------------------------------------------

  const handleFrequencyCode = (code: FrequencyCode | "") => {
    if (code === "") {
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

  // ---- duration picker ----------------------------------------------------

  const handleDurationUnit = (unit: DurationUnit | "") => {
    if (unit === "") {
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

  // ---- route picker -------------------------------------------------------

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
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-2">
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
              placeholder="Dosage"
              className="h-11 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              maxLength={100}
              disabled={rowDisabled}
            />
          </div>

          {/* Route picker (T2.10) */}
          <div>
            <label htmlFor={`med-route-code-${index}`} className="sr-only">
              Route
            </label>
            <select
              id={`med-route-code-${index}`}
              value={value.routeCode ?? ""}
              onChange={(e) => handleRouteCode(e.target.value as RouteCode | "")}
              className="h-11 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              disabled={rowDisabled}
            >
              <option value="">Route…</option>
              {ROUTE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Frequency picker (T2.10) */}
          <div>
            <label htmlFor={`med-frequency-code-${index}`} className="sr-only">
              Frequency
            </label>
            <select
              id={`med-frequency-code-${index}`}
              value={value.frequencyCode ?? ""}
              onChange={(e) =>
                handleFrequencyCode(e.target.value as FrequencyCode | "")
              }
              className="h-11 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              disabled={rowDisabled}
            >
              <option value="">Frequency…</option>
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Duration picker (T2.10) — value + unit */}
          <div className="flex gap-2">
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
              className={`h-11 w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 ${
                durationTakesValue ? "" : "invisible"
              }`}
              disabled={rowDisabled || !durationTakesValue}
              aria-hidden={!durationTakesValue}
            />
            <label htmlFor={`med-duration-unit-${index}`} className="sr-only">
              Duration unit
            </label>
            <select
              id={`med-duration-unit-${index}`}
              value={value.durationUnit ?? ""}
              onChange={(e) =>
                handleDurationUnit(e.target.value as DurationUnit | "")
              }
              className="h-11 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              disabled={rowDisabled}
            >
              <option value="">Duration…</option>
              {DURATION_UNIT_OPTIONS.map((opt) => (
                <option key={opt.unit} value={opt.unit}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CUSTOM frequency / other route fallbacks — revealed only when
            the doctor picks the "Custom\u2026" / "Other\u2026" option. They
            write directly into the legacy free-text columns so the PDF
            and SMS pipelines render the typed value verbatim. */}
        {(showFrequencyCustomInput || showRouteOtherInput) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {showFrequencyCustomInput && (
              <div>
                <label
                  htmlFor={`med-frequency-custom-${index}`}
                  className="block text-xs text-gray-600"
                >
                  Custom frequency
                </label>
                <input
                  id={`med-frequency-custom-${index}`}
                  type="text"
                  value={value.frequency}
                  onChange={(e) => onChange(index, "frequency", e.target.value)}
                  placeholder="e.g. Every 6 hours after meals"
                  className="mt-1 h-10 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  maxLength={100}
                  disabled={rowDisabled}
                />
              </div>
            )}
            {showRouteOtherInput && (
              <div>
                <label
                  htmlFor={`med-route-other-${index}`}
                  className="block text-xs text-gray-600"
                >
                  Other route
                </label>
                <input
                  id={`med-route-other-${index}`}
                  type="text"
                  value={value.route}
                  onChange={(e) => onChange(index, "route", e.target.value)}
                  placeholder="e.g. Buccal"
                  className="mt-1 h-10 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  maxLength={100}
                  disabled={rowDisabled}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-2 flex items-end gap-2">
          <label htmlFor={`med-instructions-${index}`} className="sr-only">
            Instructions
          </label>
          <input
            id={`med-instructions-${index}`}
            type="text"
            value={value.instructions}
            onChange={(e) => onChange(index, "instructions", e.target.value)}
            placeholder="Instructions (e.g. after meals, with water)"
            className="h-11 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            maxLength={100}
            disabled={rowDisabled}
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={rowDisabled}
            className="h-11 w-11 rounded p-1.5 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            aria-label={`Remove medicine ${index + 1}`}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
