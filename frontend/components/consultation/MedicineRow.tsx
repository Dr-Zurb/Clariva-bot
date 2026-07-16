"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import { ChartCardOptionToggle } from "@/components/ehr/chart/ChartCardOptionToggle";
import { ChartMedChipSelect } from "@/components/ehr/chart/ChartMedChipSelect";
import { ChartMedMoreCombobox } from "@/components/ehr/chart/ChartMedMoreCombobox";
import { chartOptionChipClass } from "@/components/ehr/chart/chart-chip-styles";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  RouteCode,
  StrengthUnit,
} from "@/types/prescription";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
import { scrollCollapsibleToStickyTop } from "@/lib/cockpit/collapse-scroll";
import { cn } from "@/lib/utils";
import {
  CHART_MED_DOSE_UNIT_PRIMARY,
  CHART_MED_FOOD_TIMING_PRIMARY,
  CHART_MED_FORM_COMBOBOX_OPTIONS,
  CHART_MED_FREQUENCY_HOUR_SLOTS,
  CHART_MED_FREQUENCY_MEAL_SLOTS,
  CHART_MED_FREQUENCY_MORE_SUGGESTIONS,
  CHART_MED_FREQUENCY_TAIL_OPTIONS,
  CHART_MED_STRENGTH_UNIT_PRIMARY,
  FOOD_TIMING_CHIP_OPTIONS,
  HOUR_TO_MEAL_SLOT_MAP,
  MEAL_TO_HOUR_SLOT_MAP,
  STRENGTH_UNIT_OPTIONS,
  chartMedPatchFromFormInput,
  customStrengthUnitFromLegacy,
  formatChartMedFormLabel,
  formatStrengthComponents,
  formatStrengthLabel,
  frequencyUiModeFromCode,
  getChartFrequencyLabel,
  isFrequencyMoreOrCustom,
  isIntervalFrequency,
  resolveFoodTimingInput,
  resolveFormInput,
  resolveFrequencyMoreInput,
  resolveDoseUnitInput,
  resolveStrengthFields,
  resolveStrengthUnitInput,
  syncStrengthLegacy,
  type ChartMedFrequencyUiMode,
} from "@/lib/chart/chart-medication";
import {
  CHART_MED_DURATION_PRIMARY,
  CHART_MED_ROUTE_PRIMARY,
  DOSE_UNIT_OPTIONS,
  DURATION_UNIT_OPTIONS,
  ROUTE_CHIP_OPTIONS,
  composeRouteWithSite,
  durationUnitTakesValue,
  extractRouteSite,
  formatDurationLegacyLabel,
  formatMedicineSigLine,
  getRouteSiteCatalog,
  resolveDurationUnitInput,
  resolveRouteCodeInput,
  resolveRouteSiteInput,
  routeCodeSupportsSite,
} from "@/lib/medicineCodes";

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
   * When false (and the row has a medicine name), render the compact summary
   * chip — mirrors PMH ChartMedicationCard: click to expand details. Incomplete
   * rows collapse too (capture-flow cards start closed). Defaults to `true`
   * for callers that haven't opted into densification.
   */
  isEditing?: boolean;
  /** Fired when the doctor taps the summary row (or presses Enter/Space on it). */
  onRequestEdit?: (index: number) => void;
  /** Fired when the row should collapse (Esc, collapse header, blur-to-outside). */
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
  const labelName = value.medicineName.trim() || `Medicine ${index + 1}`;

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
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring",
        readOnly && "cursor-default hover:bg-background",
      )}
      aria-label={
        readOnly
          ? `Medicine row ${index + 1}`
          : `${labelName} — expand medication`
      }
      aria-expanded={readOnly ? undefined : false}
      data-readonly={readOnly || undefined}
      data-testid={`medicine-row-summary-${index}`}
    >
      {dragHandleProps ? (
        <div
          {...dragHandleProps}
          className="cursor-grab text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </div>
      ) : null}

      <div className="min-w-0 flex-1 text-xs">
        {value.form ? (
          <span className="mr-1 capitalize text-muted-foreground">{value.form}</span>
        ) : null}
        <span className="font-medium text-foreground">{value.medicineName}</span>
        {sigLine ? (
          <span className="text-muted-foreground"> · {sigLine}</span>
        ) : null}
      </div>

      {!readOnly ? (
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}

      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(index);
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Delete medicine row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
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

const STRENGTH_CHIP_OPTIONS = STRENGTH_UNIT_OPTIONS.map((opt) => ({
  value: opt.unit,
  label: opt.label,
  title: opt.label,
}));

const DOSE_CHIP_OPTIONS = DOSE_UNIT_OPTIONS.map((opt) => ({
  value: opt.unit,
  label: opt.label,
  title: opt.label,
}));

const DURATION_CHIP_OPTIONS = DURATION_UNIT_OPTIONS.map((opt) => ({
  value: opt.unit,
  label: opt.label,
  title: opt.label,
}));

const FREQ_MODE_OPTIONS = [
  { value: "meals" as const, label: "Meals" },
  { value: "hours" as const, label: "Hr" },
];

function formComboboxDisplay(form: string | null): string {
  if (!form?.trim()) return "";
  const resolved = resolveFormInput(form);
  if (resolved && resolved !== "custom") return formatChartMedFormLabel(resolved);
  return form.trim();
}

function frequencyMoreDisplay(value: MedicineRowValue): string {
  if (value.frequencyCode === "CUSTOM") return value.frequency ?? "";
  if (isFrequencyMoreOrCustom(value.frequencyCode)) {
    return getChartFrequencyLabel(value.frequencyCode);
  }
  return "";
}

/**
 * Single medicine card for the prescription form — chip editor aligned with
 * PMH ChartMedicationCard for form / strength / dose / frequency / food.
 * Plan keeps course duration + route (not chart Active/Past / Origin / Pattern).
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
  const hasName = value.medicineName.trim().length > 0;
  // PMH parity: any named card can sit collapsed; completeness only gates blur-collapse.
  const shouldShowSummary =
    hasName && (isReadOnly || isEditing === false);

  const cardRef = useRef<HTMLDivElement>(null);
  const prevEditingRef = useRef(isEditing);
  const [strengthDraft, setStrengthDraft] = useState<string | null>(null);
  const [foodMoreCustom, setFoodMoreCustom] = useState<string | null>(null);
  const [freqUiMode, setFreqUiMode] = useState<ChartMedFrequencyUiMode>(() =>
    frequencyUiModeFromCode(value.frequencyCode),
  );

  useEffect(() => {
    if (value.frequencyCode && value.frequencyCode !== "CUSTOM") {
      setFreqUiMode(frequencyUiModeFromCode(value.frequencyCode));
    }
  }, [value.frequencyCode]);

  useEffect(() => {
    if (
      value.foodTiming &&
      (CHART_MED_FOOD_TIMING_PRIMARY as readonly string[]).includes(value.foodTiming)
    ) {
      setFoodMoreCustom(null);
    }
  }, [value.foodTiming]);

  // Subjective/objective parity: open glides the card under sticky chrome;
  // close glides the Medications section (capture + list) back to the top.
  useLayoutEffect(() => {
    if (isReadOnly || !hasName || !onRequestCollapse) return;
    const prev = prevEditingRef.current;
    if (isEditing === prev) return;
    prevEditingRef.current = isEditing;
    if (isEditing) {
      scrollCollapsibleToStickyTop(cardRef.current);
    } else {
      const section =
        cardRef.current?.closest<HTMLElement>("#medicines-section") ??
        document.getElementById("medicines-section");
      scrollCollapsibleToStickyTop(section);
    }
  }, [isEditing, isReadOnly, hasName, onRequestCollapse]);

  if (shouldShowSummary) {
    return (
      <div
        ref={cardRef}
        data-testid={`medicine-row-${index}`}
        className="scroll-mt-[var(--sticky-stack,2.75rem)]"
      >
        <MedicineRowSummary
          index={index}
          value={value}
          readOnly={isReadOnly}
          onRequestEdit={onRequestEdit}
          onRemove={onRemove}
          dragHandleProps={dragHandleProps}
        />
      </div>
    );
  }

  const canCollapse = hasName && !rowDisabled && !!onRequestCollapse;
  const sigLine = formatMedicineSigLine(value);
  const collapseLabel = value.medicineName.trim() || `Medicine ${index + 1}`;

  const strengthParsed = resolveStrengthFields(value.dosage);
  const strengthFieldValue =
    strengthDraft ??
    (strengthParsed.strengthComponents
      ? formatStrengthComponents(strengthParsed.strengthComponents)
      : strengthParsed.strengthValue != null
        ? String(strengthParsed.strengthValue)
        : value.dosage);
  const effectiveStrengthUnit: StrengthUnit | null =
    strengthParsed.strengthComponents &&
    strengthParsed.strengthComponents.length >= 2 &&
    strengthParsed.strengthComponents.every(
      (c) => c.unit === strengthParsed.strengthComponents![0]!.unit,
    )
      ? (strengthParsed.strengthComponents[0]!.unit ?? null)
      : (strengthParsed.strengthUnit ?? null);
  const strengthMoreText =
    effectiveStrengthUnit &&
    !CHART_MED_STRENGTH_UNIT_PRIMARY.includes(
      effectiveStrengthUnit as (typeof CHART_MED_STRENGTH_UNIT_PRIMARY)[number],
    )
      ? STRENGTH_CHIP_OPTIONS.find((o) => o.value === effectiveStrengthUnit)?.label ??
        effectiveStrengthUnit
      : customStrengthUnitFromLegacy(
          value.dosage,
          strengthParsed.strengthValue,
          strengthParsed.strengthUnit,
        );

  const doseCustomActive =
    value.doseUnit != null &&
    !DOSE_UNIT_OPTIONS.some((o) => o.unit === value.doseUnit);
  const doseMoreText = doseCustomActive
    ? value.doseUnit
    : value.doseUnit &&
        !CHART_MED_DOSE_UNIT_PRIMARY.includes(
          value.doseUnit as (typeof CHART_MED_DOSE_UNIT_PRIMARY)[number],
        )
      ? DOSE_CHIP_OPTIONS.find((o) => o.value === value.doseUnit)?.label ?? ""
      : null;

  const durationCustomActive =
    value.durationUnit == null && value.duration.trim().length > 0;
  const durationMoreText = durationCustomActive
    ? value.duration.trim()
    : value.durationUnit &&
        !CHART_MED_DURATION_PRIMARY.includes(
          value.durationUnit as (typeof CHART_MED_DURATION_PRIMARY)[number],
        )
      ? DURATION_CHIP_OPTIONS.find((o) => o.value === value.durationUnit)?.label ??
        value.durationUnit
      : null;

  const routeCustomActive = value.routeCode === "other";
  const routeMoreText = routeCustomActive
    ? value.route.trim()
    : value.routeCode &&
        !CHART_MED_ROUTE_PRIMARY.includes(
          value.routeCode as (typeof CHART_MED_ROUTE_PRIMARY)[number],
        )
      ? ROUTE_CHIP_OPTIONS.find((o) => o.value === value.routeCode)?.label ??
        value.routeCode
      : null;

  const routeSiteCatalog =
    value.routeCode && routeCodeSupportsSite(value.routeCode)
      ? getRouteSiteCatalog(value.routeCode)
      : null;
  const routeSite = extractRouteSite(value.routeCode, value.route);
  const routeSiteKnown = routeSite
    ? routeSiteCatalog?.options.find(
        (o) => o.value === routeSite || o.label === routeSite,
      )?.value ?? null
    : null;
  const routeSiteMoreText =
    routeSite && !routeSiteKnown
      ? routeSite
      : routeSiteKnown &&
          routeSiteCatalog &&
          !(routeSiteCatalog.primary as readonly string[]).includes(routeSiteKnown)
        ? routeSiteKnown
        : null;

  const freqMoreActive =
    value.frequencyCode === "CUSTOM" || isFrequencyMoreOrCustom(value.frequencyCode);
  const slotOptions =
    freqUiMode === "meals"
      ? CHART_MED_FREQUENCY_MEAL_SLOTS
      : CHART_MED_FREQUENCY_HOUR_SLOTS;

  const commitStrengthText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onPatch(index, { dosage: "" });
      return;
    }
    const fields = resolveStrengthFields(trimmed);
    if (fields.strengthComponents) {
      onPatch(index, {
        dosage: formatStrengthComponents(fields.strengthComponents) || trimmed,
      });
      return;
    }
    if (fields.strengthValue != null) {
      const unit = fields.strengthUnit ?? effectiveStrengthUnit;
      onPatch(index, {
        dosage:
          syncStrengthLegacy(fields.strengthValue, unit) ||
          formatStrengthLabel(fields.strengthValue, unit) ||
          String(fields.strengthValue),
      });
      return;
    }
    onPatch(index, { dosage: trimmed });
  };

  const handleStrengthUnitSelect = (unit: StrengthUnit | null) => {
    const fields = resolveStrengthFields(value.dosage);
    if (unit == null) {
      onPatch(index, {
        dosage:
          fields.strengthValue != null ? String(fields.strengthValue) : value.dosage,
      });
      return;
    }
    if (fields.strengthValue != null) {
      onPatch(index, {
        dosage:
          syncStrengthLegacy(fields.strengthValue, unit) ||
          formatStrengthLabel(fields.strengthValue, unit) ||
          "",
      });
      return;
    }
    // Free-text strength — append/replace unit token when possible.
    const base = value.dosage.replace(/\s*(mg|g|mcg|iu|%)\s*$/i, "").trim();
    onPatch(index, { dosage: base ? `${base} ${unit}` : unit });
  };

  const handleStrengthMoreCommit = (raw: string) => {
    const resolved = resolveStrengthUnitInput(raw);
    if (resolved && resolved !== "custom") {
      handleStrengthUnitSelect(resolved);
      return;
    }
    const unitText = raw.trim();
    if (!unitText) return;
    const fields = resolveStrengthFields(value.dosage);
    if (fields.strengthValue != null) {
      onPatch(index, { dosage: `${fields.strengthValue} ${unitText}` });
      return;
    }
    const stripped = value.dosage.replace(/\s*(mg|g|mcg|iu|%|pct)\s*$/i, "").trim();
    const numMatch = stripped.match(/^(\d+(?:\.\d+)?)\b/);
    if (numMatch) {
      onPatch(index, { dosage: `${numMatch[1]} ${unitText}` });
      return;
    }
    onPatch(index, { dosage: unitText });
  };

  const handleDoseQty = (raw: string) => {
    if (raw === "") {
      onPatch(index, { doseQty: null });
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n <= 0) return;
    onPatch(index, { doseQty: n });
  };

  const handleDoseUnitSelect = (unit: DoseUnit | null) => {
    onPatch(index, { doseUnit: unit });
  };

  const handleDoseMoreCommit = (raw: string) => {
    const resolved = resolveDoseUnitInput(raw);
    if (resolved && resolved !== "custom") {
      handleDoseUnitSelect(resolved);
      return;
    }
    // Session + sig: keep free-text unit on doseUnit; payload sanitizes to enum.
    onPatch(index, { doseUnit: raw.trim() as DoseUnit });
  };

  const handleFrequency = (code: FrequencyCode) => {
    const next = value.frequencyCode === code ? null : code;
    onPatch(index, {
      frequencyCode: next,
      frequency: next ? getChartFrequencyLabel(next) : "",
    });
  };

  const handleFreqModeToggle = (mode: ChartMedFrequencyUiMode) => {
    if (mode === freqUiMode) return;
    setFreqUiMode(mode);
    const code = value.frequencyCode;
    if (!code || code === "CUSTOM" || code === "QHS" || code === "PRN" || code === "STAT") {
      return;
    }
    if (isFrequencyMoreOrCustom(code)) return;
    if (isIntervalFrequency(code) && mode === "meals") {
      const mapped = HOUR_TO_MEAL_SLOT_MAP[code];
      if (mapped) handleFrequency(mapped);
      else onPatch(index, { frequencyCode: null, frequency: "" });
      return;
    }
    if (!isIntervalFrequency(code) && mode === "hours") {
      const mapped = MEAL_TO_HOUR_SLOT_MAP[code];
      if (mapped) handleFrequency(mapped);
      else onPatch(index, { frequencyCode: null, frequency: "" });
    }
  };

  const commitFrequencyMore = (raw: string) => {
    const resolved = resolveFrequencyMoreInput(raw);
    if (!resolved) return;
    onPatch(index, {
      frequencyCode: resolved.code,
      frequency: resolved.frequency,
    });
  };

  const handleDurationUnit = (unit: DurationUnit | null) => {
    if (unit == null || value.durationUnit === unit) {
      onPatch(index, { durationUnit: null, durationValue: null, duration: "" });
      return;
    }
    if (!durationUnitTakesValue(unit)) {
      onPatch(index, {
        durationUnit: unit,
        durationValue: null,
        duration: formatDurationLegacyLabel(null, unit),
      });
      return;
    }
    onPatch(index, {
      durationUnit: unit,
      duration: formatDurationLegacyLabel(value.durationValue, unit),
    });
  };

  const handleDurationMoreCommit = (raw: string) => {
    const resolved = resolveDurationUnitInput(raw);
    if (resolved && resolved !== "custom") {
      handleDurationUnit(resolved);
      return;
    }
    const text = raw.trim();
    if (!text) {
      handleDurationUnit(null);
      return;
    }
    onPatch(index, {
      durationUnit: null,
      durationValue: null,
      duration: text,
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
    if (Number.isNaN(n) || n <= 0) return;
    onPatch(index, {
      durationValue: n,
      duration: formatDurationLegacyLabel(n, value.durationUnit),
    });
  };

  const handleRouteSelect = (code: RouteCode | null) => {
    if (code == null || value.routeCode === code) {
      onPatch(index, { routeCode: null, route: "" });
      return;
    }
    if (code === "other") {
      onPatch(index, { routeCode: "other", route: "" });
      return;
    }
    // Changing route clears any prior site (catalogs differ per route).
    onPatch(index, {
      routeCode: code,
      route: composeRouteWithSite(code, null),
    });
  };

  const handleRouteMoreCommit = (raw: string) => {
    const resolved = resolveRouteCodeInput(raw);
    if (resolved && resolved !== "custom" && resolved !== "other") {
      handleRouteSelect(resolved);
      return;
    }
    const text = raw.trim();
    if (!text) {
      handleRouteSelect(null);
      return;
    }
    onPatch(index, { routeCode: "other", route: text });
  };

  const handleRouteSiteSelect = (site: string | null) => {
    if (!value.routeCode || !routeCodeSupportsSite(value.routeCode)) return;
    const current = extractRouteSite(value.routeCode, value.route);
    if (site == null || current === site) {
      onPatch(index, {
        route: composeRouteWithSite(value.routeCode, null),
      });
      return;
    }
    onPatch(index, {
      route: composeRouteWithSite(value.routeCode, site),
    });
  };

  const handleRouteSiteMoreCommit = (raw: string) => {
    if (!value.routeCode || !routeCodeSupportsSite(value.routeCode)) return;
    const resolved = resolveRouteSiteInput(value.routeCode, raw);
    handleRouteSiteSelect(resolved);
  };

  const durationTakesValue =
    value.durationUnit === null || durationUnitTakesValue(value.durationUnit);

  return (
    <div
      ref={cardRef}
      data-testid={`medicine-row-editor-${index}`}
      className="scroll-mt-[var(--sticky-stack,2.75rem)]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && canCollapse) {
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
      <div className="space-y-2 rounded-md border border-border/50 bg-background p-2">
        {canCollapse ? (
          <div
            className="-mx-2 -mt-2 mb-1 flex items-center gap-1.5 border-b border-border/60 bg-muted/25 px-2 py-1"
            data-testid={`medicine-row-collapse-header-${index}`}
          >
            <button
              type="button"
              onClick={() => onRequestCollapse?.(index)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-0.5 pl-0.5 text-left hover:bg-muted/40"
              aria-label={`Collapse ${collapseLabel}`}
              aria-expanded
            >
              <span className="truncate text-xs font-medium text-foreground">
                {collapseLabel}
              </span>
              {sigLine ? (
                <span className="truncate text-xs text-muted-foreground">
                  · {sigLine}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onRequestCollapse?.(index)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label={`Collapse ${collapseLabel}`}
              aria-expanded
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={rowDisabled}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive disabled:opacity-50"
              aria-label={`Remove medicine ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <div className="w-16 shrink-0">
            {!rowDisabled ? (
              <ChartMedMoreCombobox
                inputId={`med-form-${index}`}
                placeholder="Form"
                disabled={rowDisabled}
                value={formComboboxDisplay(value.form)}
                suggestions={CHART_MED_FORM_COMBOBOX_OPTIONS}
                allowCustom
                resolveMatch={(q) => {
                  const resolved = resolveFormInput(q);
                  return resolved && resolved !== "custom" ? resolved : undefined;
                }}
                onCommit={(raw) => {
                  const patch = chartMedPatchFromFormInput(raw);
                  onPatch(index, {
                    form: patch.form ?? null,
                    ...(patch.doseUnit !== undefined
                      ? { doseUnit: patch.doseUnit ?? null }
                      : {}),
                    ...(patch.doseQty !== undefined
                      ? { doseQty: patch.doseQty ?? null }
                      : {}),
                  });
                }}
                onClear={() => onPatch(index, { form: null })}
                className="w-full"
                inputClassName="w-full min-w-0 px-1"
              />
            ) : (
              <span className="block pt-1 text-[11px] text-muted-foreground">
                {formComboboxDisplay(value.form) || "—"}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-start gap-1">
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
                inputClassName={EDITOR_INPUT_CLASS}
              />
            </div>
            {!canCollapse ? (
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={rowDisabled}
                className="h-8 w-8 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive disabled:opacity-50"
                aria-label={`Remove medicine ${index + 1}`}
              >
                <Trash2 className="mx-auto h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <EditorFieldRow label="Strength">
          <input
            id={`med-dosage-${index}`}
            type="text"
            inputMode="decimal"
            value={strengthFieldValue}
            disabled={rowDisabled}
            placeholder="500 or 600/300"
            aria-label="Dosage"
            className={cn(EDITOR_INPUT_CLASS, "w-[6.5rem]")}
            onChange={(e) => setStrengthDraft(e.target.value)}
            onBlur={(e) => {
              commitStrengthText(e.target.value);
              setStrengthDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitStrengthText(e.currentTarget.value);
                setStrengthDraft(null);
              }
            }}
          />
          <ChartMedChipSelect
            primaryValues={CHART_MED_STRENGTH_UNIT_PRIMARY}
            allOptions={STRENGTH_CHIP_OPTIONS}
            value={effectiveStrengthUnit}
            moreText={strengthMoreText}
            disabled={rowDisabled}
            ariaLabel="Strength unit"
            onSelect={handleStrengthUnitSelect}
            onMoreCommit={handleStrengthMoreCommit}
            onMoreClear={() => {
              const custom = customStrengthUnitFromLegacy(
                value.dosage,
                strengthParsed.strengthValue,
                strengthParsed.strengthUnit,
              );
              if (custom) {
                onPatch(index, {
                  dosage:
                    strengthParsed.strengthValue != null
                      ? String(strengthParsed.strengthValue)
                      : "",
                });
                return;
              }
              if (
                effectiveStrengthUnit &&
                !CHART_MED_STRENGTH_UNIT_PRIMARY.includes(
                  effectiveStrengthUnit as (typeof CHART_MED_STRENGTH_UNIT_PRIMARY)[number],
                )
              ) {
                handleStrengthUnitSelect(null);
              }
            }}
          />
        </EditorFieldRow>

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
            className={cn(EDITOR_INPUT_CLASS, "w-[4.25rem]")}
            disabled={rowDisabled}
          />
          <ChartMedChipSelect
            primaryValues={CHART_MED_DOSE_UNIT_PRIMARY}
            allOptions={DOSE_CHIP_OPTIONS}
            value={doseCustomActive ? null : value.doseUnit}
            moreText={doseMoreText}
            disabled={rowDisabled}
            ariaLabel="Dose unit"
            onSelect={handleDoseUnitSelect}
            onMoreCommit={handleDoseMoreCommit}
            onMoreClear={() => {
              if (doseCustomActive || value.doseUnit) {
                handleDoseUnitSelect(null);
              }
            }}
          />
        </EditorFieldRow>

        <EditorFieldRow label="Frequency">
          {!rowDisabled ? (
            <ChartCardOptionToggle
              options={FREQ_MODE_OPTIONS}
              value={freqUiMode}
              disabled={rowDisabled}
              ariaLabel="Frequency mode — meals or hours"
              testId={`med-freq-mode-${index}`}
              onChange={handleFreqModeToggle}
            />
          ) : null}
          {slotOptions.map((opt) => (
            <button
              key={opt.code}
              type="button"
              disabled={rowDisabled}
              aria-pressed={!freqMoreActive && value.frequencyCode === opt.code}
              title={opt.tooltip}
              className={chartOptionChipClass(
                !freqMoreActive && value.frequencyCode === opt.code,
              )}
              onClick={() => handleFrequency(opt.code)}
            >
              {opt.label}
            </button>
          ))}
          {CHART_MED_FREQUENCY_TAIL_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              disabled={rowDisabled}
              aria-pressed={!freqMoreActive && value.frequencyCode === opt.code}
              title={opt.tooltip}
              className={chartOptionChipClass(
                !freqMoreActive && value.frequencyCode === opt.code,
              )}
              onClick={() => handleFrequency(opt.code)}
            >
              {opt.label}
            </button>
          ))}
          <ChartMedMoreCombobox
            disabled={rowDisabled}
            value={frequencyMoreDisplay(value)}
            placeholder="More…"
            suggestions={CHART_MED_FREQUENCY_MORE_SUGGESTIONS.map((opt) => ({
              value: opt.code,
              label: opt.label,
              hint: opt.tooltip,
            }))}
            resolveMatch={(query) => resolveFrequencyMoreInput(query)?.code}
            onCommit={commitFrequencyMore}
            onClear={() => {
              if (freqMoreActive) {
                onPatch(index, { frequencyCode: null, frequency: "" });
              }
            }}
          />
        </EditorFieldRow>

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
          <ChartMedChipSelect
            primaryValues={CHART_MED_DURATION_PRIMARY}
            allOptions={DURATION_CHIP_OPTIONS}
            value={durationCustomActive ? null : value.durationUnit}
            moreText={durationMoreText}
            disabled={rowDisabled}
            ariaLabel="Duration unit"
            onSelect={handleDurationUnit}
            onMoreCommit={handleDurationMoreCommit}
            onMoreClear={() => {
              if (durationCustomActive || value.durationUnit) {
                handleDurationUnit(null);
              }
            }}
          />
        </EditorFieldRow>

        <EditorFieldRow label="Route">
          <ChartMedChipSelect
            primaryValues={CHART_MED_ROUTE_PRIMARY}
            allOptions={ROUTE_CHIP_OPTIONS}
            value={routeCustomActive ? null : value.routeCode}
            moreText={routeMoreText}
            disabled={rowDisabled}
            ariaLabel="Route"
            onSelect={handleRouteSelect}
            onMoreCommit={handleRouteMoreCommit}
            onMoreClear={() => {
              if (routeCustomActive || value.routeCode) {
                handleRouteSelect(null);
              }
            }}
          />
        </EditorFieldRow>

        {routeSiteCatalog && value.routeCode && routeCodeSupportsSite(value.routeCode) ? (
          <EditorFieldRow label="Site">
            <ChartMedChipSelect
              primaryValues={routeSiteCatalog.primary}
              allOptions={routeSiteCatalog.options}
              value={routeSiteMoreText ? null : routeSiteKnown}
              moreText={routeSiteMoreText}
              disabled={rowDisabled}
              ariaLabel="Route site"
              onSelect={handleRouteSiteSelect}
              onMoreCommit={handleRouteSiteMoreCommit}
              onMoreClear={() => handleRouteSiteSelect(null)}
            />
          </EditorFieldRow>
        ) : null}

        <EditorFieldRow label="Food">
          <ChartMedChipSelect
            primaryValues={CHART_MED_FOOD_TIMING_PRIMARY}
            allOptions={FOOD_TIMING_CHIP_OPTIONS}
            value={foodMoreCustom ? null : value.foodTiming}
            moreText={foodMoreCustom}
            disabled={rowDisabled}
            ariaLabel="Food timing"
            onSelect={(v) => {
              setFoodMoreCustom(null);
              onPatch(index, { foodTiming: value.foodTiming === v ? null : v });
            }}
            onMoreCommit={(raw) => {
              const resolved = resolveFoodTimingInput(raw);
              if (resolved) {
                setFoodMoreCustom(null);
                onPatch(index, { foodTiming: resolved });
                return;
              }
              setFoodMoreCustom(raw.trim());
              onPatch(index, { foodTiming: null });
            }}
            onMoreClear={() => {
              setFoodMoreCustom(null);
              onPatch(index, { foodTiming: null });
            }}
          />
        </EditorFieldRow>

        <EditorFieldRow label="Notes">
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
        </EditorFieldRow>
      </div>
    </div>
  );
}
