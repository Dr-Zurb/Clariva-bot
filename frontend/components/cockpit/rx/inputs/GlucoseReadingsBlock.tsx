"use client";

import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRxForm, type GlucoseContext, type GlucoseReading } from "@/components/cockpit/rx/RxFormContext";
import {
  RangeFlagIcon,
  type GhostVitals,
} from "@/components/cockpit/rx/inputs/VitalsExtended";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BP_MEASURED_BY_OPTIONS,
  BP_SETTING_OPTIONS,
  bpMeasuredByLabel,
  bpSettingLabel,
} from "@/lib/cockpit/bp-readings";
import {
  createEmptyGlucoseReading,
  DEFAULT_GLUCOSE_CONTEXT,
  GLUCOSE_DEVICE_OPTIONS,
  GLUCOSE_TIMING_OPTIONS,
  glucoseDeviceLabel,
  glucosePresetFastingAnd2hPp,
  glucosePresetOgtt3Point,
  glucosePresetWouldDropReadings,
  glucosePrimaryReadingEmpty,
  MAX_GLUCOSE_READINGS,
  mergeGlucoseReadingsWithPreset,
  readingHasGlucoseDeviceOverride,
} from "@/lib/cockpit/glucose-readings";
import {
  hasVitalProvenanceOverride,
  hydrateMeasurementContextFromPrescription,
  type MeasurementContext,
} from "@/lib/cockpit/measurement-context";
import { LastVisitVitalGhost } from "@/components/cockpit/rx/inputs/LastVisitVitalGhost";
import { ReadingNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";
import { VitalRangeHelp } from "@/components/cockpit/rx/inputs/VitalRangeHelp";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import {
  glucoseReadingsGridSpanClass,
  VITAL_CLUSTER_BODY_CLASS,
  VITAL_CLUSTER_CELL_CLASS,
  VITAL_CLUSTER_GRID_OUTER_CLASS,
} from "@/lib/cockpit/vitals-group-layout";
import { categorizeVital } from "@/lib/cockpit/vitals-derive";
import { resolveVital, type RangeContext } from "@/lib/cockpit/vitals-schema";
import type { VitalsGlucoseDevice } from "@/lib/cockpit/categorical-vitals-schema";
import { vitalSelectMinWidthCh } from "@/lib/cockpit/categorical-vitals-schema";
import type { VitalTrendMetricKey } from "@/lib/cockpit/vitals-trends";
import type { BpMeasuredBy, BpSetting } from "@/types/prescription";

const GLUCOSE_VITAL_KEY = "vitalsGlucoseMgDl" as const;

export interface GlucoseReadingsBlockProps {
  ghost: GhostVitals | null;
  sparklineFor: (metric: VitalTrendMetricKey, label: string) => React.ReactNode;
  rangeCtx?: RangeContext;
}

type GlucosePresetKind = "fasting_2h_pp" | "ogtt_3_point";

const GLUCOSE_PRESET_LABELS: Record<GlucosePresetKind, string> = {
  fasting_2h_pp: "Fasting + 2h PP",
  ogtt_3_point: "OGTT 3-point",
};

function resolveGlucosePreset(kind: GlucosePresetKind): GlucoseReading[] {
  return kind === "fasting_2h_pp" ? glucosePresetFastingAnd2hPp() : glucosePresetOgtt3Point();
}

function roundForUnit(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function UnitToggle({
  units,
  activeUnit,
  onSelect,
}: {
  units: readonly string[];
  activeUnit: string;
  onSelect: (unit: string) => void;
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Blood glucose unit"
      className="inline-flex overflow-hidden rounded-md border border-border text-[10px] leading-none"
    >
      {units.map((unit) => {
        const active = unit === activeUnit;
        return (
          <button
            key={unit}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(unit)}
            className={
              "px-1.5 py-1 font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted")
            }
          >
            {unit}
          </button>
        );
      })}
    </div>
  );
}

function GlucoseInlineSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  minWidthCh,
}: {
  id: string;
  label: string;
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  placeholder: string;
  ariaLabel: string;
  minWidthCh: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <label htmlFor={id} className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={cn(
          RX_FIELD_INPUT_CLASS,
          "mt-0 h-7 w-auto max-w-full shrink-0 py-1 text-xs",
        )}
        style={{ minWidth: `${minWidthCh}ch` }}
        aria-label={ariaLabel}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function GlucoseOverrideSelect<T extends string>({
  value,
  defaultValue,
  defaultLabel,
  onChange,
  options,
  ariaLabel,
}: {
  value: T | null | undefined;
  defaultValue: T;
  defaultLabel: string;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
}) {
  const displayValue = value == null || value === defaultValue ? "" : value;
  const overrideOptions = options.filter((option) => option.value !== defaultValue);

  return (
    <select
      value={displayValue}
      onChange={(e) => {
        const raw = e.target.value;
        if (!raw || raw === defaultValue) {
          onChange(null);
          return;
        }
        onChange(raw as T);
      }}
      className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-8 w-full min-w-[8rem] text-xs")}
      aria-label={ariaLabel}
    >
      <option value="">{defaultLabel}</option>
      {overrideOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function GlucoseReadingContextFields({
  reading,
  blockContext,
  onChange,
  variant = "popover",
  sections = "all",
}: {
  reading: GlucoseReading;
  blockContext: GlucoseContext;
  onChange: (next: GlucoseReading) => void;
  variant?: "popover" | "panel";
  sections?: "all" | "device" | "visit";
}) {
  const { state, setField } = useRxForm();
  const blockDevice =
    blockContext.device ?? DEFAULT_GLUCOSE_CONTEXT.device;
  const deviceDefaultLabel = glucoseDeviceLabel(blockDevice) ?? blockDevice;
  const visit = hydrateMeasurementContextFromPrescription({
    measurementContext: state.fields.vitalsMeasurementContext,
  });
  const visitOverride = state.fields.vitalsProvenanceOverrides[GLUCOSE_VITAL_KEY];
  const measuredByDefault = visit.measuredBy as BpMeasuredBy;
  const settingDefault = visit.setting as BpSetting;

  const updateVisitOverride = (patch: Partial<MeasurementContext>) => {
    const current = state.fields.vitalsProvenanceOverrides[GLUCOSE_VITAL_KEY] ?? {};
    const next: MeasurementContext = { ...current };

    if ("measuredBy" in patch) {
      if (patch.measuredBy == null) delete next.measuredBy;
      else next.measuredBy = patch.measuredBy;
    }
    if ("setting" in patch) {
      if (patch.setting == null) delete next.setting;
      else next.setting = patch.setting;
    }

    const nextMap = { ...state.fields.vitalsProvenanceOverrides };
    if (!hasVitalProvenanceOverride(next, state.fields.vitalsMeasurementContext)) {
      delete nextMap[GLUCOSE_VITAL_KEY];
    } else {
      nextMap[GLUCOSE_VITAL_KEY] = next;
    }
    setField("vitalsProvenanceOverrides", nextMap);
  };

  return (
    <div
      className={cn(
        "grid gap-2",
        variant === "popover" ? "sm:grid-cols-1" : "sm:grid-cols-2",
      )}
      data-testid="glucose-reading-context-override"
    >
      {sections === "all" || sections === "device" ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Device</span>
          <GlucoseOverrideSelect
            value={reading.device}
            defaultValue={blockDevice}
            defaultLabel={deviceDefaultLabel}
            onChange={(device) => onChange({ ...reading, device })}
            options={GLUCOSE_DEVICE_OPTIONS}
            ariaLabel="Reading glucose device override"
          />
        </div>
      ) : null}
      {sections === "all" || sections === "visit" ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Measured by</span>
            <GlucoseOverrideSelect
              value={visitOverride?.measuredBy}
              defaultValue={measuredByDefault}
              defaultLabel={bpMeasuredByLabel(measuredByDefault) ?? measuredByDefault}
              onChange={(measuredBy) => updateVisitOverride({ measuredBy })}
              options={BP_MEASURED_BY_OPTIONS}
              ariaLabel="Glucose measured by override"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Setting</span>
            <GlucoseOverrideSelect
              value={visitOverride?.setting}
              defaultValue={settingDefault}
              defaultLabel={bpSettingLabel(settingDefault) ?? settingDefault}
              onChange={(setting) => updateVisitOverride({ setting })}
              options={BP_SETTING_OPTIONS}
              ariaLabel="Glucose measurement setting override"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function GlucoseReadingProvenanceControl({
  reading,
  index,
  isPrimary,
  blockContext,
  onChange,
  placement,
}: {
  reading: GlucoseReading;
  index: number;
  isPrimary: boolean;
  blockContext: GlucoseContext;
  onChange: (next: GlucoseReading) => void;
  placement: "inline-trigger" | "expanded-panel";
}) {
  const { state, setField } = useRxForm();
  const hasDeviceOverride = readingHasGlucoseDeviceOverride(reading);
  const visitOverride = state.fields.vitalsProvenanceOverrides[GLUCOSE_VITAL_KEY];
  const hasVisitOverride = hasVitalProvenanceOverride(
    visitOverride,
    state.fields.vitalsMeasurementContext,
  );
  const showExpandedPanel = hasDeviceOverride || (isPrimary && hasVisitOverride);
  const showTrigger = !hasDeviceOverride && !hasVisitOverride;

  const clearDeviceOverride = () => {
    onChange({ ...reading, device: null });
  };

  const clearVisitOverride = () => {
    const nextMap = { ...state.fields.vitalsProvenanceOverrides };
    delete nextMap[GLUCOSE_VITAL_KEY];
    setField("vitalsProvenanceOverrides", nextMap);
  };

  if (placement === "expanded-panel") {
    if (!showExpandedPanel) return null;
    return (
      <div
        className="space-y-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5"
        data-testid={`glucose-reading-provenance-panel-${index}`}
      >
        {hasDeviceOverride ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Device differs from block default
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={clearDeviceOverride}
                data-testid={`glucose-reading-device-reset-${index}`}
              >
                Use block default
              </Button>
            </div>
            <GlucoseReadingContextFields
              reading={reading}
              blockContext={blockContext}
              onChange={onChange}
              variant="panel"
              sections="device"
            />
          </div>
        ) : null}
        {isPrimary && hasVisitOverride ? (
          <div className={cn(hasDeviceOverride && "border-t border-border/40 pt-2")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Differs from visit default</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={clearVisitOverride}
                data-testid={`glucose-reading-provenance-reset-${index}`}
              >
                Use visit default
              </Button>
            </div>
            <GlucoseReadingContextFields
              reading={reading}
              blockContext={blockContext}
              onChange={onChange}
              variant="panel"
              sections="visit"
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (!showTrigger) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
          data-testid={`glucose-reading-context-toggle-${index}`}
        >
          Measured differently
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[20rem] space-y-2 p-3">
        <p className="text-xs text-muted-foreground">
          Override device, who measured, or setting for this reading only.
        </p>
        <GlucoseReadingContextFields
          reading={reading}
          blockContext={blockContext}
          onChange={onChange}
          variant="popover"
        />
      </PopoverContent>
    </Popover>
  );
}

function GlucoseReadingRow({
  reading,
  index,
  blockContext,
  ghost,
  canRemove,
  showSequenceLabel,
  unitSymbol,
  rangeCtx,
  onChange,
  onRemove,
}: {
  reading: GlucoseReading;
  index: number;
  blockContext: GlucoseContext;
  ghost: GhostVitals | null;
  canRemove: boolean;
  showSequenceLabel: boolean;
  unitSymbol: string;
  rangeCtx?: RangeContext;
  onChange: (next: GlucoseReading) => void;
  onRemove: () => void;
}) {
  const def = resolveVital("vitalsGlucoseMgDl");
  const activeUnit =
    def.displayUnits.find((u) => u.unit === unitSymbol) ?? def.displayUnits[0]!;
  const glucoseCategory = categorizeVital("vitalsGlucoseMgDl", reading.valueMgDl, {
    ...rangeCtx,
    glucoseTiming: reading.timing,
  });
  const isPrimary = index === 0;
  const timingMinCh = vitalSelectMinWidthCh(GLUCOSE_TIMING_OPTIONS, "Timing");

  const displayValue: number | "" =
    reading.valueMgDl == null
      ? ""
      : roundForUnit(activeUnit.fromCanonical(reading.valueMgDl), activeUnit.precision);
  const ghostDisplay =
    ghost?.vitalsGlucoseMgDl == null
      ? null
      : roundForUnit(activeUnit.fromCanonical(ghost.vitalsGlucoseMgDl), activeUnit.precision);

  const min = roundForUnit(activeUnit.fromCanonical(def.hardMin), activeUnit.precision);
  const max = roundForUnit(activeUnit.fromCanonical(def.hardMax), activeUnit.precision);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
      data-testid={`glucose-reading-row-${index}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={activeUnit.step}
            value={displayValue}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ ...reading, valueMgDl: null });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              onChange({
                ...reading,
                valueMgDl: activeUnit.toCanonical(n) as number,
              });
            }}
            placeholder={
              isPrimary && ghostDisplay != null ? String(ghostDisplay) : "110"
            }
            className={cn(RX_FIELD_INPUT_CLASS, "mt-0 w-20 shrink-0 sm:w-24")}
            aria-label={
              isPrimary ? "Blood glucose value" : `Reading ${index + 1} blood glucose value`
            }
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{activeUnit.unit}</span>
          <RangeFlagIcon label="Blood Glucose" category={glucoseCategory} />
        </div>

        {canRemove ? (
          <RemoveIconButton
            label={`Remove reading ${index + 1}`}
            onClick={onRemove}
            testId={`glucose-remove-reading-${index}`}
          />
        ) : null}
      </div>

      {isPrimary &&
      ghost?.vitalsGlucoseMgDl != null &&
      glucosePrimaryReadingEmpty(reading.valueMgDl) ? (
        <LastVisitVitalGhost
          label="Blood glucose"
          displayText={`${ghostDisplay} ${activeUnit.unit}`}
          onApply={() => onChange({ ...reading, valueMgDl: ghost.vitalsGlucoseMgDl! })}
          testId="glucose-primary-last-visit"
        />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {showSequenceLabel ? (
          <div className="flex shrink-0 items-center gap-1">
            <label
              htmlFor={`glucose-reading-label-${index}`}
              className="shrink-0 text-[11px] text-muted-foreground"
            >
              Label
            </label>
            <input
              id={`glucose-reading-label-${index}`}
              type="text"
              value={reading.sequenceLabel ?? ""}
              onChange={(e) =>
                onChange({
                  ...reading,
                  sequenceLabel: e.target.value.length > 0 ? e.target.value : null,
                })
              }
              placeholder="e.g. 2h PP"
              maxLength={24}
              className={cn(
                RX_FIELD_INPUT_CLASS,
                "mt-0 h-7 w-24 max-w-full py-1 text-xs placeholder:text-muted-foreground",
              )}
              aria-label={
                isPrimary ? "Primary glucose reading label" : `Reading ${index + 1} label`
              }
              data-testid={`glucose-reading-label-${index}`}
            />
          </div>
        ) : null}
        <GlucoseInlineSelect
          id={`glucose-reading-timing-${index}`}
          label="Timing"
          value={reading.timing}
          onChange={(timing) => onChange({ ...reading, timing })}
          options={GLUCOSE_TIMING_OPTIONS}
          placeholder="—"
          ariaLabel={isPrimary ? "Glucose measurement timing" : `Reading ${index + 1} timing`}
          minWidthCh={Math.min(timingMinCh, 12)}
        />
        <ReadingNoteField
          id={`glucose-reading-note-${index}`}
          value={reading.note ?? ""}
          onChange={(next) =>
            onChange({
              ...reading,
              note: next.length > 0 ? next : null,
            })
          }
          label={isPrimary ? "Primary glucose reading" : `Reading ${index + 1}`}
          testId={`glucose-reading-note-${index}`}
        />
        <GlucoseReadingProvenanceControl
          reading={reading}
          index={index}
          isPrimary={isPrimary}
          blockContext={blockContext}
          onChange={onChange}
          placement="inline-trigger"
        />
      </div>

      <GlucoseReadingProvenanceControl
        reading={reading}
        index={index}
        isPrimary={isPrimary}
        blockContext={blockContext}
        onChange={onChange}
        placement="expanded-panel"
      />
    </div>
  );
}

export function GlucoseReadingsBlock({
  ghost,
  sparklineFor,
  rangeCtx,
}: GlucoseReadingsBlockProps): JSX.Element {
  const { state, setField } = useRxForm();
  const readings = state.fields.vitalsGlucoseReadings;
  const glucoseContext = state.fields.vitalsGlucoseContext;
  const def = resolveVital("vitalsGlucoseMgDl");
  const [unitSymbol, setUnitSymbol] = useState<string>(def.displayUnits[0].unit);
  const [pendingPresetKind, setPendingPresetKind] = useState<GlucosePresetKind | null>(null);

  const blockDevice = glucoseContext.device ?? "glucometer";
  const deviceMinCh = vitalSelectMinWidthCh(GLUCOSE_DEVICE_OPTIONS, "Device");

  const updateReadings = useCallback(
    (next: GlucoseReading[]) => {
      setField("vitalsGlucoseReadings", next);
    },
    [setField],
  );

  const updateContext = useCallback(
    (next: GlucoseContext) => {
      setField("vitalsGlucoseContext", next);
    },
    [setField],
  );

  const updateRow = useCallback(
    (index: number, next: GlucoseReading) => {
      updateReadings(readings.map((row, i) => (i === index ? next : row)));
    },
    [readings, updateReadings],
  );

  const addReading = useCallback(() => {
    if (readings.length >= MAX_GLUCOSE_READINGS) return;
    updateReadings([...readings, createEmptyGlucoseReading()]);
  }, [readings, updateReadings]);

  const removeReading = useCallback(
    (index: number) => {
      if (readings.length <= 1) return;
      updateReadings(readings.filter((_, i) => i !== index));
    },
    [readings, updateReadings],
  );

  const applyPreset = useCallback(
    (preset: GlucoseReading[]) => {
      updateReadings(mergeGlucoseReadingsWithPreset(readings, preset));
    },
    [readings, updateReadings],
  );

  const requestPreset = useCallback(
    (kind: GlucosePresetKind) => {
      const preset = resolveGlucosePreset(kind);
      if (glucosePresetWouldDropReadings(readings, preset)) {
        setPendingPresetKind(kind);
        return;
      }
      applyPreset(preset);
    },
    [applyPreset, readings],
  );

  const confirmPendingPreset = useCallback(() => {
    if (!pendingPresetKind) return;
    applyPreset(resolveGlucosePreset(pendingPresetKind));
    setPendingPresetKind(null);
  }, [applyPreset, pendingPresetKind]);

  const pendingPresetLabel = pendingPresetKind ? GLUCOSE_PRESET_LABELS[pendingPresetKind] : "";
  const gridSpanClass = glucoseReadingsGridSpanClass(readings.length);
  const primaryReading = readings[0];
  const primaryGlucoseCategory =
    primaryReading != null
      ? categorizeVital("vitalsGlucoseMgDl", primaryReading.valueMgDl, {
          ...rangeCtx,
          glucoseTiming: primaryReading.timing,
        })
      : null;

  return (
    <div
      className={cn(gridSpanClass, VITAL_CLUSTER_GRID_OUTER_CLASS)}
      data-testid="glucose-readings-block"
      data-glucose-grid-span={readings.length > 1 ? "full" : "unit"}
    >
      <div className={VITAL_CLUSTER_CELL_CLASS}>
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={RX_FIELD_LABEL_CLASS}>Blood glucose</span>
          <VitalRangeHelp
            kind="glucose"
            rangeCtx={rangeCtx}
            glucoseTiming={primaryReading?.timing}
            currentCategory={primaryGlucoseCategory}
          />
          {sparklineFor("vitalsGlucoseMgDl", "Blood glucose")}
          <UnitToggle
            units={def.displayUnits.map((u) => u.unit)}
            activeUnit={unitSymbol}
            onSelect={setUnitSymbol}
          />
          <GlucoseInlineSelect
            id="glucose-block-device"
            label="Device"
            value={blockDevice}
            onChange={(device) =>
              updateContext({ ...glucoseContext, device: device ?? blockDevice })
            }
            options={GLUCOSE_DEVICE_OPTIONS}
            placeholder="Device"
            ariaLabel="Default glucose device"
            minWidthCh={deviceMinCh}
          />
        </div>

        <div className={VITAL_CLUSTER_BODY_CLASS}>
          {readings.map((reading, index) => (
            <GlucoseReadingRow
              key={index}
              reading={reading}
              index={index}
              blockContext={glucoseContext}
              ghost={ghost}
              canRemove={readings.length > 1}
              showSequenceLabel={
                readings.length > 1 ||
                (reading.sequenceLabel != null && reading.sequenceLabel.length > 0)
              }
              unitSymbol={unitSymbol}
              rangeCtx={rangeCtx}
              onChange={(next) => updateRow(index, next)}
              onRemove={() => removeReading(index)}
            />
          ))}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addReading}
            disabled={readings.length >= MAX_GLUCOSE_READINGS}
            data-testid="glucose-add-reading"
          >
            + Add reading
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => requestPreset("fasting_2h_pp")}
            data-testid="glucose-preset-fasting-2h-pp"
          >
            Fasting + 2h PP
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => requestPreset("ogtt_3_point")}
            data-testid="glucose-preset-ogtt-3-point"
          >
            OGTT 3-point
          </Button>
        </div>

        <AlertDialog
          open={pendingPresetKind != null}
          onOpenChange={(open) => {
            if (!open) setPendingPresetKind(null);
          }}
        >
          <AlertDialogContent data-testid="glucose-preset-drop-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Reformat to {pendingPresetLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                This shapes your glucose readings into the {pendingPresetLabel} layout. Extra
                readings with data will be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPendingPreset}>Reformat</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
