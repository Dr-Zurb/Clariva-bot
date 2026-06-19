"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  resolveVital,
  type RangeContext,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import { evaluateRange, type RangeFlag } from "@/lib/cockpit/vitals-derive";

/** Last-visit canonical values, keyed by numeric vital key (read-only ghosts). */
export type GhostVitals = Partial<Record<VitalKey, number>>;

function roundForUnit(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Out-of-range flag — extends the BMI-badge color-exception idea (not tokens).
// See frontend/lib/cockpit/__color-exceptions.md
// ---------------------------------------------------------------------------

export function RangeFlagIcon({ label, flag }: { label: string; flag: RangeFlag }): JSX.Element | null {
  if (flag == null || flag === "normal") return null;
  const isHigh = flag === "high";
  const colorClass = isHigh ? "text-red-600" : "text-blue-600";
  const description = isHigh ? "above normal range" : "below normal range";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex shrink-0 items-center ${colorClass}`}
          aria-label={`${label} ${description}`}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {label} {description}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Derived value badge (MAP / BSA) — computed only, never editable.
// ---------------------------------------------------------------------------

export function DerivedBadge({ text, ariaLabel, title }: { text: string; ariaLabel: string; title: string }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          aria-label={ariaLabel}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Per-field display-unit toggle (display-only; storage stays canonical).
// ---------------------------------------------------------------------------

function UnitToggle({
  fieldLabel,
  units,
  activeUnit,
  onSelect,
}: {
  fieldLabel: string;
  units: readonly string[];
  activeUnit: string;
  onSelect: (unit: string) => void;
}): JSX.Element | null {
  if (units.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={`${fieldLabel} unit`}
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

// ---------------------------------------------------------------------------
// Shared numeric vital field — registry-driven units, range flag, ghost.
// Conversion happens only at the display edge (P2-D2): `setField` always
// stores the canonical value.
// ---------------------------------------------------------------------------

export interface VitalFieldProps {
  vitalKey: VitalKey;
  /** Explicit short label (kept stable for the shipped core fields). */
  label: string;
  ctx?: RangeContext;
  /** Previous-visit canonical value (read-only ghost). */
  ghost?: number | null;
  /** Extra computed badges (e.g. BMI/BSA) rendered after the flag. */
  trailing?: React.ReactNode;
}

export function VitalField({ vitalKey, label, ctx, ghost, trailing }: VitalFieldProps): JSX.Element {
  const { state, setField } = useRxForm();
  const def = resolveVital(vitalKey);
  const [unitSymbol, setUnitSymbol] = useState<string>(def.displayUnits[0].unit);
  const activeUnit = def.displayUnits.find((u) => u.unit === unitSymbol) ?? def.displayUnits[0];

  const canonical = (state.fields[vitalKey] as number | null) ?? null;
  const flag = evaluateRange(vitalKey, canonical, ctx);

  const displayValue: number | "" =
    canonical == null ? "" : roundForUnit(activeUnit.fromCanonical(canonical), activeUnit.precision);
  const ghostDisplay =
    ghost == null ? null : roundForUnit(activeUnit.fromCanonical(ghost), activeUnit.precision);

  const min = roundForUnit(activeUnit.fromCanonical(def.hardMin), activeUnit.precision);
  const max = roundForUnit(activeUnit.fromCanonical(def.hardMax), activeUnit.precision);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setField(vitalKey, null as RxFormFields[typeof vitalKey]);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setField(vitalKey, activeUnit.toCanonical(n) as RxFormFields[typeof vitalKey]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={RX_FIELD_LABEL_CLASS}>{label}</span>
        <UnitToggle
          fieldLabel={label}
          units={def.displayUnits.map((u) => u.unit)}
          activeUnit={activeUnit.unit}
          onSelect={setUnitSymbol}
        />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={activeUnit.step}
            value={displayValue}
            onChange={onChange}
            placeholder={ghostDisplay != null ? String(ghostDisplay) : "—"}
            className={`${RX_FIELD_INPUT_CLASS} mt-0 w-full`}
            aria-label={`${label} in ${activeUnit.unit}`}
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{activeUnit.unit}</span>
        </div>
        <RangeFlagIcon label={label} flag={flag} />
        {trailing}
      </div>
      {ghostDisplay != null && (
        <span
          className="block text-[10px] text-muted-foreground/70"
          aria-label={`Last visit ${label}: ${ghostDisplay} ${activeUnit.unit}`}
        >
          prev {ghostDisplay} {activeUnit.unit}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categorical BP qualifiers (posture / limb) — plain selects over allowed sets.
// ---------------------------------------------------------------------------

const POSTURE_OPTIONS = [
  { value: "sitting", label: "Sitting" },
  { value: "standing", label: "Standing" },
  { value: "supine", label: "Supine" },
] as const;

const LIMB_OPTIONS = [
  { value: "left_arm", label: "Left arm" },
  { value: "right_arm", label: "Right arm" },
  { value: "left_leg", label: "Left leg" },
  { value: "right_leg", label: "Right leg" },
] as const;

function PostureSelect(): JSX.Element {
  const { state, setField } = useRxForm();
  return (
    <div className="space-y-1.5">
      <label htmlFor="vitalsBpPosture" className={RX_FIELD_LABEL_CLASS}>
        BP posture
      </label>
      <select
        id="vitalsBpPosture"
        value={state.fields.vitalsBpPosture ?? ""}
        onChange={(e) =>
          setField("vitalsBpPosture", (e.target.value || null) as RxFormFields["vitalsBpPosture"])
        }
        className={`${RX_FIELD_INPUT_CLASS}`}
        aria-label="BP measurement posture"
      >
        <option value="">—</option>
        {POSTURE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LimbSelect(): JSX.Element {
  const { state, setField } = useRxForm();
  return (
    <div className="space-y-1.5">
      <label htmlFor="vitalsBpLimb" className={RX_FIELD_LABEL_CLASS}>
        BP limb
      </label>
      <select
        id="vitalsBpLimb"
        value={state.fields.vitalsBpLimb ?? ""}
        onChange={(e) =>
          setField("vitalsBpLimb", (e.target.value || null) as RxFormFields["vitalsBpLimb"])
        }
        className={`${RX_FIELD_INPUT_CLASS}`}
        aria-label="BP measurement limb"
      >
        <option value="">—</option>
        {LIMB_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extended-vitals group + collapsible pediatric group.
// ---------------------------------------------------------------------------

export interface VitalsExtendedProps {
  ctx?: RangeContext;
  ghost?: GhostVitals | null;
}

export function VitalsExtended({ ctx, ghost }: VitalsExtendedProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <span className={RX_FIELD_LABEL_CLASS}>Extended</span>
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <VitalField vitalKey="vitalsRr" label="Resp rate" ctx={ctx} ghost={ghost?.vitalsRr} />
          <VitalField vitalKey="vitalsPainScore" label="Pain" ghost={ghost?.vitalsPainScore} />
          <VitalField vitalKey="vitalsGlucoseMgDl" label="Glucose" ctx={ctx} ghost={ghost?.vitalsGlucoseMgDl} />
          <VitalField vitalKey="vitalsGcsTotal" label="GCS" ghost={ghost?.vitalsGcsTotal} />
          <VitalField vitalKey="vitalsWaistCm" label="Waist" ctx={ctx} ghost={ghost?.vitalsWaistCm} />
          <PostureSelect />
          <LimbSelect />
        </div>
      </div>

      <details className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
          Pediatric vitals
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <VitalField
            vitalKey="vitalsHeadCircumferenceCm"
            label="Head circ."
            ghost={ghost?.vitalsHeadCircumferenceCm}
          />
          <VitalField vitalKey="vitalsMuacCm" label="MUAC" ghost={ghost?.vitalsMuacCm} />
        </div>
      </details>
    </div>
  );
}
