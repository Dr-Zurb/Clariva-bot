"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
import { SocialHistorySectionNotesField } from "@/components/cockpit/rx/subjective/SocialHistorySectionNotesField";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";
import type { SocialHistoryDurationUnit } from "@/lib/cockpit/social-history-indices";
import {
  durationUnitChipLabel,
  maxForDurationUnit,
  normalizeStoredDurationUnit,
  SOCIAL_HISTORY_DURATION_UNITS,
} from "@/lib/cockpit/social-history-indices";
import {
  amountUnitsForSubstanceType,
  availableSubstanceAddChips,
  createSubstanceItem,
  defaultSubstanceAmountUnit,
  MAX_SUBSTANCE_ITEMS,
  normalizeSubstancesSection,
  SUBSTANCE_ADVANCED_FREQ_OPTIONS,
  SUBSTANCE_COMMON_FREQ_OPTIONS,
  SUBSTANCE_ROUTE_OPTIONS,
  SUBSTANCE_STATUS_OPTIONS,
  SUBSTANCE_TYPE_LABELS,
  substanceAmountUnitSuffix,
  substanceClinicalHints,
  substanceFrequencyUnitChangePatch,
  substanceItemsForDisplay,
  substanceSupportsAgentName,
  type SubstanceFrequencyUnit,
  type SubstancePhase,
  type SubstancesSectionInput,
  type SubstanceRoute,
  type SubstanceType,
  type SubstanceUseItem,
  type SubstanceUseStatus,
} from "@/lib/cockpit/social-history-substances";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
import { setSubstances } from "@/lib/cockpit/social-history";

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
] as const satisfies readonly { value: SubstancePhase; label: string }[];

interface SubstancesSectionProps {
  value: SocialHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  /** Hide the internal status-row label when the section is wrapped in a titled card. */
  hideStatusLabel?: boolean;
  /** Selector for the enclosing card an item glides back to when closed. */
  closeScrollToSelector?: string;
  onChange: (next: SocialHistoryStructured) => void;
}

function patchSubstances(
  structured: SocialHistoryStructured,
  patch: SubstancesSectionInput | null,
): SocialHistoryStructured {
  return setSubstances(structured, patch);
}

