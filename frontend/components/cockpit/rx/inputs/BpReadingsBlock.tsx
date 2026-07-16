"use client";

import { useCallback, useState } from "react";
import { useRxForm, type BpContext, type BpReading } from "@/components/cockpit/rx/RxFormContext";
import {
  DerivedBadge,
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
import { ChevronDown } from "lucide-react";
import {
  BP_LIMB_OPTIONS,
  BP_MEASURED_BY_OPTIONS,
  BP_METHOD_OPTIONS,
  BP_POSTURE_OPTIONS,
  BP_SETTING_OPTIONS,
  MAX_BP_READINGS,
  bpPresetBothArms,
  bpPresetOrthostatic,
  bpPresetWouldDropReadings,
  bpMethodLabel,
  bpMeasuredByLabel,
  bpSettingLabel,
  computeAverageBp,
  computeInterArmDelta,
  computeOrthostaticDrop,
  createEmptyBpReading,
  mergeBpReadingsWithPreset,
  hydrateBpContextFromPrescription,
  readingHasContextOverride,
} from "@/lib/cockpit/bp-readings";
import { mergeBpBlockContext } from "@/lib/cockpit/measurement-context";
import { BP_QUICK_FILL_PAIRS, bpPrimaryReadingEmpty } from "@/lib/cockpit/vitals-quick-fill";
import { VitalQuickFillChips } from "@/components/cockpit/rx/inputs/VitalQuickFillChips";
import { VitalRangeHelp } from "@/components/cockpit/rx/inputs/VitalRangeHelp";
import { ReadingNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { LastVisitVitalGhost } from "@/components/cockpit/rx/inputs/LastVisitVitalGhost";
import { vitalSelectMinWidthCh } from "@/lib/cockpit/categorical-vitals-schema";
import {
  bpReadingsGridSpanClass,
  VITAL_CLUSTER_BODY_CLASS,
  VITAL_CLUSTER_CELL_CLASS,
  VITAL_CLUSTER_GRID_OUTER_CLASS,
  VITAL_CLUSTER_STATS_FOOTER_CLASS,
} from "@/lib/cockpit/vitals-group-layout";
import { computeMap, categorizeBpPair } from "@/lib/cockpit/vitals-derive";
import { resolveVital, type RangeContext } from "@/lib/cockpit/vitals-schema";
import type { VitalTrendMetricKey } from "@/lib/cockpit/vitals-trends";
import type {
  BpMeasuredBy,
  BpMethod,
  BpSetting,
} from "@/types/prescription";

export interface BpReadingsBlockProps {
  ghost: GhostVitals | null;
  sparklineFor: (metric: VitalTrendMetricKey, label: string) => React.ReactNode;
  rangeCtx?: RangeContext;
}

type BpPresetKind = "both_arms" | "orthostatic";

const BP_PRESET_LABELS: Record<BpPresetKind, string> = {
  both_arms: "Both arms",
  orthostatic: "Orthostatic",
};

function resolveBpPreset(kind: BpPresetKind): BpReading[] {
  return kind === "both_arms" ? bpPresetBothArms() : bpPresetOrthostatic();
}

function BpNumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        onChange(n);
      }}
      placeholder={placeholder}
      className={cn(RX_FIELD_INPUT_CLASS, "mt-0 w-16 shrink-0 sm:w-20")}
      aria-label={ariaLabel}
    />
  );
}

function BpContextSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
}: {
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className={cn(RX_FIELD_INPUT_CLASS, "mt-0 shrink-0", className)}
      aria-label={ariaLabel}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Per-row override select — empty value inherits the visit block default with a visible label. */
function BpReadingOverrideSelect<T extends string>({
  value,
  defaultValue,
  onChange,
  options,
  defaultLabel,
  ariaLabel,
  className,
}: {
  value: T | null | undefined;
  defaultValue: T;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  defaultLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const inheritLabel = defaultLabel;
  const overrideOptions = options.filter((option) => option.value !== defaultValue);
  const displayValue = value == null || value === defaultValue ? "" : value;

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
      className={cn(RX_FIELD_INPUT_CLASS, "mt-0 shrink-0", className)}
      aria-label={ariaLabel}
    >
      <option value="">{inheritLabel}</option>
      {overrideOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function BpMethodInlineSelect({
  method,
  onMethodChange,
}: {
  method: BpMethod | null | undefined;
  onMethodChange: (method: BpMethod) => void;
}) {
  const methodMinCh = vitalSelectMinWidthCh(BP_METHOD_OPTIONS, "Method");
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1" data-testid="bp-method-select">
      <label htmlFor="bp-block-method" className="shrink-0 text-[11px] text-muted-foreground">
        Method
      </label>
      <select
        id="bp-block-method"
        value={method ?? ""}
        onChange={(e) => onMethodChange((e.target.value || "auto_upper_arm") as BpMethod)}
        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 min-w-0 max-w-full flex-1 py-1 text-xs")}
        style={{ maxWidth: "100%", width: `min(100%, ${methodMinCh}ch)` }}
        aria-label="BP measurement method"
      >
        {BP_METHOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BpReadingInlineSelect<T extends string>({
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
    <div className="flex min-w-0 max-w-full items-center gap-1">
      <label htmlFor={id} className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 min-w-0 max-w-full flex-1 py-1 text-xs")}
        style={{ maxWidth: "100%", width: `min(100%, ${minWidthCh}ch)` }}
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

function BpReadingRowOverride({
  reading,
  blockContext,
  onChange,
  variant = "inline",
}: {
  reading: BpReading;
  blockContext: BpContext;
  onChange: (next: BpReading) => void;
  variant?: "inline" | "popover";
}) {
  const block = hydrateBpContextFromPrescription({ bpContext: blockContext });
  const measuredByDefault = block.measuredBy as BpMeasuredBy;
  const methodDefault = block.method as BpMethod;
  const settingDefault = block.setting as BpSetting;

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-2",
        variant === "inline" && "border-t border-border/40 pt-2",
      )}
      data-testid="bp-reading-context-override"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Measured by</span>
        <BpReadingOverrideSelect
          value={reading.measuredBy}
          defaultValue={measuredByDefault}
          defaultLabel={bpMeasuredByLabel(measuredByDefault) ?? measuredByDefault}
          onChange={(measuredBy) => onChange({ ...reading, measuredBy })}
          options={BP_MEASURED_BY_OPTIONS}
          ariaLabel="Reading measured by override"
          className="w-full min-w-0"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Method</span>
        <BpReadingOverrideSelect
          value={reading.method}
          defaultValue={methodDefault}
          defaultLabel={bpMethodLabel(methodDefault) ?? methodDefault}
          onChange={(method) => onChange({ ...reading, method })}
          options={BP_METHOD_OPTIONS}
          ariaLabel="Reading method override"
          className="w-full min-w-0"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Setting</span>
        <BpReadingOverrideSelect
          value={reading.setting}
          defaultValue={settingDefault}
          defaultLabel={bpSettingLabel(settingDefault) ?? settingDefault}
          onChange={(setting) => onChange({ ...reading, setting })}
          options={BP_SETTING_OPTIONS}
          ariaLabel="Reading setting override"
          className="w-full min-w-0"
        />
      </div>
    </div>
  );
}

function BpReadingProvenanceControl({
  reading,
  index,
  blockContext,
  onChange,
}: {
  reading: BpReading;
  index: number;
  blockContext: BpContext;
  onChange: (next: BpReading) => void;
}) {
  const hasOverride = readingHasContextOverride(reading);

  const clearOverride = () => {
    onChange({
      ...reading,
      measuredBy: null,
      method: null,
      setting: null,
    });
  };

  if (hasOverride) {
    return (
      <div
        className="space-y-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5"
        data-testid={`bp-reading-provenance-panel-${index}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Differs from visit default</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={clearOverride}
            data-testid={`bp-reading-provenance-reset-${index}`}
          >
            Use visit default
          </Button>
        </div>
        <BpReadingRowOverride
          reading={reading}
          blockContext={blockContext}
          onChange={onChange}
          variant="popover"
        />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
          data-testid={`bp-reading-context-toggle-${index}`}
        >
          Measured differently
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[20rem] space-y-2 p-3">
        <p className="text-xs text-muted-foreground">
          Override who measured, cuff method, or setting for this reading only.
        </p>
        <BpReadingRowOverride
          reading={reading}
          blockContext={blockContext}
          onChange={onChange}
          variant="popover"
        />
      </PopoverContent>
    </Popover>
  );
}

function BpReadingRow({
  reading,
  index,
  blockContext,
  ghost,
  rangeCtx,
  canRemove,
  showSequenceLabel,
  onChange,
  onRemove,
}: {
  reading: BpReading;
  index: number;
  blockContext: BpContext;
  ghost: GhostVitals | null;
  rangeCtx?: RangeContext;
  canRemove: boolean;
  showSequenceLabel: boolean;
  onChange: (next: BpReading) => void;
  onRemove: () => void;
}) {
  const sysDef = resolveVital("vitalsBpSystolic");
  const diaDef = resolveVital("vitalsBpDiastolic");
  const map = computeMap(reading.systolic, reading.diastolic);
  const bpCategory = categorizeBpPair(reading.systolic, reading.diastolic, rangeCtx ?? {});
  const isPrimary = index === 0;
  const postureMinCh = vitalSelectMinWidthCh(BP_POSTURE_OPTIONS, "Posture");
  const limbMinCh = vitalSelectMinWidthCh(BP_LIMB_OPTIONS, "Limb");

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
      data-testid={`bp-reading-row-${index}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BpNumberInput
            value={reading.systolic}
            onChange={(systolic) => onChange({ ...reading, systolic })}
            min={sysDef.hardMin}
            max={sysDef.hardMax}
            placeholder={
              isPrimary && ghost?.vitalsBpSystolic != null
                ? String(ghost.vitalsBpSystolic)
                : "120"
            }
            ariaLabel={isPrimary ? "Systolic blood pressure" : `Reading ${index + 1} systolic`}
          />

          <span className="text-muted-foreground">/</span>

          <BpNumberInput
            value={reading.diastolic}
            onChange={(diastolic) => onChange({ ...reading, diastolic })}
            min={diaDef.hardMin}
            max={diaDef.hardMax}
            placeholder={
              isPrimary && ghost?.vitalsBpDiastolic != null
                ? String(ghost.vitalsBpDiastolic)
                : "80"
            }
            ariaLabel={isPrimary ? "Diastolic blood pressure" : `Reading ${index + 1} diastolic`}
          />
          <RangeFlagIcon label="Blood pressure" category={bpCategory} />
        </div>

        {isPrimary && bpPrimaryReadingEmpty(reading.systolic, reading.diastolic) ? (
          <VitalQuickFillChips
            options={BP_QUICK_FILL_PAIRS}
            onSelect={(index) => {
              const pair = BP_QUICK_FILL_PAIRS[index];
              if (pair == null) return;
              onChange({
                ...reading,
                systolic: pair.systolic,
                diastolic: pair.diastolic,
              });
            }}
            testIdPrefix="bp-primary"
            ariaGroupLabel="Common blood pressure values"
          />
        ) : null}

        {map != null ? (
          <DerivedBadge
            text={`MAP ${map}`}
            ariaLabel={`Mean arterial pressure ${map} millimetres of mercury`}
            title={`Mean arterial pressure ${map} mmHg`}
          />
        ) : null}

        {canRemove ? (
          <RemoveIconButton
            label={`Remove reading ${index + 1}`}
            onClick={onRemove}
            testId={`bp-remove-reading-${index}`}
          />
        ) : null}
      </div>

      {isPrimary &&
      ghost?.vitalsBpSystolic != null &&
      ghost.vitalsBpDiastolic != null &&
      bpPrimaryReadingEmpty(reading.systolic, reading.diastolic) ? (
        <LastVisitVitalGhost
          label="Blood pressure"
          displayText={`${ghost.vitalsBpSystolic}/${ghost.vitalsBpDiastolic} mmHg`}
          onApply={() =>
            onChange({
              ...reading,
              systolic: ghost.vitalsBpSystolic!,
              diastolic: ghost.vitalsBpDiastolic!,
            })
          }
          testId="bp-primary-last-visit"
        />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {showSequenceLabel ? (
          <div className="flex shrink-0 items-center gap-1">
            <label
              htmlFor={`bp-reading-label-${index}`}
              className="shrink-0 text-[11px] text-muted-foreground"
            >
              Label
            </label>
            <input
              id={`bp-reading-label-${index}`}
              type="text"
              value={reading.sequenceLabel ?? ""}
              onChange={(e) =>
                onChange({
                  ...reading,
                  sequenceLabel: e.target.value.length > 0 ? e.target.value : null,
                })
              }
              placeholder="e.g. 1 min"
              maxLength={24}
              className={cn(
                RX_FIELD_INPUT_CLASS,
                "mt-0 h-7 w-24 max-w-full py-1 text-xs placeholder:text-muted-foreground",
              )}
              aria-label={
                isPrimary ? "Primary BP reading label" : `Reading ${index + 1} sequence label`
              }
              data-testid={`bp-reading-label-${index}`}
            />
          </div>
        ) : null}
        <BpReadingInlineSelect
          id={`bp-reading-posture-${index}`}
          label="Posture"
          value={reading.posture}
          onChange={(posture) => onChange({ ...reading, posture })}
          options={BP_POSTURE_OPTIONS}
          placeholder="—"
          ariaLabel={isPrimary ? "BP measurement posture" : `Reading ${index + 1} posture`}
          minWidthCh={postureMinCh}
        />
        <BpReadingInlineSelect
          id={`bp-reading-limb-${index}`}
          label="Limb"
          value={reading.limb}
          onChange={(limb) => onChange({ ...reading, limb })}
          options={BP_LIMB_OPTIONS}
          placeholder="—"
          ariaLabel={isPrimary ? "BP measurement limb" : `Reading ${index + 1} limb`}
          minWidthCh={limbMinCh}
        />
        <ReadingNoteField
          id={`bp-reading-note-${index}`}
          value={reading.note ?? ""}
          onChange={(next) =>
            onChange({
              ...reading,
              note: next.length > 0 ? next : null,
            })
          }
          label={isPrimary ? "Primary BP reading" : `Reading ${index + 1}`}
          testId={`bp-reading-note-${index}`}
        />
        {!readingHasContextOverride(reading) ? (
          <BpReadingProvenanceControl
            reading={reading}
            index={index}
            blockContext={blockContext}
            onChange={onChange}
          />
        ) : null}
      </div>

      {readingHasContextOverride(reading) ? (
        <BpReadingProvenanceControl
          reading={reading}
          index={index}
          blockContext={blockContext}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

export function BpReadingsBlock({ ghost, sparklineFor, rangeCtx }: BpReadingsBlockProps): JSX.Element {
  const { state, setField } = useRxForm();
  const readings = state.fields.vitalsBpReadings;
  const bpContext = state.fields.vitalsBpContext;
  const measurementContext = state.fields.vitalsMeasurementContext;
  const effectiveBlockContext = mergeBpBlockContext(measurementContext, bpContext);
  const [pendingPresetKind, setPendingPresetKind] = useState<BpPresetKind | null>(null);

  const updateReadings = useCallback(
    (next: BpReading[]) => {
      setField("vitalsBpReadings", next);
    },
    [setField],
  );

  const updateMethod = useCallback(
    (method: BpMethod) => {
      setField("vitalsBpContext", { ...bpContext, method });
    },
    [bpContext, setField],
  );

  const updateRow = useCallback(
    (index: number, next: BpReading) => {
      updateReadings(readings.map((row, i) => (i === index ? next : row)));
    },
    [readings, updateReadings],
  );

  const addReading = useCallback(() => {
    if (readings.length >= MAX_BP_READINGS) return;
    updateReadings([...readings, createEmptyBpReading()]);
  }, [readings, updateReadings]);

  const removeReading = useCallback(
    (index: number) => {
      if (readings.length <= 1) return;
      updateReadings(readings.filter((_, i) => i !== index));
    },
    [readings, updateReadings],
  );

  const applyPreset = useCallback(
    (preset: BpReading[]) => {
      updateReadings(mergeBpReadingsWithPreset(readings, preset));
    },
    [readings, updateReadings],
  );

  const requestPreset = useCallback(
    (kind: BpPresetKind) => {
      const preset = resolveBpPreset(kind);
      if (bpPresetWouldDropReadings(readings, preset)) {
        setPendingPresetKind(kind);
        return;
      }
      applyPreset(preset);
    },
    [applyPreset, readings],
  );

  const confirmPendingPreset = useCallback(() => {
    if (!pendingPresetKind) return;
    applyPreset(resolveBpPreset(pendingPresetKind));
    setPendingPresetKind(null);
  }, [applyPreset, pendingPresetKind]);

  const pendingPresetLabel = pendingPresetKind ? BP_PRESET_LABELS[pendingPresetKind] : "";

  const interArm = computeInterArmDelta(readings);
  const orthostatic = computeOrthostaticDrop(readings);
  const average = computeAverageBp(readings);
  const primaryReading = readings[0];
  const primaryBpCategory =
    primaryReading != null
      ? categorizeBpPair(
          primaryReading.systolic,
          primaryReading.diastolic,
          rangeCtx ?? {},
        )
      : null;

  const gridSpanClass = bpReadingsGridSpanClass(readings.length);

  return (
    <div
      className={cn(gridSpanClass, VITAL_CLUSTER_GRID_OUTER_CLASS)}
      data-testid="bp-readings-block"
      data-bp-grid-span={readings.length > 1 ? "full" : "unit"}
    >
      <div className={VITAL_CLUSTER_CELL_CLASS}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={RX_FIELD_LABEL_CLASS}>Blood pressure (mmHg)</span>
        <VitalRangeHelp
          kind="bp"
          rangeCtx={rangeCtx}
          currentCategory={primaryBpCategory}
        />
        {sparklineFor("vitalsBpSystolic", "Blood pressure")}
        <BpMethodInlineSelect method={bpContext.method} onMethodChange={updateMethod} />
      </div>

      <div className={VITAL_CLUSTER_BODY_CLASS}>
        {readings.map((reading, index) => (
          <BpReadingRow
            key={index}
            reading={reading}
            index={index}
            blockContext={effectiveBlockContext}
            ghost={ghost}
            rangeCtx={rangeCtx}
            canRemove={readings.length > 1}
            showSequenceLabel={
              readings.length > 1 ||
              (reading.sequenceLabel != null && reading.sequenceLabel.length > 0)
            }
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
          disabled={readings.length >= MAX_BP_READINGS}
          data-testid="bp-add-reading"
        >
          + Add reading
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => requestPreset("both_arms")}
          data-testid="bp-preset-both-arms"
        >
          Both arms
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => requestPreset("orthostatic")}
          data-testid="bp-preset-orthostatic"
        >
          Orthostatic
        </Button>
      </div>

      <AlertDialog
        open={pendingPresetKind != null}
        onOpenChange={(open) => {
          if (!open) setPendingPresetKind(null);
        }}
      >
        <AlertDialogContent data-testid="bp-preset-drop-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Reformat to {pendingPresetLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This shapes your blood pressure readings into the {pendingPresetLabel} layout.
              Extra readings with data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingPreset}>Reformat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={VITAL_CLUSTER_STATS_FOOTER_CLASS}>
        {interArm ? (
          <span
            className={
              interArm.flagged
                ? "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900"
                : "rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            }
            data-testid="bp-inter-arm-delta"
          >
            Inter-arm Δ {interArm.delta} mmHg
            {interArm.flagged ? " — review" : ""}
          </span>
        ) : null}
        {orthostatic ? (
          <span
            className={
              orthostatic.flagged
                ? "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900"
                : "rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            }
            data-testid="bp-orthostatic-drop"
          >
            Orthostatic Δ {orthostatic.systolicDrop}/{orthostatic.diastolicDrop} mmHg
            {orthostatic.flagged ? " — review" : ""}
          </span>
        ) : null}
        {average && average.count > 1 ? (
          <span
            className="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            data-testid="bp-average"
          >
            Avg {average.systolic}/{average.diastolic} ({average.count} readings)
          </span>
        ) : null}
      </div>
      </div>
    </div>
  );
}
