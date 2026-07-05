"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { VitalsGlucoseTiming } from "@/lib/cockpit/categorical-vitals-schema";
import type { VitalCategoryResult } from "@/lib/cockpit/vital-categories";
import {
  ACC_AHA_SOURCE,
  ADA_SOURCE,
  BP_ACC_AHA_ADULT_RANGES,
  GCS_SEVERITY_RANGES,
  GCS_SEVERITY_SOURCE,
  GLUCOSE_FASTING_RANGES,
  GLUCOSE_HYPOGLYCEMIA_RANGES,
  GLUCOSE_POST_PRANDIAL_RANGES,
  isAdultRangeContext,
  isFastingGlucoseTiming,
  isPostPrandialGlucoseTiming,
  resolveRegistryAdvisoryBand,
  resolveVitalRangeHelpTitle,
  SPO2_RANGES,
  SPO2_SOURCE,
  TEMPERATURE_RANGES,
  TEMP_SOURCE,
  type VitalRangeHelpKind,
  type VitalRangeReferenceRow,
} from "@/lib/cockpit/vital-range-reference";
import type { RangeContext, VitalKey } from "@/lib/cockpit/vitals-schema";
import { cn } from "@/lib/utils";

function ReferenceRowList({
  rows,
  highlightLabel,
}: {
  rows: readonly VitalRangeReferenceRow[];
  highlightLabel?: string | null;
}): JSX.Element {
  return (
    <ul className="mt-1 space-y-0.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className={cn(
            "flex justify-between gap-2 text-[11px] leading-snug text-muted-foreground",
            highlightLabel === row.label && "rounded-sm bg-muted/60 px-1 -mx-1",
          )}
        >
          <span>{row.label}</span>
          <span className="shrink-0 tabular-nums text-foreground">{row.range}</span>
        </li>
      ))}
    </ul>
  );
}

function ReferenceSection({
  title,
  source,
  rows,
  highlightLabel,
}: {
  title: string;
  source?: string;
  rows: readonly VitalRangeReferenceRow[];
  highlightLabel?: string | null;
}): JSX.Element {
  return (
    <div>
      <p className="text-[11px] font-medium text-foreground">{title}</p>
      {source ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">Advisory · {source}</p>
      ) : null}
      <ReferenceRowList rows={rows} highlightLabel={highlightLabel} />
    </div>
  );
}

function CurrentReadingBanner({
  category,
}: {
  category: VitalCategoryResult | null | undefined;
}): JSX.Element | null {
  if (category == null) return null;
  return (
    <div
      className="mb-2 rounded-sm border border-border/60 bg-muted/40 px-2 py-1.5"
      data-testid="vital-range-help-current-reading"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Current reading
      </p>
      <p className="text-[11px] font-medium text-foreground">{category.label}</p>
      {category.source ? (
        <p className="text-[10px] text-muted-foreground">Advisory · {category.source}</p>
      ) : null}
    </div>
  );
}

