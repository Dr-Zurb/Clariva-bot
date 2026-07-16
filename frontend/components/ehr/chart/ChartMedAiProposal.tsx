"use client";

import {
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Sparkles, Plus, X } from "lucide-react";

import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import type { PatientConditionAgoUnit } from "@/types/patient-chart";
import {
  formatStrengthComponents,
  formatStrengthLabel,
  formatChartMedFormLabel,
  formatStartedAgoSummary,
  getChartFrequencyLabel,
} from "@/lib/chart/chart-medication";
import { getFoodTimingLabel } from "@/lib/medicineCodes";
import { cn } from "@/lib/utils";
import type { FrequencyCode, FoodTiming, StrengthUnit } from "@/types/prescription";

export type ChartMedAiStatus = "loading" | "error" | "ready";

interface ChartMedAiProposalProps {
  status: ChartMedAiStatus;
  medicines: AiParsedMedicine[];
  /** Doctor's original typed line — shown on the Keep row. */
  typedText: string;
  onAdd: (index: number) => void;
  onAddAll: () => void;
  onDismiss: () => void;
  /**
   * Auto-gate path (Enter): commit the doctor's typed line as-is. When set, a
   * trailing "Keep as typed" listbox row is shown (investigations / ICD pattern).
   * Absent on the explicit "✨ Refine" path (dismiss via ✕ / Esc).
   */
  onKeepAsTyped?: () => void;
}

/** One-line sig summary for an AI-detected medicine. */
function summarize(med: AiParsedMedicine): string {
  const parts: string[] = [];
  const comboStrength =
    med.strengthComponents && med.strengthComponents.length >= 2
      ? formatStrengthComponents(
          med.strengthComponents.map((c) => ({
            value: c.value,
            unit: (c.unit as StrengthUnit | null) ?? null,
          })),
        )
      : "";
  const strength =
    comboStrength ||
    formatStrengthLabel(
      med.strengthValue ?? null,
      (med.strengthUnit as StrengthUnit | null) ?? null,
    );
  if (strength) parts.push(strength);
  if (med.doseQty != null) {
    parts.push(med.doseUnit ? `${med.doseQty} ${med.doseUnit}` : `${med.doseQty}`);
  }
  if (med.frequencyCode) {
    parts.push(getChartFrequencyLabel(med.frequencyCode as FrequencyCode));
  }
  if (med.doseSchedule) parts.push(med.doseSchedule);
  if (med.form) parts.push(formatChartMedFormLabel(med.form));
  const food = getFoodTimingLabel(med.foodTiming as FoodTiming | null);
  if (food) parts.push(food);
  if (med.startedAgoValue != null && med.startedAgoUnit) {
    parts.push(
      `For ${formatStartedAgoSummary(med.startedAgoValue, med.startedAgoUnit as PatientConditionAgoUnit)}`,
    );
  }
  if (med.intakePattern === "regular") parts.push("Regular");
  else if (med.intakePattern === "irregular") parts.push("Irregular");
  if (med.source === "prescribed") parts.push("Prescribed");
  else if (med.source === "self") parts.push("Self-started");
  return parts.join(" · ");
}

/**
 * Suggestion-only proposal panel for the chart-medicine AI parse
 * (confirm-to-apply). Keyboard matches InvestigationSuggestPanel /
 * DiagnosisAiProposal: ↑/↓ through med rows + trailing Keep; Enter activates;
 * Esc keeps typed (autogate) or dismisses (Refine).
 */
