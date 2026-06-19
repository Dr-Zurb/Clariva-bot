"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { cn } from "@/lib/utils";
import type { SocialHistoryDurationUnit } from "@/lib/cockpit/social-history-indices";
import {
  durationUnitChipLabel,
  maxForDurationUnit,
  normalizeStoredDurationUnit,
  SOCIAL_HISTORY_DURATION_UNITS,
} from "@/lib/cockpit/social-history-indices";
import {
  amountUnitsForCaffeineType,
  availableCaffeineAddChips,
  CAFFEINE_ADVANCED_FREQ_OPTIONS,
  CAFFEINE_COMMON_FREQ_OPTIONS,
  CAFFEINE_STRENGTH_OPTIONS,
  CAFFEINE_STATUS_OPTIONS,
  CAFFEINE_TYPE_LABELS,
  caffeineAmountUnitSuffix,
  caffeineClinicalHints,
  caffeineFrequencyUnitChangePatch,
  caffeineItemsForDisplay,
  caffeineStrengthTooltip,
  caffeineUsesCustomStrength,
  createCaffeineItem,
  defaultCaffeineAmountUnit,
  estimateCaffeineMgPerServing,
  MAX_CAFFEINE_ITEMS,
  normalizeCaffeineSection,
  type CaffeineFrequencyUnit,
  type CaffeinePhase,
  type CaffeinePresetStrength,
  type CaffeineSectionInput,
  type CaffeineSource,
  type CaffeineStrength,
  type CaffeineUseItem,
  type CaffeineUseStatus,
} from "@/lib/cockpit/social-history-caffeine";
import { setCaffeine, type SocialHistoryStructured } from "@/lib/cockpit/social-history";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";
const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";
const COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-8 max-w-[3.5rem] px-2 py-1 text-xs");
const SELECT_CLASS = cn(
  RX_FIELD_INPUT_CLASS,
  "h-8 w-[10.5rem] max-w-full shrink-0 px-2 py-1 text-xs",
);
const ROW_LABEL_CLASS = "w-[4.5rem] shrink-0 text-[11px] font-medium text-muted-foreground";
const OPTION_CHIP_CLASS =
  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors";

const DURATION_UNITS = SOCIAL_HISTORY_DURATION_UNITS;

const PHASE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "past", label: "Past" },
] as const satisfies readonly { value: CaffeinePhase; label: string }[];

interface CaffeineSectionProps {
  value: SocialHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  onChange: (next: SocialHistoryStructured) => void;
}

function patchCaffeine(
  structured: SocialHistoryStructured,
  patch: CaffeineSectionInput | null,
): SocialHistoryStructured {
  return setCaffeine(structured, patch);
}