function BpReferencePanel({
  rangeCtx,
  currentCategory,
}: {
  rangeCtx: RangeContext;
  currentCategory?: VitalCategoryResult | null;
}): JSX.Element {
  const isAdult = isAdultRangeContext(rangeCtx);

  return (
    <div className="space-y-3">
      {isAdult ? (
        <ReferenceSection
          title="Adult categories"
          source={ACC_AHA_SOURCE}
          rows={BP_ACC_AHA_ADULT_RANGES}
          highlightLabel={currentCategory?.label}
        />
      ) : (
        <div>
          <p className="text-[11px] font-medium text-foreground">Pediatric advisory</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Uses age-based systolic/diastolic reference bands from the vitals registry.
            Pair classification is not ACC/AHA tiered for patients under 13.
          </p>
          {resolveRegistryAdvisoryBand("vitalsBpSystolic", rangeCtx) ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Systolic band:{" "}
              <span className="tabular-nums text-foreground">
                {resolveRegistryAdvisoryBand("vitalsBpSystolic", rangeCtx)!.low}–
                {resolveRegistryAdvisoryBand("vitalsBpSystolic", rangeCtx)!.high} mmHg
              </span>
            </p>
          ) : null}
          {resolveRegistryAdvisoryBand("vitalsBpDiastolic", rangeCtx) ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Diastolic band:{" "}
              <span className="tabular-nums text-foreground">
                {resolveRegistryAdvisoryBand("vitalsBpDiastolic", rangeCtx)!.low}–
                {resolveRegistryAdvisoryBand("vitalsBpDiastolic", rangeCtx)!.high} mmHg
              </span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GlucoseReferencePanel({
  glucoseTiming,
  currentCategory,
}: {
  glucoseTiming?: VitalsGlucoseTiming | null;
  currentCategory?: VitalCategoryResult | null;
}): JSX.Element {
  const showFasting = glucoseTiming == null || isFastingGlucoseTiming(glucoseTiming);
  const showPostPrandial =
    glucoseTiming == null || isPostPrandialGlucoseTiming(glucoseTiming);

  return (
    <div className="space-y-3">
      <ReferenceSection
        title="Hypoglycemia (all timings)"
        source={ADA_SOURCE}
        rows={GLUCOSE_HYPOGLYCEMIA_RANGES}
        highlightLabel={
          currentCategory?.label.startsWith("Hypoglycemia") ||
          currentCategory?.label.startsWith("Severe hypoglycemia")
            ? currentCategory.label
            : null
        }
      />
      {showFasting ? (
        <ReferenceSection
          title="Fasting / pre-meal"
          source={ADA_SOURCE}
          rows={GLUCOSE_FASTING_RANGES}
          highlightLabel={
            isFastingGlucoseTiming(glucoseTiming) ? currentCategory?.label : null
          }
        />
      ) : null}
      {showPostPrandial ? (
        <ReferenceSection
          title="Post-prandial / random"
          source={ADA_SOURCE}
          rows={GLUCOSE_POST_PRANDIAL_RANGES}
          highlightLabel={
            isPostPrandialGlucoseTiming(glucoseTiming) ? currentCategory?.label : null
          }
        />
      ) : null}
    </div>
  );
}

function VitalKeyReferencePanel({
  kind,
  rangeCtx,
  currentCategory,
}: {
  kind: VitalKey;
  rangeCtx: RangeContext;
  currentCategory?: VitalCategoryResult | null;
}): JSX.Element | null {
  if (kind === "vitalsTempC") {
    return (
      <ReferenceSection
        title="Temperature categories"
        source={TEMP_SOURCE}
        rows={TEMPERATURE_RANGES}
        highlightLabel={currentCategory?.label}
      />
    );
  }

  if (kind === "vitalsSpo2") {
    return (
      <ReferenceSection
        title="SpO₂ categories"
        source={SPO2_SOURCE}
        rows={SPO2_RANGES}
        highlightLabel={currentCategory?.label}
      />
    );
  }

  if (kind === "vitalsGcsTotal") {
    return (
      <ReferenceSection
        title="Total GCS severity"
        source={GCS_SEVERITY_SOURCE}
        rows={GCS_SEVERITY_RANGES}
        highlightLabel={currentCategory?.label}
      />
    );
  }

  const band = resolveRegistryAdvisoryBand(kind, rangeCtx);
  if (band == null) return null;

  return (
    <div>
      <p className="text-[11px] font-medium text-foreground">Advisory normal range</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {band.label}:{" "}
        <span className="tabular-nums text-foreground">
          {band.low}–{band.high} {band.unit}
        </span>
      </p>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Band adjusts for patient age and sex where applicable.
      </p>
    </div>
  );
}

export interface VitalRangeHelpProps {
  kind: VitalRangeHelpKind;
  rangeCtx?: RangeContext;
  glucoseTiming?: VitalsGlucoseTiming | null;
  currentCategory?: VitalCategoryResult | null;
  variant?: "inline" | "title";
}

/** On-demand vital range / classifier reference — mirrors DerivedVitalsHelp pattern. */
export function VitalRangeHelp({
  kind,
  rangeCtx = {},
  glucoseTiming,
  currentCategory,
  variant = "title",
}: VitalRangeHelpProps): JSX.Element {
  const isInline = variant === "inline";
  const title = resolveVitalRangeHelpTitle(kind);
  const testIdSuffix = kind === "bp" || kind === "glucose" ? kind : kind;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            isInline ? "size-4" : "size-5",
          )}
          aria-label={`${title}`}
          data-testid={`vital-range-help-${testIdSuffix}`}
        >
          <HelpCircle className={cn(isInline ? "size-3" : "size-3.5")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={isInline ? "top" : "bottom"}
        className={cn("max-h-[min(24rem,70vh)] overflow-y-auto p-3", isInline ? "w-[15rem]" : "w-[17rem]")}
        data-testid={`vital-range-help-panel-${testIdSuffix}`}
      >
        <p className="mb-2 text-[11px] font-medium text-foreground">{title}</p>
        <CurrentReadingBanner category={currentCategory} />
        {kind === "bp" ? (
          <BpReferencePanel rangeCtx={rangeCtx} currentCategory={currentCategory} />
        ) : kind === "glucose" ? (
          <GlucoseReferencePanel
            glucoseTiming={glucoseTiming}
            currentCategory={currentCategory}
          />
        ) : (
          <VitalKeyReferencePanel
            kind={kind}
            rangeCtx={rangeCtx}
            currentCategory={currentCategory}
          />
        )}
        <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
          Advisory only — not a diagnosis.
        </p>
      </PopoverContent>
    </Popover>
  );
}