export function ChartMedAiProposal({
  status,
  medicines,
  typedText,
  onAdd,
  onAddAll,
  onDismiss,
  onKeepAsTyped,
}: ChartMedAiProposalProps) {
  const hasSuggestions = status === "ready" && medicines.length > 0;
  const showKeep = Boolean(onKeepAsTyped);
  const keepIdx = hasSuggestions ? medicines.length : 0;
  const rowCount = hasSuggestions
    ? medicines.length + (showKeep ? 1 : 0)
    : showKeep
      ? 1
      : 0;
  const [activeIdx, setActiveIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `${useId()}-listbox`;

  useEffect(() => {
    setActiveIdx(0);
  }, [medicines, typedText, status]);

  useEffect(() => {
    if (rowCount === 0) return;
    // Focus the active option so Enter works without a mouse — including Keep.
    if (status === "loading" && !showKeep) return;
    itemRefs.current[activeIdx]?.focus();
  }, [activeIdx, medicines, status, rowCount, showKeep]);

  function activateActiveRow() {
    if (hasSuggestions && activeIdx < medicines.length) {
      onAdd(activeIdx);
      return;
    }
    if (showKeep) {
      onKeepAsTyped?.();
      return;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (rowCount === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rowCount - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (showKeep) onKeepAsTyped?.();
      else onDismiss();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateActiveRow();
    }
  }

  const statusLabel =
    status === "loading"
      ? "Reading with AI…"
      : status === "error"
        ? "Couldn’t read — keeping your typed text."
        : medicines.length === 0
          ? "No medicines found."
          : medicines.length === 1
            ? "AI suggestion"
            : `AI found ${medicines.length} medicines`;

  const keyboardHint = hasSuggestions
    ? showKeep
      ? "↑↓ navigate · Enter to add · Esc to keep typed text"
      : "↑↓ navigate · Enter to add · Esc to dismiss"
    : showKeep
      ? "Enter to keep as typed · Esc to keep typed text"
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
      data-testid="chart-med-ai-proposal"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {statusLabel}
        </span>
        {status === "ready" && medicines.length > 1 ? (
          <button
            type="button"
            onClick={onAddAll}
            className="rounded-sm border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Add all
          </button>
        ) : null}
        {!showKeep ? (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss AI suggestions"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {rowCount > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Medicine suggestions"
          className="mt-1.5 space-y-1"
        >
          {hasSuggestions
            ? medicines.map((med, index) => {
                const detail = summarize(med);
                const active = index === activeIdx;
                return (
                  <li key={`${med.name}-${index}`} role="none">
                    <button
                      type="button"
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      role="option"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      onClick={() => onAdd(index)}
                      onMouseEnter={() => setActiveIdx(index)}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded-sm px-1.5 py-1.5 text-left transition-colors",
                        active
                          ? "bg-primary/15 font-medium text-foreground ring-1 ring-primary/30"
                          : "bg-background/60 text-foreground hover:bg-muted/50",
                      )}
                      aria-label={`Add ${med.name}`}
                      data-testid={`chart-med-ai-accept-${index}`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">
                          {med.name}
                        </span>
                        {detail ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {detail}
                          </span>
                        ) : null}
                      </div>
                      <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary">
                        <Plus className="h-3 w-3" aria-hidden />
                        Add
                      </span>
                    </button>
                  </li>
                );
              })
            : null}

          {showKeep ? (
            <li role="none">
              <button
                type="button"
                ref={(el) => {
                  itemRefs.current[keepIdx] = el;
                }}
                role="option"
                aria-selected={activeIdx === keepIdx}
                tabIndex={activeIdx === keepIdx ? 0 : -1}
                onClick={onKeepAsTyped}
                onMouseEnter={() => setActiveIdx(keepIdx)}
                className={cn(
                  "w-full rounded-sm border border-dashed px-2 py-1.5 text-left text-sm transition-colors",
                  activeIdx === keepIdx
                    ? "border-border bg-muted font-medium text-foreground ring-1 ring-border"
                    : "border-border/70 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                data-testid="chart-med-ai-keep-as-typed"
              >
                Keep “{typedText}” as typed
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {keyboardHint ? (
        <p className="mt-1 px-0.5 text-[11px] text-muted-foreground" aria-hidden>
          {keyboardHint}
        </p>
      ) : null}
    </div>
  );
}
