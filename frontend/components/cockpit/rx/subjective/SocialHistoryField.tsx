"use client";

import { useMemo } from "react";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { historyFieldInputId } from "@/lib/cockpit/history-field-chips";
import {
  auditCClinicalHint,
  auditCHasPersistedData,
  auditCScore,
  auditFullClinicalHint,
  auditFullHasPersistedData,
  auditFullScore,
  AUDIT_10_EXTENDED_QUESTIONS,
  AUDIT_10_SCREEN_HELPER,
  AUDIT_C_QUESTIONS,
  AUDIT_C_SCREEN_HELPER,
  AUDIT_FULL_SEVERITY_LABELS,
  cageHasPersistedData,
  cageScore,
  CAGE_QUESTIONS,
  CAGE_SCREEN_HELPER,
  isAuditCPanelOpen,
  isAuditFullPanelOpen,
  isCagePanelOpen,
  packYearsClinicalHint,
  type AuditFullQuestionKey,
} from "@/lib/cockpit/social-history-indices";
import {
  AlcoholDrinkRows,
  ensureAlcoholDrinkIds,
  hazardousUnitsLabel,
  StandardUnitsInfo,
} from "@/components/cockpit/rx/subjective/AlcoholDrinkRows";
import {
  alcoholClinicalHints,
  bingeSessionClinicalHint,
  normalizeAlcoholSection,
  standardUnitsPerWeekFromDrinks,
  type AlcoholDrinkRow,
} from "@/lib/cockpit/social-history-alcohol-drinks";
import { smokingPackYearsFromProducts } from "@/lib/cockpit/social-history-tobacco-products";
import {
  ensureTobaccoProductIds,
  PackYearsInfo,
  TobaccoProductRows,
} from "@/components/cockpit/rx/subjective/TobaccoProductRows";
import { SubstancesSection } from "@/components/cockpit/rx/subjective/SubstancesSection";
import { DietSection } from "@/components/cockpit/rx/subjective/DietSection";
import { CaffeineSection } from "@/components/cockpit/rx/subjective/CaffeineSection";
import { ActivitySection } from "@/components/cockpit/rx/subjective/ActivitySection";
import type { TobaccoProductRow } from "@/lib/cockpit/social-history-tobacco-products";
import {
  contextClusterFilledCount,
  contextClusterHasContent,
  formatSocialHistoryClusterPreview,
  formatSocialHistoryPreview,
  lifestyleClusterFilledCount,
  lifestyleClusterHasContent,
  serializeContextCluster,
  serializeLifestyleCluster,
  serializeSexualCluster,
  serializeSubstanceUseCluster,
  serializeWellbeingCluster,
  sexualClusterFilledCount,
  sexualClusterHasContent,
  setAlcohol,
  setLiving,
  setOccupation,
  setSexual,
  setSleep,
  setSmoking,
  setSmokeless,
  setSocialHistoryNotes,
  setStress,
  setSickContact,
  setTravel,
  substanceUseClusterFilledCount,
  substanceUseClusterHasContent,
  wellbeingClusterFilledCount,
  wellbeingClusterHasContent,
  type SocialHistoryDurationUnit,
  type SocialHistoryStructured,
  type SmokingStatus,
} from "@/lib/cockpit/social-history";
import {
  SICK_CONTACT_CONTEXT_OPTIONS,
  SICK_CONTACT_TYPE_OPTIONS,
  type SickContactSectionInput,
} from "@/lib/cockpit/social-history-sick-contact";
import {
  SLEEP_FLAG_OPTIONS,
  STRESS_SOURCE_OPTIONS,
  sleepHasContent,
  wellbeingClinicalHints,
  type SleepSectionInput,
  type StressSectionInput,
} from "@/lib/cockpit/social-history-wellbeing";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { SubjectiveSectionTemplateButton } from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import {
  durationUnitChipLabel,
  maxForDurationUnit,
  SOCIAL_HISTORY_DURATION_UNITS,
} from "@/lib/cockpit/social-history-indices";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";

const SMOKING_STATUS_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: "never", label: "Non-smoker" },
  { value: "current", label: "Smoker" },
  { value: "ex", label: "Ex-smoker" },
];

const SMOKELESS_STATUS_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: "never", label: "No tobacco" },
  { value: "current", label: "Uses tobacco" },
  { value: "ex", label: "Former user" },
];

const ALCOHOL_STATUS_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: "never", label: "No alcohol" },
  { value: "current", label: "Drinks alcohol" },
  { value: "ex", label: "Ex-drinker" },
];

const OCCUPATION_EXPOSURES = [
  { value: "dust/silica", label: "Dust/silica" },
  { value: "chemicals", label: "Chemicals" },
  { value: "heat", label: "Heat" },
  { value: "heavy-lifting", label: "Heavy lifting" },
  { value: "screen", label: "Screen" },
] as const;

const LIVING_SITUATIONS = [
  { value: "alone", label: "Alone" },
  { value: "with-family", label: "With family" },
  { value: "institutional", label: "Care facility" },
] as const;

const SLEEP_QUALITY = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
] as const;

const STRESS_LEVELS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
] as const;

const STRESS_SUPPORT = [
  { value: "good", label: "Good" },
  { value: "limited", label: "Limited" },
  { value: "none", label: "None" },
] as const;

const SEXUAL_ACTIVE = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const SEXUAL_PARTNERS = [
  { value: "single", label: "Single partner" },
  { value: "multiple", label: "Multiple partners" },
] as const;

const SEXUAL_PROTECTION = [
  { value: "always", label: "Always" },
  { value: "sometimes", label: "Sometimes" },
  { value: "never", label: "Never" },
] as const;

