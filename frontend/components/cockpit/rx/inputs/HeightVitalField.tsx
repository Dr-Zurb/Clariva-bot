"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  RangeFlagIcon,
  type VitalFieldProps,
} from "@/components/cockpit/rx/inputs/VitalsExtended";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";
import { cmToFtIn, evaluateRange, ftInToCm } from "@/lib/cockpit/vitals-derive";
import { vitalGridSpanClass, VITAL_CELL_CLASS } from "@/lib/cockpit/vitals-group-layout";
import { resolveVital } from "@/lib/cockpit/vitals-schema";
import { VitalContextFields } from "@/components/cockpit/rx/inputs/VitalContextFields";
import { LastVisitVitalGhost } from "@/components/cockpit/rx/inputs/LastVisitVitalGhost";

const HEIGHT_UNITS = ["cm", "ft/in"] as const;
type HeightUnit = (typeof HEIGHT_UNITS)[number];

function roundForDisplay(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function UnitToggle({
  activeUnit,
  onSelect,
}: {
  activeUnit: HeightUnit;
  onSelect: (unit: HeightUnit) => void;
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Height unit"
      className="inline-flex overflow-hidden rounded-md border border-border text-[10px] leading-none"
    >
      {HEIGHT_UNITS.map((unit) => {
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

function clampHeightCm(cm: number): number {
  const def = resolveVital("vitalsHtCm");
  return Math.min(def.hardMax, Math.max(def.hardMin, cm));
}

function parseIntField(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function HeightVitalField({
  label,
  ctx,
  rangeCtx,
  ghost,
  sparkline,
  trailing,
  gridSpan = 1,
}: Omit<VitalFieldProps, "vitalKey"> & { gridSpan?: 1 | 2 }): JSX.Element {
  const { state, setField } = useRxForm();
  const def = resolveVital("vitalsHtCm");
  const [unitSymbol, setUnitSymbol] = useState<HeightUnit>("cm");

  const canonical = state.fields.vitalsHtCm;
  const flag = evaluateRange("vitalsHtCm", canonical, ctx);

  const cmUnit = def.displayUnits[0]!;
  const cmInputRef = useRef<HTMLInputElement>(null);
  const displayCm: number | "" =
    canonical == null ? "" : roundForDisplay(canonical, cmUnit.precision);
  const displayCmText = displayCm === "" ? "" : String(displayCm);
  const ghostCm =
    ghost == null ? null : roundForDisplay(ghost, cmUnit.precision);

  const [cmDraft, setCmDraft] = useState(displayCmText);

  useEffect(() => {
    if (document.activeElement === cmInputRef.current) return;
    setCmDraft(displayCmText);
  }, [displayCmText]);

  const ftIn = canonical == null ? null : cmToFtIn(canonical);
  const ghostFtIn = ghost == null ? null : cmToFtIn(ghost);

  const maxFeet = Math.floor(cmToFtIn(def.hardMax).feet);
  const maxInches = 11;

  const setCanonicalCm = useCallback(
    (cm: number | null) => {
      setField("vitalsHtCm", cm == null ? null : clampHeightCm(cm));
    },
    [setField],
  );

  const commitCmDraft = useCallback(
    (raw: string) => {
      if (!raw.trim()) {
        setCmDraft("");
        setField("vitalsHtCm", null);
        return;
      }
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n)) {
        setCmDraft(displayCmText);
        return;
      }
      const clamped = clampHeightCm(n);
      const rounded = roundForDisplay(clamped, cmUnit.precision);
      setCmDraft(String(rounded));
      setField("vitalsHtCm", clamped);
    },
    [setField, displayCmText, cmUnit.precision],
  );

  const onFtInChange = (feetRaw: string, inchesRaw: string) => {
    const feet = parseIntField(feetRaw);
    const inches = parseIntField(inchesRaw);
    if (feet == null && inches == null) {
      setCanonicalCm(null);
      return;
    }
    const safeFeet = feet ?? 0;
    const safeInches = Math.min(maxInches, inches ?? 0);
    setCanonicalCm(ftInToCm(safeFeet, safeInches));
  };

  return (
    <div className={vitalGridSpanClass(gridSpan)}>
    <div className={VITAL_CELL_CLASS}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={RX_FIELD_LABEL_CLASS}>{label}</span>
        <UnitToggle activeUnit={unitSymbol} onSelect={setUnitSymbol} />
        {sparkline}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {unitSymbol === "cm" ? (
          <div className="flex min-w-[5.5rem] flex-1 items-center gap-1.5">
            <input
              ref={cmInputRef}
              type="text"
              inputMode="decimal"
              value={cmDraft}
              onChange={(e) => setCmDraft(e.target.value)}
              onBlur={() => commitCmDraft(cmDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCmDraft(cmDraft);
                  cmInputRef.current?.blur();
                }
              }}
              placeholder={ghostCm != null ? String(ghostCm) : "—"}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 w-full max-w-[8rem] tabular-nums")}
              aria-label="Height in cm"
              data-testid="height-cm-input"
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">cm</span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxFeet}
              step={1}
              value={ftIn?.feet ?? ""}
              onChange={(e) =>
                onFtInChange(e.target.value, ftIn?.inches != null ? String(ftIn.inches) : "")
              }
              placeholder={ghostFtIn != null ? String(ghostFtIn.feet) : "—"}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 w-14 shrink-0 sm:w-16")}
              aria-label="Height feet"
              data-testid="height-feet-input"
            />
            <span className="text-xs text-muted-foreground">ft</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxInches}
              step={1}
              value={ftIn?.inches ?? ""}
              onChange={(e) =>
                onFtInChange(ftIn?.feet != null ? String(ftIn.feet) : "", e.target.value)
              }
              placeholder={ghostFtIn != null ? String(ghostFtIn.inches) : "—"}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 w-14 shrink-0 sm:w-16")}
              aria-label="Height inches"
              data-testid="height-inches-input"
            />
            <span className="text-xs text-muted-foreground">in</span>
          </div>
        )}
        <RangeFlagIcon label={label} flag={flag} />
        {trailing}
      </div>

      <VitalContextFields parentKey="vitalsHtCm" noteKey="vitalsHtCm" noteLabel={label} />

      {unitSymbol === "cm" && ghostCm != null && canonical == null ? (
        <LastVisitVitalGhost
          label={label}
          displayText={`${ghostCm} cm`}
          onApply={() => setField("vitalsHtCm", ghostCm)}
          testId="vital-last-visit-vitalsHtCm"
        />
      ) : unitSymbol === "cm" && ghostCm != null ? (
        <span
          className="block text-[10px] text-muted-foreground/70"
          aria-label={`Last visit ${label}: ${ghostCm} cm`}
        >
          prev {ghostCm} cm
        </span>
      ) : null}
      {unitSymbol === "ft/in" && ghostFtIn != null && canonical == null ? (
        <LastVisitVitalGhost
          label={label}
          displayText={`${ghostFtIn.feet} ft ${ghostFtIn.inches} in`}
          onApply={() => setField("vitalsHtCm", ghostCm!)}
          testId="vital-last-visit-vitalsHtCm-ftin"
        />
      ) : unitSymbol === "ft/in" && ghostFtIn != null ? (
        <span
          className="block text-[10px] text-muted-foreground/70"
          aria-label={`Last visit ${label}: ${ghostFtIn.feet} ft ${ghostFtIn.inches} in`}
        >
          prev {ghostFtIn.feet} ft {ghostFtIn.inches} in
        </span>
      ) : null}
    </div>
    </div>
  );
}
