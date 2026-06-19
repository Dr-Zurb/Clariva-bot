"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ALCOHOL_DRINK_TYPES,
  alcoholDrinkDisplayLabel,
  amountUnitsForDrinkType,
  createAlcoholDrink,
  defaultAlcoholAmountUnit,
  drinkPhase,
  formatAlcoholDrinkAmount,
  formatAlcoholDrinkPreviewSentence,
  maxAmountForUnit,
  newAlcoholDrinkId,
  STANDARD_UNITS_PER_WEEK_TOOLTIP,
  standardUnitsForDrink,
  strengthDefaultLabel,
  strengthDefaultTooltip,
  strengthPresetsForDrink,
  shouldClearAbvOnUnitChange,
  supportsStrengthControl,
  type AlcoholDrinkPhase,
  type AlcoholDrinkRow,
  type AlcoholFrequencyUnit,
} from "@/lib/cockpit/social-history-alcohol-drinks";
import { SOCIAL_HISTORY_THRESHOLDS } from "@/lib/cockpit/social-history-thresholds";
import type { SocialHistoryDurationUnit } from "@/lib/cockpit/social-history-indices";
import {
  durationUnitChipLabel,
  maxForDurationUnit,
  normalizeStoredDurationUnit,
  SOCIAL_HISTORY_DURATION_UNITS,
} from "@/lib/cockpit/social-history-indices";

const COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-8 max-w-[3.5rem] px-2 py-1 text-xs");
const SELECT_CLASS = cn(
  RX_FIELD_INPUT_CLASS,
  "h-8 w-[10.5rem] max-w-full shrink-0 px-2 py-1 text-xs",
);
const CHIP_CLASS =
  "min-h-7 rounded-full border px-2 text-[11px] transition-colors disabled:opacity-50";
const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";
const ROW_LABEL_CLASS = "w-[4.5rem] shrink-0 text-[11px] font-medium text-muted-foreground";
const STRENGTH_CHIP_CLASS =
  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors";

const DURATION_UNITS = SOCIAL_HISTORY_DURATION_UNITS;

const PHASE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "past", label: "Past" },
] as const satisfies readonly { value: AlcoholDrinkPhase; label: string }[];

const COMMON_FREQ_OPTIONS = [
  { value: "day", label: "Every day" },
  { value: "week", label: "Times per week" },
] as const satisfies readonly { value: AlcoholFrequencyUnit; label: string }[];

const ADVANCED_FREQ_OPTIONS = [
  { value: "fortnight", label: "Times per fortnight" },
  { value: "month", label: "Times per month" },
  { value: "interval", label: "Every N days" },
] as const satisfies readonly { value: AlcoholFrequencyUnit; label: string }[];

const MAX_ROWS = 10;

function frequencyUnitChangePatch(
  drink: AlcoholDrinkRow,
  nextUnit: AlcoholFrequencyUnit,
): Partial<AlcoholDrinkRow> {
  const freqUnit = drink.frequencyUnit ?? "week";
  const patch: Partial<AlcoholDrinkRow> = { frequencyUnit: nextUnit };
  if (nextUnit === "day") {
    patch.frequency = 1;
  } else if (nextUnit === "interval" && drink.frequency == null) {
    patch.frequency = 7;
  } else if (nextUnit === "month" && drink.frequency == null) {
    patch.frequency = 1;
  } else if (drink.frequency === 1 && freqUnit === "day" && nextUnit !== "day") {
    patch.frequency = undefined;
  }
  return patch;
}

