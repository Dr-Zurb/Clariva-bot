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
  EXTENDED_VITAL_GROUPS,
  hasVisibleGcsScore,
  VITAL_GROUP_LABELS,
  VITALS_AUTO_GRID_CLASS,
  VITALS_GRID_CLASS,
  VITALS_GROUP_CARD_CLASS,
  VITALS_GROUP_HEADING_CLASS,
  VITAL_CELL_CLASS,
  VITAL_GRID_UNIT_SPAN_CLASS,
  contextKeysForNumericVital,
  vitalGridSpan,
  vitalGridSpanClass,
  visibleStandaloneCategoricalVitalsInGroup,
  visibleNumericVitalsInGroupExcludingGcs,
  visibleVitalsInGroup,
  vitalFieldShortLabel,
  vitalSparklineLabel,
} from "@/lib/cockpit/vitals-group-layout";
import {
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import {
  resolveVital,
  type RangeContext,
  type VitalGroup,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import { evaluateRange, categorizeVital, type RangeFlag } from "@/lib/cockpit/vitals-derive";
import {
  categoryIconClass,
  rangeFlagToCategory,
  type VitalCategoryResult,
} from "@/lib/cockpit/vital-categories";
import { CategoricalVitalSelect } from "@/components/cockpit/rx/inputs/CategoricalVitalSelect";
import { CustomVitalsGridFields } from "@/components/cockpit/rx/inputs/CustomVitalField";
import { GcsScoreSection } from "@/components/cockpit/rx/inputs/GcsScoreSection";
import {
  hasVisiblePupilCluster,
  PupilsSection,
} from "@/components/cockpit/rx/inputs/PupilsSection";
import { VitalContextFields } from "@/components/cockpit/rx/inputs/VitalContextFields";
import { VitalLowConfidenceBadge } from "@/components/cockpit/rx/inputs/VitalLowConfidenceBadge";
import { VitalQuickFillChips } from "@/components/cockpit/rx/inputs/VitalQuickFillChips";
import { VitalRangeHelp } from "@/components/cockpit/rx/inputs/VitalRangeHelp";
import { LastVisitVitalGhost } from "@/components/cockpit/rx/inputs/LastVisitVitalGhost";
import type { CustomVitalDef, CustomVitalValueMap } from "@/lib/cockpit/vitals-custom";
import type { CustomVitalTrendSeries } from "@/lib/cockpit/custom-vitals-trends";
import { deviceContextKeyForParent, resolveVitalLowConfidence } from "@/lib/cockpit/vital-confidence";
import { resolveEffectiveMeasurementProvenance } from "@/lib/cockpit/measurement-context";
import { resolveVitalQuickFillOptions } from "@/lib/cockpit/vitals-quick-fill";
import { vitalKeyHasRangeReference } from "@/lib/cockpit/vital-range-reference";
import { cn } from "@/lib/utils";

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

export function RangeFlagIcon({
  label,
  flag,
  category,
}: {
  label: string;
  flag?: RangeFlag | null;
  category?: VitalCategoryResult | null;
}): JSX.Element | null {
  const resolved =
    category ??
    (flag != null && flag !== "normal" ? rangeFlagToCategory(label, flag) : null);
  if (resolved == null || resolved.severity === "normal") return null;

  const colorClass = categoryIconClass(resolved);
  const directionText =
    resolved.direction === "low"
      ? "below expected range"
      : resolved.direction === "high"
        ? "above expected range"
        : "outside expected range";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex shrink-0 items-center ${colorClass}`}
          aria-label={`${label}: ${resolved.label}`}
          data-testid={`vital-category-icon-${resolved.severity}`}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{resolved.label}</p>
        <p className="text-xs text-muted-foreground">{directionText}</p>
        {resolved.source ? (
          <p className="mt-1 text-[10px] text-muted-foreground">Advisory · {resolved.source}</p>
        ) : null}
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
  /** Patient age/sex for advisory categorization. */
  rangeCtx?: RangeContext;
  /** Previous-visit canonical value (read-only ghost). */
  ghost?: number | null;
  /** Inline recent-trend sparkline (obj-26); read-only. */
  sparkline?: React.ReactNode;
  /** Extra computed badges (e.g. BMI/BSA) rendered after the flag. */
  trailing?: React.ReactNode;
  /** Auto-fit grid column span (1 = compact, 2 = rich context). */
  gridSpan?: 1 | 2;
}

export function VitalField({
  vitalKey,
  label,
  ctx,
  rangeCtx,
  ghost,
  sparkline,
  trailing,
  gridSpan,
}: VitalFieldProps): JSX.Element {
  const { state, setField } = useRxForm();
  const def = resolveVital(vitalKey);
  const [unitSymbol, setUnitSymbol] = useState<string>(def.displayUnits[0].unit);
  const activeUnit = def.displayUnits.find((u) => u.unit === unitSymbol) ?? def.displayUnits[0];
  const span = gridSpan ?? vitalGridSpan(vitalKey);

  const flagCtx = rangeCtx ?? ctx ?? {};
  const canonical = (state.fields[vitalKey] as number | null) ?? null;
  const flag = evaluateRange(vitalKey, canonical, flagCtx);
  const category = categorizeVital(vitalKey, canonical, flagCtx);
  const effectiveMeasuredBy = resolveEffectiveMeasurementProvenance(
    state.fields.vitalsMeasurementContext,
    state.fields.vitalsProvenanceOverrides[vitalKey],
  ).measuredBy;
  const contextKeys = contextKeysForNumericVital(vitalKey);
  const deviceContextKey = deviceContextKeyForParent(contextKeys);
  const deviceValue =
    deviceContextKey != null
      ? (state.fields[deviceContextKey as keyof typeof state.fields] as string | null)
      : null;
  const lowConfidenceReason = resolveVitalLowConfidence({
    measuredBy: effectiveMeasuredBy,
    vitalKey,
    deviceContextKey,
    deviceValue,
  });

  const displayValue: number | "" =
    canonical == null ? "" : roundForUnit(activeUnit.fromCanonical(canonical), activeUnit.precision);
  const ghostDisplay =
    ghost == null ? null : roundForUnit(activeUnit.fromCanonical(ghost), activeUnit.precision);

  const min = roundForUnit(activeUnit.fromCanonical(def.hardMin), activeUnit.precision);
  const max = roundForUnit(activeUnit.fromCanonical(def.hardMax), activeUnit.precision);
  const quickFillOptions = resolveVitalQuickFillOptions(vitalKey, activeUnit, ctx ?? {});

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
    <div className={vitalGridSpanClass(span)}>
      <div className={VITAL_CELL_CLASS}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={RX_FIELD_LABEL_CLASS}>{label}</span>
        {vitalKeyHasRangeReference(vitalKey, flagCtx) ? (
          <VitalRangeHelp
            kind={vitalKey}
            rangeCtx={flagCtx}
            currentCategory={category}
          />
        ) : null}
        {sparkline}
        {lowConfidenceReason ? (
          <VitalLowConfidenceBadge
            reason={lowConfidenceReason}
            testId={`vital-low-confidence-badge-${vitalKey}`}
          />
        ) : null}
        <UnitToggle
          fieldLabel={label}
          units={def.displayUnits.map((u) => u.unit)}
          activeUnit={activeUnit.unit}
          onSelect={setUnitSymbol}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[5.5rem] shrink-0 items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={activeUnit.step}
            value={displayValue}
            onChange={onChange}
            placeholder={ghostDisplay != null ? String(ghostDisplay) : "—"}
            className={`${RX_FIELD_INPUT_CLASS} mt-0 w-full max-w-[8rem]`}
            aria-label={`${label} in ${activeUnit.unit}`}
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{activeUnit.unit}</span>
        </div>
        {displayValue === "" && quickFillOptions.length > 0 ? (
          <VitalQuickFillChips
            options={quickFillOptions}
            onSelect={(index) => {
              const option = quickFillOptions[index];
              if (option == null) return;
              setField(vitalKey, option.canonicalValue as RxFormFields[typeof vitalKey]);
            }}
            testIdPrefix={`vital-${vitalKey}`}
            ariaGroupLabel={`Common ${label} values`}
          />
        ) : null}
        <RangeFlagIcon label={label} flag={flag} category={category} />
        {trailing}
      </div>
      <VitalContextFields parentKey={vitalKey} noteKey={vitalKey} noteLabel={label} />
      {ghostDisplay != null && canonical == null ? (
        <LastVisitVitalGhost
          label={label}
          displayText={`${ghostDisplay} ${activeUnit.unit}`}
          onApply={() => setField(vitalKey, ghost as RxFormFields[typeof vitalKey])}
          testId={`vital-last-visit-${vitalKey}`}
        />
      ) : ghostDisplay != null ? (
        <span
          className="block text-[10px] text-muted-foreground/70"
          aria-label={`Last visit ${label}: ${ghostDisplay} ${activeUnit.unit}`}
        >
          prev {ghostDisplay} {activeUnit.unit}
        </span>
      ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extended-vitals groups (registry-driven) + collapsible pediatric group.
// ---------------------------------------------------------------------------

export interface VitalsExtendedProps {
  ctx?: RangeContext;
  /** Patient demographics for advisory categorization on inline fields. */
  rangeCtx?: RangeContext;
  ghost?: GhostVitals | null;
  /** Render a read-only sparkline per numeric vital (obj-26). */
  sparklineFor?: (vitalKey: VitalKey, label: string) => React.ReactNode;
  /** When set, only these numeric vitals are rendered (vit-08). */
  visibleKeys?: ReadonlySet<VitalKey>;
  /** When set, only these categorical vitals are rendered (vit-08). */
  visibleCategoricalKeys?: ReadonlySet<CategoricalVitalKey>;
  /** vit-14: doctor-authored custom vitals interleaved by group. */
  customVitals?: readonly CustomVitalDef[];
  customVitalValues?: CustomVitalValueMap;
  onCustomVitalChange?: (id: string, value: number | string | null) => void;
  customVitalsDisabled?: boolean;
  byCustomTrendId?: Readonly<Record<string, CustomVitalTrendSeries>>;
  customTrendsLoading?: boolean;
}

function VitalsGroupCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={VITALS_GROUP_CARD_CLASS} data-testid={testId}>
      <h3 className={VITALS_GROUP_HEADING_CLASS}>{title}</h3>
      <div className={VITALS_GRID_CLASS}>{children}</div>
    </section>
  );
}

function VitalGroupGrid({
  groupLabel,
  vitalKeys,
  categoricalKeys,
  customVitals = [],
  customVitalValues = {},
  onCustomVitalChange,
  customVitalsDisabled = false,
  byCustomTrendId,
  customTrendsLoading = false,
  showGcsSection,
  showPupilsSection,
  ctx,
  rangeCtx,
  ghost,
  sparklineFor,
  visibleKeys,
  visibleCategoricalKeys,
}: {
  groupLabel: string;
  vitalKeys: readonly VitalKey[];
  categoricalKeys: readonly CategoricalVitalKey[];
  customVitals?: readonly CustomVitalDef[];
  customVitalValues?: CustomVitalValueMap;
  onCustomVitalChange?: (id: string, value: number | string | null) => void;
  customVitalsDisabled?: boolean;
  byCustomTrendId?: Readonly<Record<string, CustomVitalTrendSeries>>;
  customTrendsLoading?: boolean;
  showGcsSection?: boolean;
  showPupilsSection?: boolean;
  ctx?: RangeContext;
  rangeCtx?: RangeContext;
  ghost?: GhostVitals | null;
  sparklineFor?: (vitalKey: VitalKey, label: string) => React.ReactNode;
  visibleKeys?: ReadonlySet<VitalKey>;
  visibleCategoricalKeys?: ReadonlySet<CategoricalVitalKey>;
}): JSX.Element {
  return (
    <VitalsGroupCard title={groupLabel} testId={`vitals-group-${groupLabel.toLowerCase().replace(/\s+/g, "-")}`}>
        {vitalKeys.map((vitalKey) => (
          <VitalField
            key={vitalKey}
            vitalKey={vitalKey}
            label={vitalFieldShortLabel(vitalKey)}
            ctx={ctx}
            rangeCtx={rangeCtx}
            ghost={ghost?.[vitalKey]}
            sparkline={sparklineFor?.(vitalKey, vitalSparklineLabel(vitalKey))}
            gridSpan={vitalGridSpan(vitalKey)}
          />
        ))}
        {categoricalKeys.map((vitalKey) => (
          <div key={vitalKey} className={VITAL_GRID_UNIT_SPAN_CLASS}>
            <div className={VITAL_CELL_CLASS}>
              <CategoricalVitalSelect vitalKey={vitalKey} />
            </div>
          </div>
        ))}
        {showGcsSection ? (
          <GcsScoreSection visibleKeys={visibleKeys} sparklineFor={sparklineFor} rangeCtx={rangeCtx} />
        ) : null}
        {showPupilsSection ? (
          <PupilsSection
            visibleNumericKeys={visibleKeys}
            visibleCategoricalKeys={visibleCategoricalKeys}
            rangeCtx={rangeCtx}
          />
        ) : null}
        {onCustomVitalChange ? (
          <CustomVitalsGridFields
            defs={customVitals}
            values={customVitalValues}
            disabled={customVitalsDisabled}
            byCustomTrendId={byCustomTrendId}
            trendsLoading={customTrendsLoading}
            onChange={onCustomVitalChange}
          />
        ) : null}
    </VitalsGroupCard>
  );
}

export function VitalsExtended({
  ctx,
  rangeCtx,
  ghost,
  sparklineFor,
  visibleKeys,
  visibleCategoricalKeys,
  customVitals = [],
  customVitalValues = {},
  onCustomVitalChange,
  customVitalsDisabled = false,
  byCustomTrendId,
  customTrendsLoading = false,
}: VitalsExtendedProps): JSX.Element {
  const customByGroup = (group: VitalGroup): CustomVitalDef[] =>
    customVitals.filter((def) => def.group === group);

  const paediatricKeys = visibleVitalsInGroup("paediatric", visibleKeys);
  const paediatricCustom = customByGroup("paediatric");
  const extendedGroups = EXTENDED_VITAL_GROUPS.map((group) => ({
    group,
    numericKeys:
      group === "neuro"
        ? visibleNumericVitalsInGroupExcludingGcs(group, visibleKeys)
        : visibleVitalsInGroup(group, visibleKeys),
    categoricalKeys: visibleStandaloneCategoricalVitalsInGroup(group, visibleCategoricalKeys),
    customDefs: customByGroup(group),
    showGcs: group === "neuro" && hasVisibleGcsScore(visibleKeys),
    showPupils:
      group === "neuro" && hasVisiblePupilCluster(visibleKeys, visibleCategoricalKeys),
  })).filter(
    (section) =>
      section.numericKeys.length > 0 ||
      section.categoricalKeys.length > 0 ||
      section.customDefs.length > 0 ||
      section.showGcs ||
      section.showPupils,
  );

  const showExtendedBlock = extendedGroups.length > 0;
  const showPediatric = paediatricKeys.length > 0 || paediatricCustom.length > 0;

  if (!showExtendedBlock && !showPediatric) {
    return <></>;
  }

  return (
    <div className="space-y-3">
      {extendedGroups.map(({ group, numericKeys, categoricalKeys, customDefs, showGcs, showPupils }) => (
        <VitalGroupGrid
          key={group}
          groupLabel={VITAL_GROUP_LABELS[group]}
          vitalKeys={numericKeys}
          categoricalKeys={categoricalKeys}
          customVitals={customDefs}
          customVitalValues={customVitalValues}
          onCustomVitalChange={onCustomVitalChange}
          customVitalsDisabled={customVitalsDisabled}
          byCustomTrendId={byCustomTrendId}
          customTrendsLoading={customTrendsLoading}
          showGcsSection={showGcs}
          showPupilsSection={showPupils}
          ctx={ctx}
          rangeCtx={rangeCtx}
          ghost={ghost}
          sparklineFor={sparklineFor}
          visibleKeys={visibleKeys}
          visibleCategoricalKeys={visibleCategoricalKeys}
        />
      ))}

      {showPediatric ? (
        <details className={cn(VITALS_GROUP_CARD_CLASS, "border-dashed")}>
          <summary className={cn(VITALS_GROUP_HEADING_CLASS, "cursor-pointer select-none list-none")}>
            {VITAL_GROUP_LABELS.paediatric} vitals
          </summary>
          <div className={cn(VITALS_GRID_CLASS, "mt-2")}>
            {paediatricKeys.map((vitalKey) => (
              <VitalField
                key={vitalKey}
                vitalKey={vitalKey}
                label={vitalFieldShortLabel(vitalKey)}
                rangeCtx={rangeCtx}
                ghost={ghost?.[vitalKey]}
                sparkline={sparklineFor?.(vitalKey, vitalSparklineLabel(vitalKey))}
                gridSpan={vitalGridSpan(vitalKey)}
              />
            ))}
            {onCustomVitalChange ? (
              <CustomVitalsGridFields
                defs={paediatricCustom}
                values={customVitalValues}
                disabled={customVitalsDisabled}
                byCustomTrendId={byCustomTrendId}
                trendsLoading={customTrendsLoading}
                onChange={onCustomVitalChange}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
