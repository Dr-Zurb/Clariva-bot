"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  BP_MEASURED_BY_OPTIONS,
  BP_SETTING_OPTIONS,
  bpMeasuredByLabel,
  bpSettingLabel,
} from "@/lib/cockpit/bp-readings";
import {
  hasVitalProvenanceOverride,
  hydrateMeasurementContextFromPrescription,
  type MeasurementContext,
} from "@/lib/cockpit/measurement-context";
import type { BpMeasuredBy, BpSetting } from "@/types/prescription";
import type { VitalKey } from "@/lib/cockpit/vitals-schema";
import { cn } from "@/lib/utils";

function ProvenanceOverrideSelect<T extends string>({
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

function ProvenanceOverrideFields({
  override,
  measuredByDefault,
  settingDefault,
  measuredByDefaultLabel,
  settingDefaultLabel,
  onMeasuredByChange,
  onSettingChange,
}: {
  override: MeasurementContext | undefined;
  measuredByDefault: BpMeasuredBy;
  settingDefault: BpSetting;
  measuredByDefaultLabel: string;
  settingDefaultLabel: string;
  onMeasuredByChange: (measuredBy: BpMeasuredBy | null) => void;
  onSettingChange: (setting: BpSetting | null) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Measured by</span>
        <ProvenanceOverrideSelect
          value={override?.measuredBy}
          defaultValue={measuredByDefault}
          defaultLabel={measuredByDefaultLabel}
          onChange={onMeasuredByChange}
          options={BP_MEASURED_BY_OPTIONS}
          ariaLabel="Vital measured by override"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Setting</span>
        <ProvenanceOverrideSelect
          value={override?.setting}
          defaultValue={settingDefault}
          defaultLabel={settingDefaultLabel}
          onChange={onSettingChange}
          options={BP_SETTING_OPTIONS}
          ariaLabel="Vital measurement setting override"
        />
      </div>
    </>
  );
}

export interface VitalProvenanceOverrideProps {
  /** Registry vital key or custom vital id (`custom_*`). */
  vitalKey: VitalKey | string;
  /**
   * `auto` — button or expanded panel (default).
   * `inline-trigger` — popover trigger only (for inline characteristic rows).
   * `expanded-panel` — expanded panel only when an override is active.
   */
  placement?: "auto" | "inline-trigger" | "expanded-panel";
}

/** Per-vital who/where override when it differs from the visit defaults. */
export function VitalProvenanceOverride({
  vitalKey,
  placement = "auto",
}: VitalProvenanceOverrideProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const visit = useMemo(
    () => hydrateMeasurementContextFromPrescription({ measurementContext: state.fields.vitalsMeasurementContext }),
    [state.fields.vitalsMeasurementContext],
  );
  const override = state.fields.vitalsProvenanceOverrides[vitalKey];
  const hasOverride = hasVitalProvenanceOverride(override, state.fields.vitalsMeasurementContext);

  const measuredByDefault = visit.measuredBy as BpMeasuredBy;
  const settingDefault = visit.setting as BpSetting;
  const measuredByDefaultLabel = bpMeasuredByLabel(measuredByDefault) ?? measuredByDefault;
  const settingDefaultLabel = bpSettingLabel(settingDefault) ?? settingDefault;

  const updateOverride = (patch: Partial<MeasurementContext>) => {
    const current = state.fields.vitalsProvenanceOverrides[vitalKey] ?? {};
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
      delete nextMap[vitalKey];
    } else {
      nextMap[vitalKey] = next;
    }
    setField("vitalsProvenanceOverrides", nextMap);
  };

  const clearOverride = () => {
    const nextMap = { ...state.fields.vitalsProvenanceOverrides };
    delete nextMap[vitalKey];
    setField("vitalsProvenanceOverrides", nextMap);
  };

  const fields = (
    <ProvenanceOverrideFields
      override={override}
      measuredByDefault={measuredByDefault}
      settingDefault={settingDefault}
      measuredByDefaultLabel={measuredByDefaultLabel}
      settingDefaultLabel={settingDefaultLabel}
      onMeasuredByChange={(measuredBy) => updateOverride({ measuredBy })}
      onSettingChange={(setting) => updateOverride({ setting })}
    />
  );

  if (hasOverride) {
    if (placement === "inline-trigger") return null;
    return (
      <div
        className="w-full min-w-[14rem] space-y-2 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5"
        data-testid={`vital-provenance-panel-${vitalKey}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Differs from visit default</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={clearOverride}
            data-testid={`vital-provenance-reset-${vitalKey}`}
          >
            Use visit default
          </Button>
        </div>
        <div className="grid gap-2 grid-cols-1 @[18rem]/vitals:grid-cols-2">{fields}</div>
      </div>
    );
  }

  if (placement === "expanded-panel") return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
          data-testid={`vital-provenance-trigger-${vitalKey}`}
        >
          Measured differently
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[18rem] space-y-2 p-3"
        data-testid={`vital-provenance-popover-${vitalKey}`}
      >
        <p className="text-xs text-muted-foreground">
          Override who measured or where for this vital only.
        </p>
        {fields}
      </PopoverContent>
    </Popover>
  );
}