export function StandardUnitsInfo({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground",
              className,
            )}
            aria-label="How standard units per week are estimated"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[15rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
        >
          {STANDARD_UNITS_PER_WEEK_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function amountUnitSuffixLabel(unit: string, unitOther?: string): string {
  if (unit === "other") return unitOther?.trim() || "units";
  if (unit === "peg") return "pegs";
  if (unit === "bottle") return "bottles";
  if (unit === "can") return "cans";
  if (unit === "glass") return "glasses";
  return unit;
}

function AlcoholAmountUnitSwitcher({
  drinkType,
  resolvedUnit,
  defaultUnit,
  disabled,
  onSelect,
}: {
  drinkType: string;
  resolvedUnit: string;
  defaultUnit: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const alternatives = amountUnitsForDrinkType(drinkType).filter((o) => o.value !== resolvedUnit);
  if (alternatives.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-0.5" role="group" aria-label="Amount unit">
      {alternatives.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-label={`Switch to ${option.label}`}
          onClick={() => onSelect(option.value === defaultUnit ? "" : option.value)}
          className={cn(CHIP_CLASS, "border-border text-muted-foreground hover:border-primary/60")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AlcoholStrengthSelector({
  drink,
  resolvedAmountUnit,
  disabled,
  testIdPrefix,
  index,
  onChange,
}: {
  drink: AlcoholDrinkRow;
  resolvedAmountUnit: string;
  disabled?: boolean;
  testIdPrefix: string;
  index: number;
  onChange: (patch: Partial<AlcoholDrinkRow>) => void;
}) {
  const presets = strengthPresetsForDrink(drink.type);
  const isDefault = drink.abv == null;
  const presetMatch = presets.find((p) => drink.abv === p);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (drink.abv != null && presetMatch == null) {
      setCustomOpen(true);
    }
  }, [drink.abv, presetMatch]);

  // Hooks must run unconditionally (rules-of-hooks); bail out only after.
  if (!supportsStrengthControl(drink.type, resolvedAmountUnit)) return null;

  const showCustomInput = customOpen || (!isDefault && presetMatch == null);
  const defaultLabel = strengthDefaultLabel(drink.type, resolvedAmountUnit);
  const defaultTooltip = strengthDefaultTooltip(drink.type, resolvedAmountUnit);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={ROW_LABEL_CLASS}>Strength</span>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Drink strength">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={isDefault && !showCustomInput}
                aria-label={`Default strength: ${defaultTooltip}`}
                data-testid={`${testIdPrefix}-strength-default-${index}`}
                onClick={() => {
                  setCustomOpen(false);
                  onChange({ abv: undefined });
                }}
                className={cn(
                  STRENGTH_CHIP_CLASS,
                  "whitespace-nowrap",
                  isDefault
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                {defaultLabel}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[15rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
            >
              {defaultTooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {presets.map((preset) => {
          const selected = drink.abv === preset;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${preset} percent alcohol`}
              data-testid={`${testIdPrefix}-strength-${preset}-${index}`}
              onClick={() => {
                setCustomOpen(false);
                onChange({ abv: selected ? undefined : preset });
              }}
              className={cn(
                STRENGTH_CHIP_CLASS,
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60",
              )}
            >
              {preset}%
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={showCustomInput}
          data-testid={`${testIdPrefix}-strength-custom-toggle-${index}`}
          onClick={() => {
            if (showCustomInput) {
              setCustomOpen(false);
              onChange({ abv: undefined });
              return;
            }
            setCustomOpen(true);
            if (drink.abv == null) {
              onChange({ abv: 38 });
            }
          }}
          className={cn(
            STRENGTH_CHIP_CLASS,
            showCustomInput
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:border-primary/60",
          )}
        >
          Custom
        </button>
        {showCustomInput && (
          <>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={drink.abv ?? ""}
              disabled={disabled}
              aria-label="Custom ABV percent"
              data-testid={`${testIdPrefix}-strength-custom-${index}`}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onChange({ abv: undefined });
                  return;
                }
                const parsed = Number.parseFloat(raw);
                onChange({
                  abv: Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : undefined,
                });
              }}
              className={cn(COMPACT_INPUT_CLASS, "w-12")}
            />
            <span className="text-[11px] text-muted-foreground">%</span>
          </>
        )}
      </div>
    </div>
  );
}

function QuitInline({
  value,
  unit,
  disabled,
  onChange,
}: {
  value?: number;
  unit?: SocialHistoryDurationUnit;
  disabled?: boolean;
  onChange: (quitYearsAgo?: number, quitYearsUnit?: SocialHistoryDurationUnit) => void;
}) {
  const resolved = unit ?? "years";
  const max = maxForDurationUnit(resolved);
  return (
    <>
      <span className="text-[11px] text-muted-foreground">· quit</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value ?? ""}
        disabled={disabled}
        aria-label="Quit duration"
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(undefined, undefined);
            return;
          }
          const parsed = Number.parseInt(raw, 10);
          onChange(Number.isFinite(parsed) ? parsed : undefined, normalizeStoredDurationUnit(resolved));
        }}
        className={COMPACT_INPUT_CLASS}
      />
      <div className="flex gap-0.5" role="group" aria-label="Quit duration unit">
        {DURATION_UNITS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={resolved === option.value}
            aria-label={option.label}
            onClick={() => onChange(value, normalizeStoredDurationUnit(option.value))}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              resolved === option.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/60",
            )}
          >
            {durationUnitChipLabel(option.value)}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">ago</span>
    </>
  );
}

function CompactDrinkCard({
  drink,
  index,
  testIdPrefix,
  implicitPast,
  disabled,
  onChange,
  onRemove,
}: {
  drink: AlcoholDrinkRow;
  index: number;
  testIdPrefix: string;
  implicitPast?: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<AlcoholDrinkRow>) => void;
  onRemove: () => void;
}) {
  const displayLabel = alcoholDrinkDisplayLabel(drink);
  const phase = drinkPhase(drink);
  const showQuit = implicitPast || phase === "past";
  const freqUnit = drink.frequencyUnit ?? "week";
  const resolvedAmountUnit = drink.amountUnit ?? defaultAlcoholAmountUnit(drink.type);
  const defaultUnit = defaultAlcoholAmountUnit(drink.type);
  const unitLabel = amountUnitSuffixLabel(resolvedAmountUnit, drink.amountUnitOther);
  const rowUnits = standardUnitsForDrink(drink);
  const previewSentence = formatAlcoholDrinkPreviewSentence(drink);
  const amountMax = maxAmountForUnit(resolvedAmountUnit);
  const durationUnit = drink.yearsUnit ?? "years";
  const durationMax = maxForDurationUnit(durationUnit);
  const needsFrequencyCount =
    freqUnit === "week" || freqUnit === "fortnight" || freqUnit === "month" || freqUnit === "interval";

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border px-2.5 py-2",
        implicitPast || phase === "past"
          ? "border-border/60 bg-muted/30"
          : "border-border/50 bg-background/60",
      )}
      data-testid={`${testIdPrefix}-drink-${index}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {drink.type === "other" ? (
            <input
              type="text"
              value={drink.typeOther ?? ""}
              disabled={disabled}
              placeholder="Drink name"
              aria-label="Other drink name"
              onChange={(e) =>
                onChange({ typeOther: e.target.value === "" ? undefined : e.target.value })
              }
              className={cn(
                RX_FIELD_INPUT_CLASS,
                "h-8 w-28 min-w-0 px-2 py-1 text-xs font-semibold",
              )}
            />
          ) : (
            <span
              className="shrink-0 text-xs font-semibold text-foreground"
              title={displayLabel}
            >
              {displayLabel}
            </span>
          )}

          {!implicitPast && (
            <div className="flex shrink-0 gap-0.5" role="group" aria-label="Drink phase">
              {PHASE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={phase === option.value}
                  aria-label={option.label}
                  data-testid={`${testIdPrefix}-phase-${option.value}-${index}`}
                  onClick={() =>
                    onChange(
                      option.value === "past"
                        ? { phase: "past" }
                        : { phase: undefined, quitYearsAgo: undefined, quitYearsUnit: undefined },
                    )
                  }
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    phase === option.value
                      ? option.value === "past"
                        ? "border-muted-foreground bg-muted text-foreground"
                        : "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/60",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <RemoveIconButton
          label={`Remove ${displayLabel}`}
          disabled={disabled}
          onClick={onRemove}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>Amount</span>
        <input
          type="number"
          min={0}
          max={amountMax}
          value={drink.amount ?? ""}
          disabled={disabled}
          aria-label="Amount per occasion"
          data-testid={`${testIdPrefix}-amount-${index}`}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange({ amount: undefined });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isFinite(parsed)) {
              onChange({ amount: undefined });
              return;
            }
            onChange({
              amount: Math.min(parsed, maxAmountForUnit(resolvedAmountUnit)),
            });
          }}
          className={COMPACT_INPUT_CLASS}
        />

        {resolvedAmountUnit === "other" ? (
          <input
            type="text"
            value={drink.amountUnitOther ?? ""}
            disabled={disabled}
            placeholder="unit"
            aria-label="Custom amount unit"
            onChange={(e) =>
              onChange({
                amountUnit: "other",
                amountUnitOther: e.target.value === "" ? undefined : e.target.value,
              })
            }
            className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-14 px-1.5 py-1 text-xs")}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">{unitLabel}</span>
        )}

        <AlcoholAmountUnitSwitcher
          drinkType={drink.type}
          resolvedUnit={resolvedAmountUnit}
          defaultUnit={defaultUnit}
          disabled={disabled}
          onSelect={(value) => {
            const nextUnit = value || defaultUnit;
            const patch: Partial<AlcoholDrinkRow> = {
              amountUnit: value || undefined,
              ...(value !== "other" ? { amountUnitOther: undefined } : {}),
            };
            if (shouldClearAbvOnUnitChange(drink.type, resolvedAmountUnit, nextUnit)) {
              patch.abv = undefined;
            }
            onChange(patch);
          }}
        />
      </div>

      <AlcoholStrengthSelector
        drink={drink}
        resolvedAmountUnit={resolvedAmountUnit}
        disabled={disabled}
        testIdPrefix={testIdPrefix}
        index={index}
        onChange={onChange}
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>How often</span>
        <select
          disabled={disabled}
          aria-label="How often"
          data-testid={`${testIdPrefix}-frequency-unit-${index}`}
          value={freqUnit}
          onChange={(e) =>
            onChange(frequencyUnitChangePatch(drink, e.target.value as AlcoholFrequencyUnit))
          }
          className={SELECT_CLASS}
        >
          <optgroup label="Common">
            {COMMON_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More options">
            {ADVANCED_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>

        {needsFrequencyCount && freqUnit !== "day" && (
          <>
            <input
              type="number"
              min={freqUnit === "interval" ? 1 : 0}
              max={freqUnit === "interval" ? 90 : 50}
              value={drink.frequency ?? ""}
              disabled={disabled}
              aria-label={
                freqUnit === "interval"
                  ? "Days between drinking occasions"
                  : freqUnit === "fortnight"
                    ? "Times per fortnight"
                    : freqUnit === "month"
                      ? "Times per month"
                      : "Times per week"
              }
              data-testid={`${testIdPrefix}-frequency-count-${index}`}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onChange({ frequency: undefined });
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                onChange({ frequency: Number.isFinite(parsed) ? parsed : undefined });
              }}
              className={COMPACT_INPUT_CLASS}
            />
            <span className="text-[11px] text-muted-foreground">
              {freqUnit === "interval"
                ? "days apart"
                : freqUnit === "fortnight"
                  ? "per fortnight"
                  : freqUnit === "month"
                    ? "per month"
                    : "per week"}
            </span>
          </>
        )}

        <span className="text-[11px] text-muted-foreground">· for</span>
        <input
          type="number"
          min={0}
          max={durationMax}
          value={drink.years ?? ""}
          disabled={disabled}
          aria-label="Duration"
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange({ years: undefined, yearsUnit: undefined });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            onChange({
              years: Number.isFinite(parsed) ? parsed : undefined,
              ...(normalizeStoredDurationUnit(durationUnit)
                ? { yearsUnit: normalizeStoredDurationUnit(durationUnit) }
                : {}),
            });
          }}
          className={COMPACT_INPUT_CLASS}
        />
        <div className="flex gap-0.5" role="group" aria-label="Duration unit">
          {DURATION_UNITS.map((option) => {
            const selected = durationUnit === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={option.label}
                onClick={() =>
                  onChange({
                    ...(drink.years != null ? { years: drink.years } : {}),
                    yearsUnit:
                      option.value === "years"
                        ? undefined
                        : (option.value as SocialHistoryDurationUnit),
                  })
                }
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                {durationUnitChipLabel(option.value)}
              </button>
            );
          })}
        </div>

        {showQuit && (
          <QuitInline
            value={drink.quitYearsAgo}
            unit={drink.quitYearsUnit}
            disabled={disabled}
            onChange={(quitYearsAgo, quitYearsUnit) =>
              onChange({
                ...(implicitPast ? {} : { phase: "past" as const }),
                quitYearsAgo,
                ...(normalizeStoredDurationUnit(quitYearsUnit)
                  ? { quitYearsUnit: normalizeStoredDurationUnit(quitYearsUnit) }
                  : { quitYearsUnit: undefined }),
              })
            }
          />
        )}
      </div>

      {(previewSentence || rowUnits != null) && (
        <p
          className="border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground"
          data-testid={`${testIdPrefix}-drink-preview-${index}`}
          role="status"
          aria-live="polite"
        >
          {previewSentence}
          {rowUnits != null && (
            <>
              {previewSentence ? " · " : ""}
              <span className="font-medium text-foreground/80">≈ {rowUnits} units/week</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export interface AlcoholDrinkRowsProps {
  drinks: AlcoholDrinkRow[];
  disabled?: boolean;
  implicitPast?: boolean;
  testIdPrefix: string;
  onChange: (drinks: AlcoholDrinkRow[]) => void;
}

export function AlcoholDrinkRows({
  drinks,
  disabled = false,
  implicitPast = false,
  testIdPrefix,
  onChange,
}: AlcoholDrinkRowsProps) {
  const usedTypes = new Set(drinks.filter((d) => d.type !== "other").map((d) => d.type));
  const addOptions = ALCOHOL_DRINK_TYPES.filter(
    (t) => t.value === "other" || !usedTypes.has(t.value),
  );

  const update = (id: string, patch: Partial<AlcoholDrinkRow>) => {
    onChange(drinks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-drinks`}>
      {!disabled && addOptions.length > 0 && drinks.length < MAX_ROWS && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/80">Add drink</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add drink">
            {addOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-label={`Add ${option.label}`}
                data-testid={`${testIdPrefix}-add-${option.value}`}
                onClick={() => onChange([...drinks, createAlcoholDrink(option.value)])}
                className={ADD_CHIP_CLASS}
              >
                + {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {drinks.length > 0 && (
        <div
          className="space-y-1.5 border-l-2 border-primary/20 pl-2"
          role="group"
          aria-label="Registered drinks"
        >
          {drinks.map((drink, index) => (
            <CompactDrinkCard
              key={drink.id}
              drink={drink}
              index={index}
              testIdPrefix={testIdPrefix}
              implicitPast={implicitPast}
              disabled={disabled}
              onChange={(patch) => update(drink.id, patch)}
              onRemove={() => onChange(drinks.filter((d) => d.id !== drink.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ensureAlcoholDrinkIds(drinks: AlcoholDrinkRow[]): AlcoholDrinkRow[] {
  return drinks.map((d) => (d.id ? d : { ...d, id: newAlcoholDrinkId() }));
}

export function hazardousUnitsLabel(unitsPerWeek: number): string | null {
  if (unitsPerWeek > SOCIAL_HISTORY_THRESHOLDS.hazardousUnitsPerWeek) return "hazardous";
  return null;
}

/** For tests — formatted amount clause. */
export { formatAlcoholDrinkAmount };