function CaffeineItemRow({
  item,
  index,
  disabled,
  implicitPast,
  onPatch,
  onRemove,
}: {
  item: CaffeineUseItem;
  index: number;
  disabled?: boolean;
  implicitPast?: boolean;
  onPatch: (patch: Partial<CaffeineUseItem>) => void;
  onRemove: () => void;
}) {
  const displayLabel =
    item.type === "other"
      ? item.typeOther?.trim() || CAFFEINE_TYPE_LABELS.other
      : item.type
        ? (CAFFEINE_TYPE_LABELS[item.type] ?? item.type)
        : "Caffeine";
  const phase = item.phase ?? (implicitPast ? "past" : "current");
  const durationUnit = item.yearsUnit ?? "years";
  const durationMax = maxForDurationUnit(durationUnit);
  const defaultUnit = defaultCaffeineAmountUnit(item.type);
  const resolvedAmountUnit = item.amountUnit ?? defaultUnit;
  const unitLabel = caffeineAmountUnitSuffix(resolvedAmountUnit, item.amountUnitOther);
  const freqUnit = item.frequencyUnit ?? "day";
  const needsFrequencyCount =
    freqUnit === "week" ||
    freqUnit === "times_per_day" ||
    freqUnit === "fortnight" ||
    freqUnit === "month" ||
    freqUnit === "interval";
  const mgEstimate = estimateCaffeineMgPerServing(item);
  const quitUnit = item.quitYearsUnit ?? "years";
  const quitMax = maxForDurationUnit(quitUnit);
  const usesCustom = caffeineUsesCustomStrength(item);

  const strengthSelection = usesCustom
    ? "custom"
    : item.strength === "light" || item.strength === "strong"
      ? item.strength
      : "regular";

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border px-2.5 py-2",
        implicitPast || phase === "past"
          ? "border-border/60 bg-muted/30"
          : "border-border/50 bg-background/60",
      )}
      data-testid={`social-caffeine-item-${index}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {item.type === "other" ? (
            <input
              type="text"
              value={item.typeOther ?? ""}
              disabled={disabled}
              placeholder="Specify source"
              aria-label="Other caffeine source"
              data-testid={`social-caffeine-item-${index}-other`}
              onChange={(e) => onPatch({ typeOther: e.target.value || undefined })}
              className={cn(
                RX_FIELD_INPUT_CLASS,
                "h-8 min-w-[6rem] max-w-[10rem] px-2 py-1 text-xs font-semibold",
              )}
            />
          ) : (
            <span className="shrink-0 text-xs font-semibold text-foreground" title={displayLabel}>
              {displayLabel}
            </span>
          )}

          {!implicitPast && (
            <div className="flex shrink-0 gap-0.5" role="group" aria-label={`${displayLabel} phase`}>
              {PHASE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={phase === option.value}
                  aria-label={option.label}
                  data-testid={`social-caffeine-item-${index}-phase-${option.value}`}
                  onClick={() =>
                    onPatch(
                      option.value === "past"
                        ? { phase: "past" }
                        : { phase: "current", quitYearsAgo: undefined, quitYearsUnit: undefined },
                    )
                  }
                  className={cn(
                    OPTION_CHIP_CLASS,
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
          testId={`social-caffeine-item-${index}-remove`}
          onClick={onRemove}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>Amount</span>
        <input
          type="number"
          min={0}
          max={999}
          value={item.amount ?? ""}
          disabled={disabled}
          aria-label="Caffeine amount"
          data-testid={`social-caffeine-item-${index}-amount`}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onPatch({ amount: undefined });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            onPatch({ amount: Number.isFinite(parsed) ? parsed : undefined });
          }}
          className={COMPACT_INPUT_CLASS}
        />
        {resolvedAmountUnit === "other" ? (
          <input
            type="text"
            value={item.amountUnitOther ?? ""}
            disabled={disabled}
            placeholder="unit"
            aria-label="Custom amount unit"
            data-testid={`social-caffeine-item-${index}-amount-unit-other`}
            onChange={(e) =>
              onPatch({
                amountUnit: "other",
                amountUnitOther: e.target.value === "" ? undefined : e.target.value,
              })
            }
            className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-14 px-1.5 py-1 text-xs")}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">{unitLabel}</span>
        )}
        <div className="flex flex-wrap gap-0.5" role="group" aria-label={`${displayLabel} amount unit`}>
          {amountUnitsForCaffeineType(item.type).map((opt) => {
            const selected = resolvedAmountUnit === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={opt.label}
                data-testid={`social-caffeine-item-${index}-amount-unit-${opt.value}`}
                onClick={() =>
                  onPatch({
                    amountUnit: opt.value === defaultUnit ? undefined : opt.value,
                    ...(opt.value !== "other" ? { amountUnitOther: undefined } : {}),
                  })
                }
                className={cn(
                  OPTION_CHIP_CLASS,
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>Strength</span>
        <div className="flex flex-wrap gap-0.5" role="group" aria-label={`${displayLabel} strength`}>
          {CAFFEINE_STRENGTH_OPTIONS.map((option) => {
            const selected = strengthSelection === option.value;
            const presetTooltip =
              option.value !== "custom"
                ? caffeineStrengthTooltip(item.type, option.value as CaffeinePresetStrength)
                : "Enter mg caffeine per serving (e.g. double espresso ~120–200 mg)";
            return (
              <TooltipProvider key={option.value} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={option.label}
                      data-testid={`social-caffeine-item-${index}-strength-${option.value}`}
                      onClick={() => {
                        if (option.value === "custom") {
                          onPatch(
                            selected
                              ? { strength: undefined, caffeineMg: undefined }
                              : { strength: "custom" },
                          );
                          return;
                        }
                        if (option.value === "regular") {
                          onPatch({ strength: undefined, caffeineMg: undefined });
                          return;
                        }
                        onPatch({
                          strength: selected ? undefined : option.value,
                          caffeineMg: undefined,
                        });
                      }}
                      className={cn(
                        OPTION_CHIP_CLASS,
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/60",
                      )}
                    >
                      {option.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[14rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
                  >
                    {presetTooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
        {usesCustom && (
          <>
            <input
              type="number"
              min={0}
              max={1000}
              value={item.caffeineMg ?? ""}
              disabled={disabled}
              aria-label="Custom caffeine mg per serving"
              data-testid={`social-caffeine-item-${index}-strength-custom-mg`}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onPatch({ strength: "custom", caffeineMg: undefined });
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                onPatch({
                  strength: "custom",
                  caffeineMg: Number.isFinite(parsed) ? parsed : undefined,
                });
              }}
              className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-[4.5rem] px-2 py-1 text-xs")}
            />
            <span className="text-[10px] text-muted-foreground">mg/serving</span>
          </>
        )}
        {!usesCustom && mgEstimate != null && (
          <span
            className="text-[10px] text-muted-foreground"
            data-testid={`social-caffeine-item-${index}-mg-hint`}
          >
            ~{mgEstimate} mg/serving
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>How often</span>
        <select
          disabled={disabled}
          aria-label="Caffeine frequency"
          data-testid={`social-caffeine-item-${index}-frequency-unit`}
          value={item.frequencyUnit ?? ""}
          onChange={(e) => {
            const next = e.target.value as CaffeineFrequencyUnit;
            if (!next) {
              onPatch({ frequencyUnit: undefined, frequency: undefined });
              return;
            }
            onPatch(caffeineFrequencyUnitChangePatch(item, next));
          }}
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          <optgroup label="Common">
            {CAFFEINE_COMMON_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More options">
            {CAFFEINE_ADVANCED_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>

        {needsFrequencyCount && item.frequencyUnit !== "day" && (
          <>
            <input
              type="number"
              min={freqUnit === "interval" ? 1 : 0}
              max={freqUnit === "interval" ? 90 : 50}
              value={item.frequency ?? ""}
              disabled={disabled}
              aria-label={
                freqUnit === "interval"
                  ? "Days between use"
                  : freqUnit === "times_per_day"
                    ? "Times per day"
                    : freqUnit === "fortnight"
                      ? "Times per fortnight"
                      : freqUnit === "month"
                        ? "Times per month"
                        : "Times per week"
              }
              data-testid={`social-caffeine-item-${index}-frequency-count`}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onPatch({ frequency: undefined });
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                onPatch({ frequency: Number.isFinite(parsed) ? parsed : undefined });
              }}
              className={COMPACT_INPUT_CLASS}
            />
            <span className="text-[11px] text-muted-foreground">
              {freqUnit === "interval"
                ? "days apart"
                : freqUnit === "times_per_day"
                  ? "times/day"
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
          value={item.years ?? ""}
          disabled={disabled}
          aria-label="Duration"
          data-testid={`social-caffeine-item-${index}-years`}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onPatch({ years: undefined, yearsUnit: undefined });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            onPatch({
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
                data-testid={`social-caffeine-item-${index}-duration-${option.value}`}
                onClick={() =>
                  onPatch({
                    ...(item.years != null ? { years: item.years } : {}),
                    yearsUnit:
                      option.value === "years"
                        ? undefined
                        : (option.value as SocialHistoryDurationUnit),
                  })
                }
                className={cn(
                  OPTION_CHIP_CLASS,
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
      </div>

      {(implicitPast || phase === "past") && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="text-[11px] text-muted-foreground">quit</span>
          <input
            type="number"
            min={0}
            max={quitMax}
            value={item.quitYearsAgo ?? ""}
            disabled={disabled}
            aria-label="Quit duration"
            data-testid={`social-caffeine-item-${index}-quit`}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onPatch({ quitYearsAgo: undefined, quitYearsUnit: undefined });
                return;
              }
              const parsed = Number.parseInt(raw, 10);
              onPatch({
                quitYearsAgo: Number.isFinite(parsed) ? parsed : undefined,
                ...(normalizeStoredDurationUnit(quitUnit)
                  ? { quitYearsUnit: normalizeStoredDurationUnit(quitUnit) }
                  : {}),
              });
            }}
            className={COMPACT_INPUT_CLASS}
          />
          <div className="flex gap-0.5" role="group" aria-label="Quit duration unit">
            {DURATION_UNITS.map((option) => {
              const selected = quitUnit === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={option.label}
                  data-testid={`social-caffeine-item-${index}-quit-unit-${option.value}`}
                  onClick={() =>
                    onPatch({
                      ...(item.quitYearsAgo != null ? { quitYearsAgo: item.quitYearsAgo } : {}),
                      quitYearsUnit:
                        option.value === "years"
                          ? undefined
                          : (option.value as SocialHistoryDurationUnit),
                    })
                  }
                  className={cn(
                    OPTION_CHIP_CLASS,
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
          <span className="text-[11px] text-muted-foreground">ago</span>
        </div>
      )}
    </div>
  );
}

export function CaffeineSection({ value, disabled, inputIdPrefix, onChange }: CaffeineSectionProps) {
  const normalized = useMemo(() => normalizeCaffeineSection(value.caffeine), [value.caffeine]);
  const status = normalized?.status;
  const items = caffeineItemsForDisplay(normalized ?? undefined);
  const addOptions = useMemo(() => availableCaffeineAddChips(items), [items]);
  const implicitPast = status === "ex";
  const hints = caffeineClinicalHints(normalized ?? undefined);

  const updateSection = (next: CaffeineSectionInput | null) => {
    onChange(patchCaffeine(value, next));
  };

  const handleStatus = (nextStatus: CaffeineUseStatus) => {
    if (status === nextStatus) {
      updateSection(null);
      return;
    }
    if (nextStatus === "never") {
      updateSection({ status: "never", items: [] });
      return;
    }
    updateSection({
      status: nextStatus,
      items: nextStatus === "ex" ? items.map((i) => ({ ...i, phase: "past" as const })) : items,
      notes: normalized?.notes,
    });
  };

  const handleAddType = (typeValue: CaffeineSource) => {
    const newItem = createCaffeineItem(typeValue, {
      phase: status === "ex" ? "past" : "current",
    });
    updateSection({
      status: status ?? "current",
      items: [...items, newItem],
      notes: normalized?.notes,
    });
  };

  const handleRemoveItem = (itemId: string) => {
    const nextItems = items.filter((i) => i.id !== itemId);
    if (nextItems.length === 0 && !normalized?.notes?.trim()) {
      updateSection(status ? { status, items: [] } : null);
      return;
    }
    updateSection({
      status: status ?? "current",
      items: nextItems,
      notes: normalized?.notes,
    });
  };

  const patchItem = (itemId: string, patch: Partial<CaffeineUseItem>) => {
    updateSection({
      status: status ?? "current",
      items: items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      notes: normalized?.notes,
    });
  };

  return (
    <section className="space-y-2" aria-label="Caffeine">
      <StatusChipRow
        label="Caffeine"
        options={CAFFEINE_STATUS_OPTIONS}
        selected={status}
        disabled={disabled}
        testId="social-caffeine-status"
        onSelect={handleStatus}
      />

      {status && status !== "never" && (
        <>
          {!disabled && addOptions.length > 0 && items.length < MAX_CAFFEINE_ITEMS && (
            <div className="space-y-1.5" data-testid="social-caffeine-add">
              <p className="text-xs font-medium text-foreground/80">Add source</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add caffeine source">
                {addOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    aria-label={`Add ${option.label}`}
                    data-testid={`social-caffeine-add-${option.value}`}
                    onClick={() => handleAddType(option.value)}
                    className={ADD_CHIP_CLASS}
                  >
                    + {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div
              className="space-y-2 border-l-2 border-primary/20 pl-2"
              data-testid="social-caffeine-details"
              aria-expanded={true}
            >
              {items.map((item, index) => (
                <CaffeineItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  disabled={disabled}
                  implicitPast={implicitPast}
                  onPatch={(patch) => patchItem(item.id, patch)}
                  onRemove={() => handleRemoveItem(item.id)}
                />
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor={`${inputIdPrefix}-caffeine-notes`}
              className="text-xs font-medium text-foreground/80"
            >
              Notes (optional)
            </label>
            <input
              id={`${inputIdPrefix}-caffeine-notes`}
              type="text"
              disabled={disabled}
              value={normalized?.notes ?? ""}
              maxLength={200}
              placeholder="After meals, with milk, decaf…"
              data-testid="social-caffeine-notes"
              onChange={(e) =>
                updateSection({
                  status: status ?? "current",
                  items,
                  notes: e.target.value.trim() || undefined,
                })
              }
              className={cn(RX_FIELD_INPUT_CLASS, "h-8 text-xs")}
            />
          </div>
        </>
      )}

      {hints.length > 0 && (
        <div className="space-y-1" data-testid="social-caffeine-hints" role="status">
          {hints.map((hint) => (
            <p key={hint} className="text-xs text-amber-800 dark:text-amber-200">
              {hint}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusChipRow({
  label,
  options,
  selected,
  disabled,
  testId,
  onSelect,
}: {
  label: string;
  options: readonly { value: CaffeineUseStatus; label: string }[];
  selected: CaffeineUseStatus | undefined;
  disabled?: boolean;
  testId: string;
  onSelect: (status: CaffeineUseStatus) => void;
}) {
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
              data-testid={`${testId}-${option.value}`}
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
