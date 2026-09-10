"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  BP_MEASURED_BY_OPTIONS,
  BP_SETTING_OPTIONS,
} from "@/lib/cockpit/bp-readings";
import type { BpMeasuredBy, BpSetting } from "@/types/prescription";
import { cn } from "@/lib/utils";

function ContextSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "mt-0 h-8 min-w-0 max-w-full rounded-md border border-border px-3 py-2 text-xs",
        "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
        className,
      )}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Visit-level who / where — applies to all vitals unless overridden per reading. */
export function VitalsMeasurementContextBar(): JSX.Element | null {
  const { state, setField } = useRxForm();
  const context = state.fields.vitalsMeasurementContext;
  const measuredBy = context.measuredBy;
  const setting = context.setting;

  if (measuredBy == null || setting == null) {
    return null;
  }

  const updateMeasuredBy = (measuredBy: BpMeasuredBy) => {
    setField("vitalsMeasurementContext", { ...context, measuredBy });
  };

  const updateSetting = (setting: BpSetting) => {
    setField("vitalsMeasurementContext", { ...context, setting });
  };

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
      data-testid="vitals-measurement-context-bar"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Measured by</span>
        <ContextSelect
          value={measuredBy}
          onChange={updateMeasuredBy}
          options={BP_MEASURED_BY_OPTIONS}
          ariaLabel="Vitals measured by"
          className="min-w-0 max-w-full"
        />
        <span className="text-muted-foreground">at</span>
        <ContextSelect
          value={setting}
          onChange={updateSetting}
          options={BP_SETTING_OPTIONS}
          ariaLabel="Vitals measurement setting"
          className="min-w-0 max-w-full"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Default for all vitals — use “Measured differently” on any reading to override.
      </p>
    </div>
  );
}