export interface SocialHistoryFieldProps {
  value: SocialHistoryStructured;
  disabled?: boolean;
  onChange: (next: SocialHistoryStructured) => void;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

interface StatusChipRowProps {
  label: string;
  options: readonly { value: SmokingStatus; label: string }[];
  selected: SmokingStatus | undefined;
  disabled?: boolean;
  testId: string;
  onSelect: (status: SmokingStatus) => void;
}

function StatusChipRow({
  label,
  options,
  selected,
  disabled = false,
  testId,
  onSelect,
}: StatusChipRowProps) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={option.label}
              onClick={() => onSelect(option.value)}
              className={cn(
                CHIP_CLASS,
                isSelected
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MultiTypeChipRowProps {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  disabled?: boolean;
  testId: string;
  onToggle: (typeValue: string) => void;
}

function MultiTypeChipRow({
  label,
  options,
  selected,
  disabled = false,
  testId,
  onToggle,
}: MultiTypeChipRowProps) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={option.label}
              onClick={() => onToggle(option.value)}
              className={cn(
                CHIP_CLASS,
                isSelected
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SingleSelectChipRowProps {
  label: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  selected: string | undefined;
  disabled?: boolean;
  testId: string;
  onSelect: (value: string | undefined) => void;
}

function SingleSelectChipRow({
  label,
  hint,
  options,
  selected,
  disabled = false,
  testId,
  onSelect,
}: SingleSelectChipRowProps) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={option.label}
              onClick={() => onSelect(isSelected ? undefined : option.value)}
              className={cn(
                CHIP_CLASS,
                isSelected
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}

function TextField({
  id,
  label,
  hint,
  value,
  disabled = false,
  placeholder,
  maxLength = 200,
  onChange,
}: TextFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground/80">
        {label}
      </label>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
      />
    </div>
  );
}

function clusterContainerPreview(serialized: string): string | undefined {
  const preview = formatSocialHistoryClusterPreview(serialized);
  return preview ? `— ${preview}` : undefined;
}

function AlcoholScreenChip({
  label,
  summary,
  expanded,
  disabled = false,
  testId,
  controlsId,
  onToggle,
}: {
  label: string;
  summary: string;
  expanded: boolean;
  disabled?: boolean;
  testId: string;
  controlsId: string;
  onToggle: () => void;
}) {
  const scoreSuffix = summary.startsWith(`${label} (`) ? summary.slice(label.length + 2, -1) : null;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={expanded}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={scoreSuffix ? `${label}: ${scoreSuffix}` : label}
      data-testid={testId}
      onClick={onToggle}
      className={cn(
        CHIP_CLASS,
        expanded
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
      )}
    >
      {summary}
    </button>
  );
}

/** Chip label: base name, optional score in parentheses when present. */
function alcoholScreenChipSummary(
  baseLabel: string,
  score: { value: number; max: number; positive?: boolean; suffix?: string } | null,
  inProgress = false,
): string {
  if (score) {
    const extra = score.suffix ?? (score.positive ? " · positive" : "");
    return `${baseLabel} (${score.value}/${score.max}${extra})`;
  }
  if (inProgress) return `${baseLabel} (in progress)`;
  return baseLabel;
}

const DURATION_UNITS = SOCIAL_HISTORY_DURATION_UNITS;

interface DurationFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  unit: SocialHistoryDurationUnit | undefined;
  disabled?: boolean;
  testId?: string;
  onChange: (value: number | undefined, unit: SocialHistoryDurationUnit) => void;
}

function DurationField({
  id,
  label,
  value,
  unit,
  disabled = false,
  testId,
  onChange,
}: DurationFieldProps) {
  const resolvedUnit = unit ?? "years";
  const max = maxForDurationUnit(resolvedUnit);

  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap items-end gap-1.5">
        <NumberField
          id={id}
          label=""
          value={value}
          disabled={disabled}
          max={max}
          onChange={(nextValue) => onChange(nextValue, resolvedUnit)}
        />
        <div className="flex gap-1 pb-0.5" role="group" aria-label={`${label} unit`}>
          {DURATION_UNITS.map((option) => {
            const isSelected = resolvedUnit === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={option.label}
                onClick={() => onChange(value, option.value)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {durationUnitChipLabel(option.value)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  disabled?: boolean;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}

function NumberField({
  id,
  label,
  value,
  disabled = false,
  min = 0,
  max = 200,
  onChange,
}: NumberFieldProps) {
  return (
    <div className={cn("space-y-1", !label && "[&_label]:sr-only")}>
      <label htmlFor={id} className="text-xs font-medium text-foreground/80">
        {label || id}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(undefined);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        className={cn(RX_FIELD_INPUT_CLASS, "max-w-[7rem]")}
      />
    </div>
  );
}

function toggleType(types: string[], typeValue: string): string[] {
  return types.includes(typeValue)
    ? types.filter((entry) => entry !== typeValue)
    : [...types, typeValue];
}

function statusReveal(status: SmokingStatus | undefined): boolean {
  return status === "current" || status === "ex";
}

function stripProductPhaseOnly(products: TobaccoProductRow[]): TobaccoProductRow[] {
  return products.map(({ phase: _phase, ...rest }) => rest);
}

function migrateSectionQuitToProducts(
  products: TobaccoProductRow[],
  quitYearsAgo?: number,
  quitYearsUnit?: SocialHistoryDurationUnit,
): TobaccoProductRow[] {
  const next = stripProductPhaseOnly(products);
  if (quitYearsAgo == null || next.length === 0 || next.some((p) => p.quitYearsAgo != null)) {
    return next;
  }
  return next.map((product) => ({
    ...product,
    quitYearsAgo,
    ...(quitYearsUnit === "months" ? { quitYearsUnit: "months" as const } : {}),
  }));
}

function migrateSectionQuitToDrinks(
  drinks: AlcoholDrinkRow[],
  quitYearsAgo?: number,
  quitYearsUnit?: SocialHistoryDurationUnit,
): AlcoholDrinkRow[] {
  if (quitYearsAgo == null || drinks.length === 0 || drinks.some((d) => d.quitYearsAgo != null)) {
    return drinks;
  }
  return drinks.map((drink) => ({
    ...drink,
    quitYearsAgo,
    ...(quitYearsUnit === "months" ? { quitYearsUnit: "months" as const } : {}),
  }));
}

function alcoholDrinksForDisplay(
  section: Parameters<typeof normalizeAlcoholSection>[0],
): AlcoholDrinkRow[] {
  const normalized = normalizeAlcoholSection(section);
  return ensureAlcoholDrinkIds(normalized?.drinks ?? []);
}

function tobaccoProductsForDisplay(
  section: { status: SmokingStatus; products?: TobaccoProductRow[]; quitYearsAgo?: number; quitYearsUnit?: SocialHistoryDurationUnit },
): TobaccoProductRow[] {
  const products = section.products ?? [];
  const migrated =
    section.status === "ex"
      ? migrateSectionQuitToProducts(products, section.quitYearsAgo, section.quitYearsUnit)
      : products;
  return ensureTobaccoProductIds(migrated);
}

export function SocialHistoryField({
  value,
  disabled = false,
  onChange,
  sectionOpen,
  onSectionOpenChange,
}: SocialHistoryFieldProps) {
  const preview = formatSocialHistoryPreview(value);
  const inputId = historyFieldInputId("socialHistory");

  const smoking = value.smoking;
  const smokeless = value.smokeless;
  const alcohol = value.alcohol;
  const occupation = value.occupation;
  const living = value.living;
  const travel = value.travel;
  const sickContact = value.sickContact;
  const sleep = value.sleep;
  const stress = value.stress;
  const sexual = value.sexual;
  const smokingPackYearsResult = smokingPackYearsFromProducts(smoking?.products ?? []);
  const smokingPackYears = smokingPackYearsResult.packYears;
  const alcoholUnitsResult = standardUnitsPerWeekFromDrinks(alcohol?.drinks ?? []);
  const alcoholUnitsPerWeek = alcoholUnitsResult.unitsPerWeek;
  const alcoholCage = cageScore(alcohol?.cage);
  const alcoholAuditC = auditCScore(alcohol?.auditC);
  const alcoholAuditFull = auditFullScore(alcohol?.auditC, alcohol?.auditFull);
  const alcoholAuditCHint = auditCClinicalHint(alcoholAuditC);
  const alcoholAuditFullHint = auditFullClinicalHint(alcoholAuditFull);
  const alcoholBingeHint = bingeSessionClinicalHint(alcohol?.maxPerSession);
  const smokingPackYearsHint = packYearsClinicalHint(smokingPackYears);
  const alcoholClinicalHintParts = alcoholClinicalHints(alcoholUnitsPerWeek, alcoholCage);
  const cagePanelOpen = isCagePanelOpen(alcohol?.cage);
  const auditCPanelOpen = isAuditCPanelOpen(alcohol?.auditC);
  const auditFullPanelOpen = isAuditFullPanelOpen(alcohol?.auditFull, alcohol?.auditC);
  const cageChipSummary = alcoholScreenChipSummary(
    "CAGE screen",
    alcoholCage ? { value: alcoholCage.score, max: 4, positive: alcoholCage.positive } : null,
  );
  const auditCChipSummary = alcoholScreenChipSummary(
    "AUDIT-C screen",
    alcoholAuditC ? { value: alcoholAuditC.score, max: 12, positive: alcoholAuditC.positive } : null,
    auditCHasPersistedData(alcohol?.auditC) && !alcoholAuditC,
  );
  const auditFullChipSummary = alcoholScreenChipSummary(
    "AUDIT-10 screen",
    alcoholAuditFull
      ? {
          value: alcoholAuditFull.score,
          max: 40,
          suffix: ` · ${AUDIT_FULL_SEVERITY_LABELS[alcoholAuditFull.severity]}`,
        }
      : null,
    (auditFullHasPersistedData(alcohol?.auditFull) || auditCHasPersistedData(alcohol?.auditC)) &&
      !alcoholAuditFull,
  );
  const travelActive =
    travel?.recent === true ||
    Boolean(travel?.place?.trim()) ||
    travel?.vectorRisk === true;
  const noneSickContactSelected = sickContact?.present === false;
  const recentSickContactSelected = sickContact?.present === true;

  const baseSickContact = (): SickContactSectionInput => ({ ...(sickContact ?? {}) });
  const baseSleep = (): SleepSectionInput => ({ ...(sleep ?? {}) });
  const baseStress = (): StressSectionInput => ({ ...(stress ?? {}) });
  const wellbeingHints = wellbeingClinicalHints({ sleep, stress });

  const smokingProductsForDisplay = useMemo(
    () => (smoking ? tobaccoProductsForDisplay(smoking) : []),
    [smoking],
  );
  const smokelessProductsForDisplay = useMemo(
    () => (smokeless ? tobaccoProductsForDisplay(smokeless) : []),
    [smokeless],
  );

  const alcoholDrinksForDisplayMemo = useMemo(
    () => (alcohol ? alcoholDrinksForDisplay(alcohol) : []),
    [alcohol],
  );

  const substanceUsePreview = useMemo(
    () => clusterContainerPreview(serializeSubstanceUseCluster(value)),
    [value],
  );
  const lifestylePreview = useMemo(
    () => clusterContainerPreview(serializeLifestyleCluster(value)),
    [value],
  );
  const contextPreview = useMemo(
    () => clusterContainerPreview(serializeContextCluster(value)),
    [value],
  );
  const wellbeingPreview = useMemo(
    () => clusterContainerPreview(serializeWellbeingCluster(value)),
    [value],
  );
  const sexualPreview = useMemo(
    () => clusterContainerPreview(serializeSexualCluster(value)),
    [value],
  );

  const commitSexualFields = (
    patch: Partial<NonNullable<SocialHistoryStructured["sexual"]>>,
  ) => {
    const merged = {
      enabled: true as const,
      active: sexual?.active,
      partners: sexual?.partners,
      protection: sexual?.protection,
      notes: sexual?.notes,
      ...patch,
    };
    const hasAny =
      merged.active != null ||
      merged.partners != null ||
      merged.protection != null ||
      Boolean(merged.notes?.trim());
    onChange(setSexual(value, hasAny ? merged : null));
  };

  const handleSmokingStatus = (status: SmokingStatus) => {
    if (smoking?.status === status) {
      onChange(setSmoking(value, null));
      return;
    }
    onChange(
      setSmoking(value, {
        status,
        products:
          status === "never"
            ? []
            : status === "ex"
              ? migrateSectionQuitToProducts(
                  smoking?.products ?? [],
                  smoking?.quitYearsAgo,
                  smoking?.quitYearsUnit,
                )
              : [...(smoking?.products ?? [])],
      }),
    );
  };

  const handleSmokelessStatus = (status: SmokingStatus) => {
    if (smokeless?.status === status) {
      onChange(setSmokeless(value, null));
      return;
    }
    onChange(
      setSmokeless(value, {
        status,
        products:
          status === "never"
            ? []
            : status === "ex"
              ? migrateSectionQuitToProducts(
                  smokeless?.products ?? [],
                  smokeless?.quitYearsAgo,
                  smokeless?.quitYearsUnit,
                )
              : [...(smokeless?.products ?? [])],
      }),
    );
  };

  const handleAlcoholStatus = (status: SmokingStatus) => {
    if (alcohol?.status === status) {
      onChange(setAlcohol(value, null));
      return;
    }
    const baseDrinks = alcohol ? alcoholDrinksForDisplay(alcohol) : [];
    onChange(
      setAlcohol(value, {
        status,
        drinks:
          status === "never"
            ? []
            : status === "ex"
              ? migrateSectionQuitToDrinks(
                  baseDrinks,
                  alcohol?.quitYearsAgo,
                  alcohol?.quitYearsUnit,
                )
              : baseDrinks,
        ...(status === "never"
          ? {}
          : {
              cage: alcohol?.cage,
              auditC: alcohol?.auditC,
              auditFull: alcohol?.auditFull,
              maxPerSession: alcohol?.maxPerSession,
            }),
      }),
    );
  };

  const toggleCagePanel = () => {
    if (!alcohol) return;
    if (cagePanelOpen) {
      if (!cageHasPersistedData(alcohol.cage)) {
        onChange(setAlcohol(value, { ...alcohol, cage: undefined }));
        return;
      }
      onChange(
        setAlcohol(value, {
          ...alcohol,
          cage: { ...alcohol.cage!, enabled: false },
        }),
      );
      return;
    }
    onChange(
      setAlcohol(value, {
        ...alcohol,
        cage: {
          ...(alcohol.cage ?? {
            cutDown: false,
            annoyed: false,
            guilty: false,
            eyeOpener: false,
          }),
          enabled: true,
        },
      }),
    );
  };

  const toggleAuditCPanel = () => {
    if (!alcohol) return;
    if (auditCPanelOpen) {
      if (!auditCHasPersistedData(alcohol.auditC)) {
        onChange(setAlcohol(value, { ...alcohol, auditC: undefined }));
        return;
      }
      onChange(
        setAlcohol(value, {
          ...alcohol,
          auditC: { ...alcohol.auditC!, enabled: false },
        }),
      );
      return;
    }
    onChange(
      setAlcohol(value, {
        ...alcohol,
        auditC: { ...(alcohol.auditC ?? {}), enabled: true },
      }),
    );
  };

  const toggleAuditFullPanel = () => {
    if (!alcohol) return;
    if (auditFullPanelOpen) {
      if (!auditFullHasPersistedData(alcohol.auditFull) && !auditCHasPersistedData(alcohol.auditC)) {
        onChange(setAlcohol(value, { ...alcohol, auditFull: undefined, auditC: undefined }));
        return;
      }
      onChange(
        setAlcohol(value, {
          ...alcohol,
          auditFull: { ...(alcohol.auditFull ?? {}), enabled: false },
        }),
      );
      return;
    }
    onChange(
      setAlcohol(value, {
        ...alcohol,
        auditFull: { ...(alcohol.auditFull ?? {}), enabled: true },
      }),
    );
  };

  return (
    <CollapsibleContainer
      title="Social / personal history"
      toggleLabel="Toggle Social / personal history"
      preview={preview ? `— ${preview}` : undefined}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      defaultOpen={sectionOpen === undefined ? false : undefined}
      bodyClassName="space-y-4 px-3 pb-3 pt-0"
      leadingActions={<SectionReorderLeadingAction sectionId="social_history" />}
      actions={!disabled ? <SubjectiveSectionTemplateButton scope="social_history" /> : undefined}
    >
      <div className="space-y-3">
        <CollapsibleContainer
          title="Tobacco, alcohol & drugs"
          toggleLabel="Toggle tobacco, alcohol and drugs cluster"
          ariaLabel="Tobacco, alcohol and drugs"
          testId="social-history-cluster-substance"
          preview={substanceUsePreview}
          count={substanceUseClusterFilledCount(value)}
          defaultOpen={substanceUseClusterHasContent(value)}
          bodyClassName="space-y-4 pt-0"
        >
        <section className="space-y-2" aria-label="Smoking">
          <StatusChipRow
            label="Smoking"
            options={SMOKING_STATUS_OPTIONS}
            selected={smoking?.status}
            disabled={disabled}
            testId="social-smoking-status"
            onSelect={handleSmokingStatus}
          />
          {statusReveal(smoking?.status) && smoking && (
            <div
              className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
              aria-expanded={true}
              data-testid="social-smoking-details"
            >
              <TobaccoProductRows
                catalog="smoking"
                products={smokingProductsForDisplay}
                disabled={disabled}
                implicitPast={smoking.status === "ex"}
                testIdPrefix="social-smoking"
                onChange={(products) =>
                  onChange(
                    setSmoking(value, {
                      ...smoking,
                      products,
                      quitYearsAgo: undefined,
                      quitYearsUnit: undefined,
                    }),
                  )
                }
              />
              <div
                className="space-y-0.5 text-xs"
                data-testid="social-smoking-pack-years"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {smokingPackYears != null ? (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    ≈ {smokingPackYears} pack-years
                    {smokingPackYearsResult.hasApproximateProducts ? " (approx.)" : ""}
                    {smokingPackYearsResult.hasNonConvertible
                      ? " (other products excluded)"
                      : ""}
                    <PackYearsInfo />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    Add amounts &amp; duration for pack-years
                    <PackYearsInfo />
                  </span>
                )}
                {smokingPackYearsHint && (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="social-smoking-pack-years-hint"
                  >
                    {smokingPackYearsHint}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2" aria-label="Smokeless tobacco">
          <StatusChipRow
            label="Smokeless tobacco"
            options={SMOKELESS_STATUS_OPTIONS}
            selected={smokeless?.status}
            disabled={disabled}
            testId="social-smokeless-status"
            onSelect={handleSmokelessStatus}
          />
          {statusReveal(smokeless?.status) && smokeless && (
            <div
              className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
              aria-expanded={true}
              data-testid="social-smokeless-details"
            >
              <TobaccoProductRows
                catalog="smokeless"
                products={smokelessProductsForDisplay}
                disabled={disabled}
                implicitPast={smokeless.status === "ex"}
                testIdPrefix="social-smokeless"
                onChange={(products) =>
                  onChange(
                    setSmokeless(value, {
                      ...smokeless,
                      products,
                      quitYearsAgo: undefined,
                      quitYearsUnit: undefined,
                    }),
                  )
                }
              />
            </div>
          )}
        </section>

        <section className="space-y-2" aria-label="Alcohol">
          <StatusChipRow
            label="Alcohol"
            options={ALCOHOL_STATUS_OPTIONS}
            selected={alcohol?.status}
            disabled={disabled}
            testId="social-alcohol-status"
            onSelect={handleAlcoholStatus}
          />
          {statusReveal(alcohol?.status) && alcohol && (
            <div
              className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
              aria-expanded={true}
              data-testid="social-alcohol-details"
            >
              <AlcoholDrinkRows
                drinks={alcoholDrinksForDisplayMemo}
                disabled={disabled}
                implicitPast={alcohol.status === "ex"}
                testIdPrefix="social-alcohol"
                onChange={(drinks) =>
                  onChange(
                    setAlcohol(value, {
                      ...alcohol,
                      drinks,
                      quitYearsAgo: undefined,
                      quitYearsUnit: undefined,
                    }),
                  )
                }
              />
              <div
                className="space-y-0.5 text-xs"
                data-testid="social-alcohol-units-week"
                role="status"
                aria-live="polite"
              >
                {alcoholUnitsPerWeek != null ? (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    ≈ {alcoholUnitsPerWeek} units/week
                    {hazardousUnitsLabel(alcoholUnitsPerWeek) ? " (hazardous)" : ""}
                    {alcoholUnitsResult.hasIncomplete ? " (estimate from drinks with amounts)" : ""}
                    <StandardUnitsInfo />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    Add drink amounts &amp; frequency for units/week estimate
                    <StandardUnitsInfo />
                  </span>
                )}
                {alcoholClinicalHintParts.intakeHint && (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="social-alcohol-intake-hint"
                  >
                    {alcoholClinicalHintParts.intakeHint}
                  </p>
                )}
              </div>
              <div className="space-y-1.5" data-testid="social-alcohol-max-session">
                <div>
                  <p className="text-xs font-medium text-foreground/80">Max in one sitting</p>
                  <p className="text-[11px] text-muted-foreground">
                    Largest typical amount on a single occasion — separate from weekly average.
                    Complements AUDIT-C binge frequency above.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
          <input
                    type="number"
                    min={0}
                    max={50}
            disabled={disabled}
                    aria-label="Max amount in one sitting"
                    data-testid="social-alcohol-max-session-amount"
                    value={alcohol.maxPerSession?.amount ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        onChange(
                          setAlcohol(value, {
                            ...alcohol,
                            maxPerSession: undefined,
                          }),
                        );
                        return;
                      }
                      const parsed = Number.parseInt(raw, 10);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        onChange(
                          setAlcohol(value, {
                            ...alcohol,
                            maxPerSession: undefined,
                          }),
                        );
                        return;
                      }
                      const currentUnit = alcohol.maxPerSession?.amountUnit ?? "peg";
                      onChange(
                        setAlcohol(value, {
                          ...alcohol,
                          maxPerSession: {
                            amount: parsed,
                            amountUnit: currentUnit === "peg" ? undefined : currentUnit,
                            ...(currentUnit === "other"
                              ? { amountUnitOther: alcohol.maxPerSession?.amountUnitOther }
                              : {}),
                          },
                        }),
                      );
                    }}
                    className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-16 px-2 py-1 text-xs")}
                  />
                  <div className="flex gap-0.5" role="group" aria-label="Max session amount unit">
                    {(
                      [
                        { value: "peg", label: "Pegs" },
                        { value: "ml", label: "ml" },
                        { value: "units", label: "Units" },
                      ] as const
                    ).map((option) => {
                      const resolved = alcohol.maxPerSession?.amountUnit ?? "peg";
                      const selected = resolved === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={disabled}
                          aria-pressed={selected}
                          aria-label={option.label}
                          data-testid={`social-alcohol-max-session-unit-${option.value}`}
                          onClick={() => {
                            if (!alcohol.maxPerSession?.amount) return;
                            onChange(
                              setAlcohol(value, {
                                ...alcohol,
                                maxPerSession: {
                                  amount: alcohol.maxPerSession.amount,
                                  amountUnit: option.value === "peg" ? undefined : option.value,
                                },
                              }),
                            );
                          }}
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/60",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
        </div>
      </div>
                {alcoholBingeHint && (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="social-alcohol-binge-hint"
                    role="status"
                    aria-live="polite"
                  >
                    {alcoholBingeHint}
                  </p>
                )}
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                data-testid="social-alcohol-screen-chips"
                role="group"
                aria-label="Optional alcohol screens"
              >
                <AlcoholScreenChip
                  label="CAGE screen"
                  summary={cageChipSummary}
                  expanded={cagePanelOpen}
                  disabled={disabled}
                  testId="social-alcohol-cage-toggle"
                  controlsId={`${inputId}-cage-details`}
                  onToggle={toggleCagePanel}
                />
                <AlcoholScreenChip
                  label="AUDIT-C screen"
                  summary={auditCChipSummary}
                  expanded={auditCPanelOpen}
                  disabled={disabled}
                  testId="social-alcohol-audit-c-toggle"
                  controlsId={`${inputId}-audit-c-details`}
                  onToggle={toggleAuditCPanel}
                />
                <AlcoholScreenChip
                  label="AUDIT-10 screen"
                  summary={auditFullChipSummary}
                  expanded={auditFullPanelOpen}
                  disabled={disabled}
                  testId="social-alcohol-audit-full-toggle"
                  controlsId={`${inputId}-audit-full-details`}
                  onToggle={toggleAuditFullPanel}
                />
              </div>
              {cagePanelOpen && (
                <>
                  <div
                    id={`${inputId}-cage-details`}
                    className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5"
                    data-testid="social-alcohol-cage"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground/80">CAGE screen</p>
                      <p className="text-[11px] text-muted-foreground">{CAGE_SCREEN_HELPER}</p>
                    </div>
                    <div className="space-y-1" role="group" aria-label="CAGE screen questions">
                      {CAGE_QUESTIONS.map((question) => {
                        const isOn = alcohol.cage?.[question.key] ?? false;
                        return (
                          <button
                            key={question.key}
                            type="button"
                            disabled={disabled}
                            aria-pressed={isOn}
                            aria-label={`${question.fullQuestion} — ${isOn ? "Yes" : "No"}`}
                            data-testid={`social-alcohol-cage-${question.key}`}
                            onClick={() => {
                              const current = alcohol.cage ?? {
                                cutDown: false,
                                annoyed: false,
                                guilty: false,
                                eyeOpener: false,
                                enabled: true,
                              };
                              onChange(
                                setAlcohol(value, {
                                  ...alcohol,
                                  cage: { ...current, enabled: true, [question.key]: !current[question.key] },
                                }),
                              );
                            }}
                            className={cn(
                              "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                              isOn
                                ? "border-primary bg-primary/10 font-medium text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                                isOn
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background",
                              )}
                              aria-hidden="true"
                            >
                              {isOn ? "✓" : ""}
                            </span>
                            <span>{question.fullQuestion}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className="space-y-0.5 text-xs"
                    data-testid="social-alcohol-cage-score"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {alcoholCage ? (
                      <span className="font-medium text-foreground">
                        CAGE {alcoholCage.score}/4
                        {alcoholCage.positive ? " · screen positive" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Tap CAGE questions for score</span>
                    )}
                    {alcoholClinicalHintParts.cageHint && (
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="social-alcohol-cage-hint"
                      >
                        {alcoholClinicalHintParts.cageHint}
                      </p>
                    )}
                  </div>
                </>
              )}
              {auditCPanelOpen && (
                <>
                  <div
                    id={`${inputId}-audit-c-details`}
                    className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5"
                    data-testid="social-alcohol-audit-c"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground/80">AUDIT-C screen</p>
                      <p className="text-[11px] text-muted-foreground">{AUDIT_C_SCREEN_HELPER}</p>
                    </div>
                    <div className="space-y-2" role="group" aria-label="AUDIT-C screen questions">
                      {AUDIT_C_QUESTIONS.map((question) => {
                        const selected = alcohol.auditC?.[question.key];
                        return (
                          <div key={question.key} className="space-y-1">
                            <p className="text-xs text-foreground/90">{question.prompt}</p>
                            <div className="flex flex-col gap-1">
                              {question.options.map((option) => {
                                const isSelected = selected === option.score;
                                return (
                                  <button
                                    key={option.score}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={isSelected}
                                    aria-label={`${question.prompt} — ${option.label} (score ${option.score})`}
                                    data-testid={`social-alcohol-audit-c-${question.key}-${option.score}`}
                                    onClick={() => {
                                      const current = alcohol.auditC ?? { enabled: true };
                                      onChange(
                                        setAlcohol(value, {
                                          ...alcohol,
                                          auditC: {
                                            ...current,
                                            enabled: true,
                                            [question.key]:
                                              isSelected ? undefined : option.score,
                                          },
                                        }),
                                      );
                                    }}
                                    className={cn(
                                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                      isSelected
                                        ? "border-primary bg-primary/10 font-medium text-foreground"
                                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                                    )}
                                  >
                                    <span className="shrink-0 font-semibold">({option.score})</span>
                                    <span>{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className="space-y-0.5 text-xs"
                    data-testid="social-alcohol-audit-c-score"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {alcoholAuditC ? (
                      <span className="font-medium text-foreground">
                        AUDIT-C {alcoholAuditC.score}/12
                        {alcoholAuditC.positive ? " · screen positive" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Answer all AUDIT-C questions for score
                      </span>
                    )}
                    {alcoholAuditCHint && (
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="social-alcohol-audit-c-hint"
                      >
                        {alcoholAuditCHint}
                      </p>
                    )}
                  </div>
                </>
              )}
              {auditFullPanelOpen && (
                <>
                  <div
                    id={`${inputId}-audit-full-details`}
                    className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5"
                    data-testid="social-alcohol-audit-full"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground/80">AUDIT-10 screen</p>
                      <p className="text-[11px] text-muted-foreground">{AUDIT_10_SCREEN_HELPER}</p>
                    </div>
                    <div className="space-y-2" role="group" aria-label="AUDIT-10 screen questions">
                      {AUDIT_C_QUESTIONS.map((question, questionIndex) => {
                        const questionNumber = questionIndex + 1;
                        const selected = alcohol.auditC?.[question.key];
                        return (
                          <div key={`audit-full-${question.key}`} className="space-y-1">
                            <p className="text-xs text-foreground/90">
                              Q{questionNumber}. {question.prompt}
                            </p>
                            <div className="flex flex-col gap-1">
                              {question.options.map((option) => {
                                const isSelected = selected === option.score;
                                return (
                                  <button
                                    key={option.score}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={isSelected}
                                    aria-label={`Q${questionNumber}. ${question.prompt} — ${option.label} (score ${option.score})`}
                                    data-testid={`social-alcohol-audit-full-${question.key}-${option.score}`}
                                    onClick={() => {
                                      const current = alcohol.auditC ?? { enabled: true };
                                      onChange(
                                        setAlcohol(value, {
                                          ...alcohol,
                                          auditC: {
                                            ...current,
                                            enabled: true,
                                            [question.key]:
                                              isSelected ? undefined : option.score,
                                          },
                                          auditFull: {
                                            ...(alcohol.auditFull ?? {}),
                                            enabled: true,
                                          },
                                        }),
                                      );
                                    }}
                                    className={cn(
                                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                      isSelected
                                        ? "border-primary bg-primary/10 font-medium text-foreground"
                                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                                    )}
                                  >
                                    <span className="shrink-0 font-semibold">({option.score})</span>
                                    <span>{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {AUDIT_10_EXTENDED_QUESTIONS.map((question) => {
                        const selected = alcohol.auditFull?.[question.key];
                        return (
                          <div key={question.key} className="space-y-1">
                            <p className="text-xs text-foreground/90">
                              Q{question.number}. {question.prompt}
                            </p>
                            <div className="flex flex-col gap-1">
                              {question.options.map((option) => {
                                const isSelected = selected === option.score;
                                return (
                                  <button
                                    key={option.score}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={isSelected}
                                    aria-label={`Q${question.number}. ${question.prompt} — ${option.label} (score ${option.score})`}
                                    data-testid={`social-alcohol-audit-full-${question.key}-${option.score}`}
                                    onClick={() => {
                                      const current = alcohol.auditFull ?? { enabled: true };
                                      onChange(
                                        setAlcohol(value, {
                                          ...alcohol,
                                          auditFull: {
                                            ...current,
                                            enabled: true,
                                            [question.key as AuditFullQuestionKey]:
                                              isSelected ? undefined : option.score,
                                          },
                                        }),
                                      );
                                    }}
                                    className={cn(
                                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
                                      isSelected
                                        ? "border-primary bg-primary/10 font-medium text-foreground"
                                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                                    )}
                                  >
                                    <span className="shrink-0 font-semibold">({option.score})</span>
                                    <span>{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    className="space-y-0.5 text-xs"
                    data-testid="social-alcohol-audit-full-score"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {alcoholAuditFull ? (
                      <span className="font-medium text-foreground">
                        AUDIT-10 {alcoholAuditFull.score}/40 ·{" "}
                        {AUDIT_FULL_SEVERITY_LABELS[alcoholAuditFull.severity]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Answer all AUDIT-10 questions for score
                      </span>
                    )}
                    {alcoholAuditFullHint && (
                      <p
                        className="text-[11px] text-muted-foreground"
                        data-testid="social-alcohol-audit-full-hint"
                      >
                        {alcoholAuditFullHint}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

          <SubstancesSection
            value={value}
        disabled={disabled}
            inputIdPrefix={inputId}
            onChange={onChange}
          />
        </CollapsibleContainer>

        <CollapsibleContainer
          title="Lifestyle"
          toggleLabel="Toggle lifestyle cluster"
          ariaLabel="Lifestyle"
          testId="social-history-cluster-lifestyle"
          preview={lifestylePreview}
          count={lifestyleClusterFilledCount(value)}
          defaultOpen={lifestyleClusterHasContent(value)}
          bodyClassName="space-y-4 pt-0"
        >
          <DietSection
            value={value}
            disabled={disabled}
            inputIdPrefix={inputId}
            onChange={onChange}
          />

          <CaffeineSection
            value={value}
            disabled={disabled}
            inputIdPrefix={inputId}
            onChange={onChange}
          />

          <ActivitySection
            value={value}
            disabled={disabled}
            inputIdPrefix={inputId}
            onChange={onChange}
          />
        </CollapsibleContainer>

        <CollapsibleContainer
          title="Work, home & exposure"
          toggleLabel="Toggle work, home and exposure cluster"
          ariaLabel="Work, home and exposure"
          testId="social-history-cluster-context"
          preview={contextPreview}
          count={contextClusterFilledCount(value)}
          defaultOpen={contextClusterHasContent(value)}
          bodyClassName="space-y-4 pt-0"
        >
          <section className="space-y-2" aria-label="Occupation">
            <TextField
              id={`${inputId}-occupation-text`}
              label="Occupation"
              hint="Job and workplace hazards"
              value={occupation?.text ?? ""}
              disabled={disabled}
              placeholder="Job or role"
              onChange={(text) =>
          onChange(
                  setOccupation(value, {
                    text,
                    exposures: occupation?.exposures ?? [],
                  }),
                )
              }
            />
            {(occupation?.text?.trim() || (occupation?.exposures.length ?? 0) > 0) && (
              <div
                className="rounded-md border border-border/60 bg-muted/20 p-2.5"
                aria-expanded={true}
                data-testid="social-occupation-details"
              >
                <MultiTypeChipRow
                  label="Exposures"
                  options={OCCUPATION_EXPOSURES}
                  selected={occupation?.exposures ?? []}
                  disabled={disabled}
                  testId="social-occupation-exposures"
                  onToggle={(exposure) => {
                    const current = occupation?.exposures ?? [];
                    onChange(
                      setOccupation(value, {
                        text: occupation?.text,
                        exposures: toggleType(current, exposure),
                      }),
                    );
                  }}
                />
              </div>
            )}
          </section>

          <section className="space-y-2" aria-label="Living situation">
            <SingleSelectChipRow
              label="Living situation"
              hint="Support at home, infection risk"
              options={LIVING_SITUATIONS}
              selected={living?.situation}
              disabled={disabled}
              testId="social-living-situation"
              onSelect={(situation) => {
                if (!situation) {
                  onChange(setLiving(value, null));
                  return;
                }
                onChange(
                  setLiving(value, {
                    situation: situation as (typeof LIVING_SITUATIONS)[number]["value"],
                    notes: living?.notes,
                  }),
                );
              }}
            />
            {living?.situation && (
              <div
                className="rounded-md border border-border/60 bg-muted/20 p-2.5"
                aria-expanded={true}
                data-testid="social-living-details"
              >
                <TextField
                  id={`${inputId}-living-notes`}
                  label="Details (optional)"
                  value={living.notes ?? ""}
                  disabled={disabled}
                  placeholder="Optional details"
                  maxLength={500}
                  onChange={(notes) => onChange(setLiving(value, { ...living, notes }))}
                />
              </div>
            )}
          </section>

          <section className="space-y-2" aria-label="Travel">
            <div className="space-y-1.5" data-testid="social-travel-toggle">
              <p
                id={`${inputId}-travel-label`}
                className="text-xs font-medium text-foreground/80"
              >
                Travel
              </p>
              <p className="text-[10px] text-muted-foreground">
                Recent trips — endemic areas, outbreaks
              </p>
              <div role="group" aria-labelledby={`${inputId}-travel-label`}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={travelActive}
                  aria-expanded={travelActive}
                  aria-controls={`${inputId}-travel-details`}
                  aria-label="Recent travel"
                  onClick={() => {
                    if (travelActive) {
                      onChange(setTravel(value, null));
                      return;
                    }
                    onChange(setTravel(value, { recent: true }));
                  }}
                  className={cn(
                    CHIP_CLASS,
                    travelActive
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                  )}
                >
                  Recent travel
                </button>
              </div>
            </div>
            {travelActive && (
              <div
                id={`${inputId}-travel-details`}
                className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
                aria-expanded={true}
                data-testid="social-travel-details"
              >
                <TextField
                  id={`${inputId}-travel-place`}
                  label="Place"
                  value={travel?.place ?? ""}
                  disabled={disabled}
                  placeholder="City or destination"
                  onChange={(place) =>
                    onChange(
                      setTravel(value, {
                        recent: true,
                        place,
                        vectorRisk: travel?.vectorRisk,
                      }),
                    )
                  }
                />
                <div data-testid="social-travel-vector-risk">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={travel?.vectorRisk === true}
                    aria-label="Dengue malaria or endemic area"
                    onClick={() =>
                      onChange(
                        setTravel(value, {
                          recent: travel?.recent ?? true,
                          place: travel?.place,
                          vectorRisk: !travel?.vectorRisk,
                        }),
                      )
                    }
                    className={cn(
                      CHIP_CLASS,
                      travel?.vectorRisk
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                    )}
                  >
                    Dengue / malaria / endemic area
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2" aria-label="Sick contact">
            <p className="text-xs font-medium text-foreground/80">Sick contact</p>
            <p className="text-[10px] text-muted-foreground">
              Travel, household, work, or clinic exposure
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sick contact">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={noneSickContactSelected}
                aria-label="No sick contact"
                data-testid="social-sick-contact-none"
                onClick={() =>
                  onChange(
                    setSickContact(value, {
                      ...baseSickContact(),
                      present: noneSickContactSelected ? undefined : false,
                      types: undefined,
                      context: undefined,
                      notes: undefined,
                    }),
                  )
                }
                className={cn(
                  CHIP_CLASS,
                  noneSickContactSelected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                None
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={recentSickContactSelected}
                aria-label="Recent sick contact"
                data-testid="social-sick-contact-recent"
                onClick={() =>
                  onChange(
                    setSickContact(value, {
                      ...baseSickContact(),
                      present: recentSickContactSelected ? undefined : true,
                    }),
                  )
                }
                className={cn(
                  CHIP_CLASS,
                  recentSickContactSelected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                Recent contact
              </button>
            </div>
            {recentSickContactSelected && (
              <div
                className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
                data-testid="social-sick-contact-details"
              >
                <MultiTypeChipRow
                  label="Communicable illness"
                  options={SICK_CONTACT_TYPE_OPTIONS}
                  selected={sickContact?.types ?? []}
                  disabled={disabled}
                  testId="social-sick-contact-types"
                  onToggle={(type) => {
                    const current = sickContact?.types ?? [];
                    onChange(
                      setSickContact(value, {
                        ...baseSickContact(),
                        present: true,
                        types: toggleType(current, type) as SickContactSectionInput["types"],
                      }),
                    );
                  }}
                />
                <MultiTypeChipRow
                  label="Context"
                  options={SICK_CONTACT_CONTEXT_OPTIONS}
                  selected={sickContact?.context ?? []}
                  disabled={disabled}
                  testId="social-sick-contact-context"
                  onToggle={(ctx) => {
                    const current = sickContact?.context ?? [];
                    onChange(
                      setSickContact(value, {
                        ...baseSickContact(),
                        present: true,
                        context: toggleType(current, ctx) as SickContactSectionInput["context"],
                      }),
                    );
                  }}
                />
                <TextField
                  id={`${inputId}-sick-contact-notes`}
                  label="Details (optional)"
                  value={sickContact?.notes ?? ""}
                  disabled={disabled}
                  placeholder="Who, when, diagnosis if known"
                  maxLength={500}
                  onChange={(notes) =>
                    onChange(
                      setSickContact(value, {
                        ...baseSickContact(),
                        present: true,
                        notes,
                      }),
                    )
                  }
                />
              </div>
            )}
          </section>
        </CollapsibleContainer>

        <CollapsibleContainer
          title="Sleep & stress"
          toggleLabel="Toggle sleep and stress cluster"
          ariaLabel="Sleep and stress"
          testId="social-history-cluster-wellbeing"
          preview={wellbeingPreview}
          count={wellbeingClusterFilledCount(value)}
          defaultOpen={wellbeingClusterHasContent(value)}
          bodyClassName="space-y-4 pt-0"
        >
          <section className="space-y-2" aria-label="Sleep">
            <p className="text-xs font-medium text-foreground/80">Sleep</p>
            <p className="text-[10px] text-muted-foreground">Rest, snoring, shift work</p>
            <SingleSelectChipRow
              label="Quality"
              options={SLEEP_QUALITY}
              selected={sleep?.quality}
              disabled={disabled}
              testId="social-sleep-quality"
              onSelect={(quality) => {
                const next = {
                  ...baseSleep(),
                  quality: quality as (typeof SLEEP_QUALITY)[number]["value"] | undefined,
                };
                onChange(setSleep(value, sleepHasContent(next) ? next : null));
              }}
            />
            <NumberField
              id={`${inputId}-sleep-hours`}
              label="Hours/night (optional)"
              value={sleep?.hoursPerNight}
              disabled={disabled}
              max={24}
              onChange={(hoursPerNight) => {
                const next = { ...baseSleep(), hoursPerNight };
                onChange(setSleep(value, sleepHasContent(next) ? next : null));
              }}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sleep flags">
              {SLEEP_FLAG_OPTIONS.map((option) => {
                const selected =
                  option.value === "snoring" ? sleep?.snoring === true : sleep?.shiftWork === true;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-label={option.label}
                    data-testid={`social-sleep-flag-${option.value}`}
                    onClick={() => {
                      const next = { ...baseSleep() };
                      if (option.value === "snoring") {
                        next.snoring = selected ? undefined : true;
                      } else {
                        next.shiftWork = selected ? undefined : true;
                      }
                      onChange(setSleep(value, sleepHasContent(next) ? next : null));
                    }}
                    className={cn(
                      CHIP_CLASS,
                      selected
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <TextField
              id={`${inputId}-sleep-notes`}
              label="Details (optional)"
              value={sleep?.notes ?? ""}
              disabled={disabled}
              placeholder="Snoring, shift work, wakes frequently"
              maxLength={500}
              onChange={(notes) => {
                const next = { ...baseSleep(), notes };
                onChange(setSleep(value, sleepHasContent(next) ? next : null));
              }}
            />
          </section>

          <section className="space-y-2" aria-label="Stress">
            <p className="text-xs font-medium text-foreground/80">Stress</p>
            <p className="text-[10px] text-muted-foreground">
              Load and coping — work, family, health
            </p>
            <SingleSelectChipRow
              label="Stress level"
              options={STRESS_LEVELS}
              selected={stress?.level}
              disabled={disabled}
              testId="social-stress-level"
              onSelect={(level) => {
                if (!level) {
                  onChange(setStress(value, null));
                  return;
                }
                onChange(
                  setStress(value, {
                    ...baseStress(),
                    level: level as (typeof STRESS_LEVELS)[number]["value"],
                  }),
                );
              }}
            />
            {stress?.level && (
              <div
                className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5"
                aria-expanded={true}
                data-testid="social-stress-details"
              >
                <SingleSelectChipRow
                  label="Social support"
                  options={STRESS_SUPPORT}
                  selected={stress.support}
                  disabled={disabled}
                  testId="social-stress-support"
                  onSelect={(support) =>
                    onChange(
                      setStress(value, {
                        ...baseStress(),
                        support: support as (typeof STRESS_SUPPORT)[number]["value"] | undefined,
                      }),
                    )
                  }
                />
                <MultiTypeChipRow
                  label="Sources"
                  options={STRESS_SOURCE_OPTIONS}
                  selected={stress.sources ?? []}
                  disabled={disabled}
                  testId="social-stress-sources"
                  onToggle={(source) => {
                    const current = stress.sources ?? [];
                    onChange(
                      setStress(value, {
                        ...baseStress(),
                        sources: toggleType(current, source) as StressSectionInput["sources"],
                      }),
                    );
                  }}
                />
                <TextField
                  id={`${inputId}-stress-notes`}
                  label="Details (optional)"
                  value={stress.notes ?? ""}
                  disabled={disabled}
                  placeholder="Job loss, exam, caregiving"
                  maxLength={500}
                  onChange={(notes) =>
                    onChange(
                      setStress(value, {
                        ...baseStress(),
                        notes,
                      }),
                    )
                  }
                />
              </div>
            )}
          </section>

          {wellbeingHints.length > 0 && (
            <div className="space-y-1" data-testid="social-wellbeing-hints">
              {wellbeingHints.map((hint) => (
                <p key={hint} className="text-[11px] text-muted-foreground">
                  {hint}
                </p>
              ))}
            </div>
          )}
        </CollapsibleContainer>

        <CollapsibleContainer
          title="Sexual history"
          toggleLabel="Toggle sexual history"
          ariaLabel="Sexual history"
          testId="social-history-cluster-sexual"
          preview={sexualPreview}
          count={sexualClusterFilledCount(value)}
          defaultOpen={sexualClusterHasContent(value)}
          bodyClassName="space-y-2 pt-0"
        >
          <div className="space-y-2" data-testid="social-sexual-details">
            <SingleSelectChipRow
              label="Sexually active"
              options={SEXUAL_ACTIVE}
              selected={
                sexual?.active === true
                  ? "active"
                  : sexual?.active === false
                    ? "inactive"
                    : undefined
              }
              disabled={disabled}
              testId="social-sexual-active"
              onSelect={(choice) => {
                if (!choice) {
                  commitSexualFields({ active: undefined });
                  return;
                }
                commitSexualFields({ active: choice === "active" });
              }}
            />
            <SingleSelectChipRow
              label="Partners"
              options={SEXUAL_PARTNERS}
              selected={sexual?.partners}
              disabled={disabled}
              testId="social-sexual-partners"
              onSelect={(partners) =>
                commitSexualFields({
                  partners: partners as (typeof SEXUAL_PARTNERS)[number]["value"] | undefined,
                })
              }
            />
            <SingleSelectChipRow
              label="Protection"
              options={SEXUAL_PROTECTION}
              selected={sexual?.protection}
              disabled={disabled}
              testId="social-sexual-protection"
              onSelect={(protection) =>
                commitSexualFields({
                  protection: protection as
                    | (typeof SEXUAL_PROTECTION)[number]["value"]
                    | undefined,
                })
              }
            />
            <div className="space-y-1.5">
              <label
                htmlFor={`${inputId}-sexual-notes`}
                className="text-xs font-medium text-foreground/80"
              >
                Notes
              </label>
              <textarea
                id={`${inputId}-sexual-notes`}
                rows={2}
                value={sexual?.notes ?? ""}
                disabled={disabled}
                placeholder="Additional context"
                aria-label="Sexual history notes"
                className={RX_FIELD_INPUT_CLASS}
                maxLength={500}
                data-testid="social-sexual-notes"
                onChange={(e) => commitSexualFields({ notes: e.target.value })}
              />
            </div>
          </div>
        </CollapsibleContainer>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-foreground/80">
          Additional notes
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={value.notes ?? ""}
          onChange={(e) => onChange(setSocialHistoryNotes(value, e.target.value))}
          placeholder="Anything else — other context…"
          disabled={disabled}
          aria-label="Social / personal history notes"
          className={RX_FIELD_INPUT_CLASS}
          maxLength={2000}
        />
      </div>
    </CollapsibleContainer>
  );
}
