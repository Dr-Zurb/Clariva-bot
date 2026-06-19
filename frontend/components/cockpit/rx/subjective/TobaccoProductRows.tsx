"use client";

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
  createTobaccoProduct,
  defaultSmokingAmountUnit,
  defaultSmokelessAmountUnit,
  newTobaccoProductId,
  SMOKING_AMOUNT_UNITS,
  SMOKING_PACK_YEARS_TOOLTIP,
  SMOKING_PRODUCT_TYPES,
  SMOKELESS_AMOUNT_UNITS,
  SMOKELESS_PRODUCT_TYPES,
  TOBACCO_ADVANCED_FREQ_OPTIONS,
  TOBACCO_COMMON_FREQ_OPTIONS,
  smokingAmountUnitLabel,
  smokingPackYearsForProduct,
  smokingProductIncludedInPackYears,
  smokingProductUsesApproximateEquivalent,
  productPhase,
  tobaccoFrequencyUnitChangePatch,
  tobaccoProductDisplayLabel,
  type TobaccoCatalog,
  type TobaccoFrequencyUnit,
  type TobaccoProductPhase,
  type TobaccoProductRow,
} from "@/lib/cockpit/social-history-tobacco-products";
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
const ROW_LABEL_CLASS = "w-[4.5rem] shrink-0 text-[11px] font-medium text-muted-foreground";