function SubstanceItemRow({
  item,
  index,
  disabled,
  implicitPast,
  open,
  closeScrollToSelector,
  onToggle,
  onPatch,
  onRemove,
}: {
  item: SubstanceUseItem;
  index: number;
  disabled?: boolean;
  implicitPast?: boolean;
  open: boolean;
  closeScrollToSelector?: string;
  onToggle: () => void;
  onPatch: (patch: Partial<SubstanceUseItem>) => void;
  onRemove: () => void;
}) {
  const displayLabel =
    item.type === "other"
      ? item.typeOther?.trim() || SUBSTANCE_TYPE_LABELS.other
      : (SUBSTANCE_TYPE_LABELS[item.type] ?? item.type);
  const phase = item.phase ?? (implicitPast ? "past" : "current");
  const isPast = implicitPast || phase === "past";
  const durationUnit = item.yearsUnit ?? "years";
  const durationMax = maxForDurationUnit(durationUnit);
  const defaultUnit = defaultSubstanceAmountUnit(item.type);
  const resolvedAmountUnit = item.amountUnit ?? defaultUnit;
  const unitLabel = substanceAmountUnitSuffix(resolvedAmountUnit, item.amountUnitOther);
  const freqUnit = item.frequencyUnit ?? "week";
  const needsFrequencyCount =
    freqUnit === "week" || freqUnit === "fortnight" || freqUnit === "month" || freqUnit === "interval";
  const supportsAgentName = item.type !== "other" && substanceSupportsAgentName(item.type);

  // Header label folds the agent name in so it stays visible while collapsed.
  const headerLabel =
    supportsAgentName && item.typeOther?.trim()
      ? `${displayLabel} — ${item.typeOther.trim()}`
      : displayLabel;

  const routeLabel =
    item.route == null
      ? null
      : item.route === "other"
        ? item.routeOther?.trim() || null
        : (SUBSTANCE_ROUTE_OPTIONS.find((o) => o.value === item.route)?.label ?? null);
  const previewParts: string[] = [];
  if (item.amount != null) previewParts.push(`${item.amount} ${unitLabel}/day`);
  if (routeLabel) previewParts.push(routeLabel);
  if (item.years != null) {
    previewParts.push(`for ${item.years} ${durationUnitChipLabel(durationUnit)}`);
  }
  if (item.note?.trim()) previewParts.push(item.note.trim());
  const preview = previewParts.join(" · ") || undefined;

  const titleNode = (
    <>
      <span className="min-w-0 truncate text-xs font-semibold text-foreground" title={headerLabel}>
        {headerLabel}
      </span>
      {!implicitPast && (
        <span
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex gap-0.5" role="group" aria-label={`${displayLabel} phase`}>
            {PHASE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={phase === option.value}
                aria-label={option.label}
                data-testid={`social-substances-item-${index}-phase-${option.value}`}
                onClick={() =>
                  onPatch(option.value === "past" ? { phase: "past" } : { phase: "current" })
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
        </span>
      )}
    </>
  );

  return (
    <CollapsibleEntryCard
      title={titleNode}
      preview={preview}
      open={open}
      onToggle={onToggle}
      onRemove={disabled ? undefined : onRemove}
      removeLabel={`Remove ${displayLabel}`}
      toggleLabel={`${open ? "Collapse" : "Expand"} ${displayLabel}`}
      testId={`social-substances-item-${index}`}
      bodyId={`social-substances-item-body-${item.id}`}
      closeScrollToSelector={closeScrollToSelector ?? '[data-testid="social-history-cluster-substance"]'}
      className={isPast ? "bg-muted/30" : undefined}
    >
      {item.type === "other" ? (
        <input
          type="text"
          value={item.typeOther ?? ""}
          disabled={disabled}
          placeholder="Specify substance"
          aria-label="Other substance name"
          data-testid={`social-substances-item-${index}-other`}
          onChange={(e) => onPatch({ typeOther: e.target.value || undefined })}
          className={cn(
            RX_FIELD_INPUT_CLASS,
            "h-8 min-w-[6rem] max-w-[10rem] px-2 py-1 text-xs font-semibold",
          )}
        />
      ) : supportsAgentName ? (
        <input
          type="text"
          value={item.typeOther ?? ""}
          disabled={disabled}
          placeholder="Which one? e.g. Alprazolam"
          aria-label={`${displayLabel} agent name`}
          data-testid={`social-substances-item-${index}-agent`}
          onChange={(e) => onPatch({ typeOther: e.target.value || undefined })}
          className={cn(
            RX_FIELD_INPUT_CLASS,
            "h-8 min-w-[6rem] max-w-[10rem] px-2 py-1 text-xs",
          )}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>Amount</span>
        <input
          type="number"
          min={0}
          max={999}
          value={item.amount ?? ""}
          disabled={disabled}
          aria-label="Amount per day"
          data-testid={`social-substances-item-${index}-amount`}
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
            data-testid={`social-substances-item-${index}-amount-unit-other`}
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
        <span className="text-[11px] text-muted-foreground">/day</span>
        <div className="flex flex-wrap gap-0.5" role="group" aria-label={`${displayLabel} amount unit`}>
          {amountUnitsForSubstanceType(item.type).map((opt) => {
            const selected = resolvedAmountUnit === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={opt.label}
                data-testid={`social-substances-item-${index}-amount-unit-${opt.value}`}
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
        <span className={ROW_LABEL_CLASS}>Route</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label={`${displayLabel} route`}>
          {SUBSTANCE_ROUTE_OPTIONS.map((opt) => {
            const selected = item.route === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={opt.label}
                data-testid={`social-substances-item-${index}-route-${opt.value}`}
                onClick={() =>
                  onPatch({
                    route: selected ? undefined : (opt.value as SubstanceRoute),
                    ...(selected || opt.value !== "other" ? { routeOther: undefined } : {}),
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
        {item.route === "other" && (
          <input
            type="text"
            value={item.routeOther ?? ""}
            disabled={disabled}
            placeholder="Specify route"
            aria-label="Other route"
            data-testid={`social-substances-item-${index}-route-other`}
            onChange={(e) => onPatch({ routeOther: e.target.value || undefined })}
            className={cn(RX_FIELD_INPUT_CLASS, "h-8 min-w-[6rem] max-w-[10rem] px-2 py-1 text-xs")}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={ROW_LABEL_CLASS}>How often</span>
        <select
          disabled={disabled}
          aria-label="How often"
          data-testid={`social-substances-item-${index}-frequency-unit`}
          value={item.frequencyUnit ?? ""}
          onChange={(e) => {
            const next = e.target.value as SubstanceFrequencyUnit;
            if (!next) {
              onPatch({ frequencyUnit: undefined, frequency: undefined });
              return;
            }
            onPatch(substanceFrequencyUnitChangePatch(item, next));
          }}
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          <optgroup label="Common">
            {SUBSTANCE_COMMON_FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="More options">
            {SUBSTANCE_ADVANCED_FREQ_OPTIONS.map((option) => (
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
              value={item.frequency ?? ""}
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
              data-testid={`social-substances-item-${index}-frequency-count`}
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
          data-testid={`social-substances-item-${index}-years`}
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
                data-testid={`social-substances-item-${index}-duration-${option.value}`}
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

      {item.route === "iv" && (
        <p
          className="text-xs text-amber-800 dark:text-amber-200"
          data-testid={`social-substances-item-${index}-iv-hint`}
          role="status"
        >
          IV use — consider infection risk and BBV screening
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={`social-substance-note-${item.id}`} className={ROW_LABEL_CLASS}>
          Note
        </label>
        <input
          id={`social-substance-note-${item.id}`}
          type="text"
          value={item.note ?? ""}
          disabled={disabled}
          placeholder="Additional context"
          aria-label={`Note for ${displayLabel}`}
          maxLength={200}
          data-testid={`social-substances-item-${index}-note`}
          onChange={(e) => onPatch({ note: e.target.value.trim() || undefined })}
          className={cn(RX_FIELD_INPUT_CLASS, "h-8 min-w-0 flex-1 text-xs")}
        />
      </div>
    </CollapsibleEntryCard>
  );
}

export function SubstancesSection({
  value,
  disabled = false,
  inputIdPrefix,
  hideStatusLabel = false,
  closeScrollToSelector,
  onChange,
}: SubstancesSectionProps) {
  const normalized = useMemo(
    () => normalizeSubstancesSection(value.substances),
    [value.substances],
  );
  const status = normalized?.status;
  const items = substanceItemsForDisplay(normalized ?? undefined);
  const addOptions = useMemo(() => availableSubstanceAddChips(items), [items]);
  const implicitPast = status === "ex";

  const hints = substanceClinicalHints({
    substances: normalized ?? undefined,
    alcoholStatus: value.alcohol?.status ?? null,
  });

  // Per-item collapse state; newly added substances start collapsed (chip → card).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateSection = (next: SubstancesSectionInput | null) => {
    onChange(patchSubstances(value, next));
  };

  const handleStatus = (nextStatus: SubstanceUseStatus) => {
    if (status === nextStatus) {
      updateSection(null);
      return;
    }
    if (nextStatus === "never") {
      updateSection({ status: "never", items: [], notes: normalized?.notes });
      return;
    }
    updateSection({
      status: nextStatus,
      items: nextStatus === "ex" ? items.map((i) => ({ ...i, phase: "past" as const })) : items,
      notes: normalized?.notes,
    });
  };

  const handleAddType = (typeValue: SubstanceType) => {
    const newItem = createSubstanceItem(typeValue, {
      phase: status === "ex" ? "past" : "current",
    });
    updateSection({
      status: status ?? "current",
      items: [newItem, ...items],
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

  const patchItem = (itemId: string, patch: Partial<SubstanceUseItem>) => {
    updateSection({
      status: status ?? "current",
      items: items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      notes: normalized?.notes,
    });
  };

  return (
    <section className="space-y-2" aria-label="Substances">
      <StatusChipRow
        label="Substances"
        hideLabel={hideStatusLabel}
        options={SUBSTANCE_STATUS_OPTIONS}
        selected={status}
        disabled={disabled}
        testId="social-substances-status"
        onSelect={handleStatus}
      />

      {status && status !== "never" && (
        <>
          {!disabled && addOptions.length > 0 && items.length < MAX_SUBSTANCE_ITEMS && (
            <div className="space-y-1.5" data-testid="social-substances-add">
              <p className="text-xs font-medium text-foreground/80">Add substance</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add substance">
                {addOptions.map((option) => (
                  <TooltipProvider key={option.value} delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={`Add ${option.label}`}
                          data-testid={`social-substances-add-${option.value}`}
                          onClick={() => handleAddType(option.value)}
                          className={cn(ADD_CHIP_CLASS, "inline-flex items-center gap-1")}
                        >
                          + {option.label}
                          {option.tooltip ? (
                            <Info className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                          ) : null}
                        </button>
                      </TooltipTrigger>
                      {option.tooltip ? (
                        <TooltipContent
                          side="top"
                          className="max-w-[14rem] bg-popover px-2.5 py-1.5 text-popover-foreground"
                        >
                          {option.tooltip}
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div
              className="space-y-2"
              data-testid="social-substances-details"
              aria-expanded={true}
            >
              {items.map((item, index) => (
                <SubstanceItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  disabled={disabled}
                  implicitPast={implicitPast}
                  open={expandedIds.has(item.id)}
                  closeScrollToSelector={closeScrollToSelector}
                  onToggle={() => toggleExpanded(item.id)}
                  onPatch={(patch) => patchItem(item.id, patch)}
                  onRemove={() => handleRemoveItem(item.id)}
                />
              ))}
            </div>
          )}

        </>
      )}

      <SocialHistorySectionNotesField
        id={`${inputIdPrefix}-substances-notes`}
        testId="social-substances-notes"
        disabled={disabled}
        value={normalized?.notes ?? ""}
        placeholder="Context, treatment, harm reduction…"
        onChange={(notes) =>
          updateSection({
            ...(normalized ?? { items: [] }),
            status,
            items,
            notes,
          })
        }
      />

      {hints.length > 0 && (
        <div className="space-y-1" data-testid="social-substances-hints" role="status">
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
  hideLabel = false,
  options,
  selected,
  disabled,
  testId,
  onSelect,
}: {
  label: string;
  hideLabel?: boolean;
  options: readonly { value: SubstanceUseStatus; label: string }[];
  selected: SubstanceUseStatus | undefined;
  disabled?: boolean;
  testId: string;
  onSelect: (status: SubstanceUseStatus) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      {!hideLabel && <p className="text-xs font-medium text-foreground/80">{label}</p>}
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