export function PackYearsInfo({ className }: { className?: string }) {
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
            aria-label="How pack-years are calculated"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[15rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
        >
          {SMOKING_PACK_YEARS_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CHIP_CLASS =
  "min-h-7 rounded-full border px-2 text-[11px] transition-colors disabled:opacity-50";
const OPTION_CHIP_CLASS =
  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors";

const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

const DURATION_UNITS = SOCIAL_HISTORY_DURATION_UNITS;

const MAX_PRODUCT_ROWS = 10;

interface TobaccoProductRowsProps {
  catalog: TobaccoCatalog;
  products: TobaccoProductRow[];
  disabled?: boolean;
  /** Ex-smoker / former user — all products are past; hide per-product phase controls. */
  implicitPast?: boolean;
  testIdPrefix: string;
  onChange: (products: TobaccoProductRow[]) => void;
}

interface QuitDurationInlineProps {
  value?: number;
  unit?: SocialHistoryDurationUnit;
  disabled?: boolean;
  leadingComma?: boolean;
  onChange: (quitYearsAgo: number | undefined, quitYearsUnit?: SocialHistoryDurationUnit) => void;
}

function QuitDurationInline({
  value,
  unit,
  disabled,
  leadingComma = false,
  onChange,
}: QuitDurationInlineProps) {
  const resolvedQuitUnit = unit ?? "years";
  const quitMax = maxForDurationUnit(resolvedQuitUnit);

  return (
    <>
      {leadingComma && <span className="text-[11px] text-muted-foreground">,</span>}
      <span className="text-[11px] text-muted-foreground">quit</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={quitMax}
        step={1}
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
          onChange(
            Number.isFinite(parsed) ? parsed : undefined,
            normalizeStoredDurationUnit(resolvedQuitUnit),
          );
        }}
        className={COMPACT_INPUT_CLASS}
      />
      <div className="flex gap-0.5" role="group" aria-label="Quit duration unit">
        {DURATION_UNITS.map((option) => {
          const isSelected = resolvedQuitUnit === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={option.label}
              onClick={() =>
                onChange(value, normalizeStoredDurationUnit(option.value))
              }
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                isSelected
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
    </>
  );
}

/** Section-level quit timing for ex-smoker / former user (sentence-style). @deprecated Use per-product quit on cards. */
export function InlineQuitDurationRow({
  value,
  unit,
  disabled,
  testId,
  onChange,
}: {
  value?: number;
  unit?: SocialHistoryDurationUnit;
  disabled?: boolean;
  testId?: string;
  onChange: (quitYearsAgo: number | undefined, quitYearsUnit?: SocialHistoryDurationUnit) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5"
      data-testid={testId}
    >
      <QuitDurationInline
        value={value}
        unit={unit}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function amountUnitsForCatalog(catalog: TobaccoCatalog) {
  return catalog === "smoking" ? SMOKING_AMOUNT_UNITS : SMOKELESS_AMOUNT_UNITS;
}

function productTypesForCatalog(catalog: TobaccoCatalog) {
  return catalog === "smoking" ? SMOKING_PRODUCT_TYPES : SMOKELESS_PRODUCT_TYPES;
}

function defaultAmountUnit(catalog: TobaccoCatalog, type: string): string {
  return catalog === "smoking"
    ? defaultSmokingAmountUnit(type)
    : defaultSmokelessAmountUnit(type);
}

function availableAddChips(catalog: TobaccoCatalog, products: TobaccoProductRow[]) {
  const typeOptions = productTypesForCatalog(catalog);
  const usedStandard = new Set(
    products.filter((p) => p.type !== "other").map((p) => p.type),
  );
  return typeOptions.filter(
    (option) => option.value === "other" || !usedStandard.has(option.value),
  );
}

const PHASE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "past", label: "Past" },
] as const satisfies readonly { value: TobaccoProductPhase; label: string }[];

function smokelessUnitSuffixLabel(unit: string, unitOther?: string, daily = true): string {
  if (unit === "times") return daily ? "times/day" : "times";
  if (unit === "other") return daily ? "/day" : "";
  return daily ? "packets/day" : "packets";
}

function tobaccoAmountSuffix(
  catalog: TobaccoCatalog,
  product: TobaccoProductRow,
  smokingUnitLabel: string,
  smokelessUnit: string,
  smokelessUnitOther?: string,
): string {
  const freqUnit = product.frequencyUnit ?? "day";
  const daily = freqUnit === "day";
  if (catalog === "smoking") {
    if (product.type === "other") return daily ? "/day" : "";
    return daily ? `${smokingUnitLabel}/day` : smokingUnitLabel;
  }
  return smokelessUnitSuffixLabel(smokelessUnit, smokelessUnitOther, daily);
}

function SmokelessAmountUnitChips({
  resolvedAmountUnit,
  defaultUnit,
  disabled,
  onSelect,
}: {
  resolvedAmountUnit: string;
  defaultUnit: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5" role="group" aria-label="Amount unit">
      {SMOKELESS_AMOUNT_UNITS.map((option) => {
        const selected = resolvedAmountUnit === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={option.label}
            onClick={() => onSelect(option.value === defaultUnit ? "" : option.value)}
            className={cn(
              OPTION_CHIP_CLASS,
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
  );
}

function CompactProductCard({
  catalog,
  product,
  index,
  testIdPrefix,
  implicitPast = false,
  disabled,
  onChange,
  onRemove,
}: {
  catalog: TobaccoCatalog;
  product: TobaccoProductRow;
  index: number;
  testIdPrefix: string;
  implicitPast?: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<TobaccoProductRow>) => void;
  onRemove: () => void;
}) {
  const displayLabel = tobaccoProductDisplayLabel(product, catalog);
  const countsForPackYears =
    catalog === "smoking" && smokingProductIncludedInPackYears(product.type);
  const rowPackYears = catalog === "smoking" ? smokingPackYearsForProduct(product) : null;
  const resolvedDurationUnit = product.yearsUnit ?? "years";
  const durationMax = maxForDurationUnit(resolvedDurationUnit);
  const resolvedAmountUnit = product.perDayUnit ?? defaultAmountUnit(catalog, product.type);
  const smokingUnitLabel = smokingAmountUnitLabel(product.type, product.perDayUnitOther);
  const freqUnit = product.frequencyUnit ?? "day";
  const needsFrequencyCount =
    freqUnit === "week" ||
    freqUnit === "fortnight" ||
    freqUnit === "month" ||
    freqUnit === "interval";
  const amountSuffix = tobaccoAmountSuffix(
    catalog,
    product,
    smokingUnitLabel,
    resolvedAmountUnit,
    product.perDayUnitOther,
  );
  const phase = productPhase(product);
  const showProductQuit = implicitPast || phase === "past";
  const defaultUnit = defaultAmountUnit(catalog, product.type);

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border px-2.5 py-2",
        implicitPast || phase === "past"
          ? "border-border/60 bg-muted/30"
          : "border-border/50 bg-background/60",
      )}
      data-testid={`${testIdPrefix}-product-${index}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {product.type === "other" ? (
            <input
              type="text"
              value={product.typeOther ?? ""}
              disabled={disabled}
              placeholder="Name"
              aria-label="Other product name"
              onChange={(e) =>
                onChange({ typeOther: e.target.value === "" ? undefined : e.target.value })
              }
              className={cn(
                RX_FIELD_INPUT_CLASS,
                "h-8 min-w-[6rem] max-w-[10rem] px-2 py-1 text-xs font-semibold",
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
            <div className="flex shrink-0 gap-0.5" role="group" aria-label="Product phase">
              {PHASE_OPTIONS.map((option) => {
                const isSelected = phase === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isSelected}
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
                      OPTION_CHIP_CLASS,
                      isSelected
                        ? option.value === "past"
                          ? "border-muted-foreground bg-muted text-foreground"
                          : "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/60",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
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
          id={`${testIdPrefix}-amount-${product.id}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={200}
          step={1}
          value={product.perDay ?? ""}
          disabled={disabled}
          aria-label="Amount per occasion"
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange({ perDay: undefined });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            onChange({ perDay: Number.isFinite(parsed) ? parsed : undefined });
          }}
          className={COMPACT_INPUT_CLASS}
        />
        {catalog === "smoking" ? (
          product.type === "other" ? (
            <>
              <input
                type="text"
                value={product.perDayUnitOther ?? ""}
                disabled={disabled}
                placeholder="unit"
                aria-label="Custom amount unit"
                onChange={(e) =>
                  onChange({
                    perDayUnit: "other",
                    perDayUnitOther: e.target.value === "" ? undefined : e.target.value,
                  })
                }
                className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-14 px-1.5 py-1 text-xs")}
              />
              {amountSuffix ? (
                <span className="text-[11px] text-muted-foreground">{amountSuffix}</span>
              ) : null}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">{amountSuffix}</span>
          )
        ) : (
          <>
            {resolvedAmountUnit === "other" ? (
              <>
                <input
                  type="text"
                  value={product.perDayUnitOther ?? ""}
                  disabled={disabled}
                  placeholder="unit"
                  aria-label="Custom amount unit"
                  onChange={(e) =>
                    onChange({
                      perDayUnit: "other",
                      perDayUnitOther: e.target.value === "" ? undefined : e.target.value,
                    })
                  }
                  className={cn(RX_FIELD_INPUT_CLASS, "h-8 w-14 px-1.5 py-1 text-xs")}
                />
                {amountSuffix ? (
                  <span className="text-[11px] text-muted-foreground">{amountSuffix}</span>
                ) : null}
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">{amountSuffix}</span>
            )}
            <SmokelessAmountUnitChips
              resolvedAmountUnit={resolvedAmountUnit}
              defaultUnit={defaultUnit}
              disabled={disabled}
              onSelect={(value) =>
                onChange({
                  perDayUnit: value || undefined,
                  ...(value !== "other" ? { perDayUnitOther: undefined } : {}),
                })
              }
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>How often</span>
        <select
          disabled={disabled}
          aria-label="How often"
          data-testid={`${testIdPrefix}-frequency-unit-${index}`}
          value={product.frequencyUnit ?? "day"}
          onChange={(e) => {
            const next = e.target.value as TobaccoFrequencyUnit;
            if (next === "day") {
              onChange({ frequencyUnit: undefined, frequency: undefined });
              return;
            }
            onChange(tobaccoFrequencyUnitChangePatch(product, next));
          }}
          className={SELECT_CLASS}
        >
          <optgroup label="Common">
            {TOBACCO_COMMON_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More options">
            {TOBACCO_ADVANCED_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>

        {needsFrequencyCount && (
          <>
            <input
              type="number"
              min={freqUnit === "interval" ? 1 : 0}
              max={freqUnit === "interval" ? 90 : 50}
              value={product.frequency ?? ""}
              disabled={disabled}
              aria-label={
                freqUnit === "interval"
                  ? "Days between use"
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
          id={`${testIdPrefix}-duration-${product.id}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={durationMax}
          step={1}
          value={product.years ?? ""}
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
              ...(normalizeStoredDurationUnit(resolvedDurationUnit)
                ? { yearsUnit: normalizeStoredDurationUnit(resolvedDurationUnit) }
                : {}),
            });
          }}
          className={COMPACT_INPUT_CLASS}
        />
        <div className="flex gap-0.5" role="group" aria-label="Duration unit">
          {DURATION_UNITS.map((option) => {
            const isSelected = resolvedDurationUnit === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={option.label}
                onClick={() =>
                  onChange({
                    ...(product.years != null ? { years: product.years } : {}),
                    yearsUnit:
                      option.value === "years"
                        ? undefined
                        : (option.value as SocialHistoryDurationUnit),
                  })
                }
                className={cn(
                  OPTION_CHIP_CLASS,
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60",
                )}
              >
                {durationUnitChipLabel(option.value)}
              </button>
            );
          })}
        </div>

        {showProductQuit && (
          <QuitDurationInline
            leadingComma
            value={product.quitYearsAgo}
            unit={product.quitYearsUnit}
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

      {catalog === "smoking" && countsForPackYears && rowPackYears != null && (
        <p
          className="border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground"
          data-testid={`${testIdPrefix}-product-pack-years-${index}`}
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-0.5 font-medium text-foreground/80">
            ≈ {rowPackYears} pack-years
            {smokingProductUsesApproximateEquivalent(product.type) ? " (approx.)" : ""}
            <PackYearsInfo />
          </span>
        </p>
      )}
    </div>
  );
}

export function TobaccoProductRows({
  catalog,
  products,
  disabled = false,
  implicitPast = false,
  testIdPrefix,
  onChange,
}: TobaccoProductRowsProps) {
  const canAddProduct = products.length < MAX_PRODUCT_ROWS;
  const addChips = availableAddChips(catalog, products);

  const updateProduct = (id: string, patch: Partial<TobaccoProductRow>) => {
    onChange(
      products.map((product) => (product.id === id ? { ...product, ...patch } : product)),
    );
  };

  const removeProduct = (id: string) => {
    onChange(products.filter((product) => product.id !== id));
  };

  const addProductOfType = (type: string) => {
    if (!canAddProduct) return;
    onChange([
      ...products,
      createTobaccoProduct(type, {
        ...(type === "other" && catalog === "smoking" ? { perDayUnit: "other" } : {}),
      }),
    ]);
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-products`}>
      {!disabled && addChips.length > 0 && canAddProduct ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/80">Add product</p>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Add product"
            data-testid={`${testIdPrefix}-add-chips`}
          >
            {addChips.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-label={`Add ${option.label}`}
                data-testid={`${testIdPrefix}-add-${option.value}`}
                onClick={() => addProductOfType(option.value)}
                className={ADD_CHIP_CLASS}
              >
                + {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {products.length > 0 ? (
        <div
          className="space-y-1.5 border-l-2 border-primary/20 pl-2"
          role="group"
          aria-label="Registered products"
        >
          {products.map((product, index) => (
            <CompactProductCard
              key={product.id}
              catalog={catalog}
              product={product}
              index={index}
              testIdPrefix={testIdPrefix}
              implicitPast={implicitPast}
              disabled={disabled}
              onChange={(patch) => updateProduct(product.id, patch)}
              onRemove={() => removeProduct(product.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ensureTobaccoProductIds(products: TobaccoProductRow[]): TobaccoProductRow[] {
  return products.map((p) => (p.id ? p : { ...p, id: newTobaccoProductId() }));
}
