"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { ChartEditorFieldRow } from "@/components/ehr/chart/ConditionTimingField";
import {
  CHART_CARD_OPTION_CHIP_CLASS,
  CHART_COMPACT_INPUT_CLASS,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  scrollAllergyCaptureIntoView,
  scrollAllergyCardHeaderIntoView,
} from "@/lib/chart/chart-allergy-scroll";
import {
  appendAllergyReaction,
  availableAllergyReactionQuickAdd,
} from "@/lib/cockpit/common-allergens";
import { cn } from "@/lib/utils";
import type { PatientAllergy, PatientAllergySeverity } from "@/types/patient-chart";

type AllergySeverityChip = Exclude<PatientAllergySeverity, "unknown">;

const SEVERITY_CHIP_OPTIONS: { value: AllergySeverityChip; label: string }[] = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

const SEVERITY_CHIP_SELECTED: Record<AllergySeverityChip, string> = {
  mild: "border-yellow-600/30 bg-yellow-50 text-yellow-800",
  moderate: "border-orange-600/30 bg-orange-50 text-orange-800",
  severe: "border-red-600/30 bg-red-50 text-red-800",
};

function severityLabel(severity: PatientAllergySeverity): string {
  return SEVERITY_CHIP_OPTIONS.find((opt) => opt.value === severity)?.label ?? severity;
}

function formatAllergyDetail(reaction: string | null, note: string | null): string | null {
  const parts = [reaction?.trim(), note?.trim()].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : null;
}

function AllergySeverityToggle({
  value,
  disabled,
  testId,
  ariaLabel,
  onChange,
}: {
  value: PatientAllergySeverity;
  disabled?: boolean;
  testId?: string;
  ariaLabel: string;
  onChange: (value: AllergySeverityChip) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap gap-0.5"
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {SEVERITY_CHIP_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={option.label}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              CHART_CARD_OPTION_CHIP_CLASS,
              isSelected
                ? SEVERITY_CHIP_SELECTED[option.value]
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

export interface AllergyCardPatch {
  severity?: PatientAllergySeverity;
  reaction?: string | null;
  note?: string | null;
}

export interface AllergyCardProps {
  allergy: PatientAllergy;
  readonly?: boolean;
  busy?: boolean;
  defaultCollapsed?: boolean;
  testIdPrefix?: string;
  /** Capture combobox input id — scroll target after deliberate collapse. */
  captureInputId?: string;
  /** Capture subsection wrapper id — preferred collapse scroll target. */
  sectionId?: string;
  onPatch: (patch: AllergyCardPatch) => void;
  onRemove: () => void;
}

export function AllergyCard({
  allergy,
  readonly = false,
  busy = false,
  defaultCollapsed = true,
  testIdPrefix = "allergy",
  captureInputId,
  sectionId,
  onPatch,
  onRemove,
}: AllergyCardProps) {
  const pending = allergy.id.startsWith("temp-");
  const [expanded, setExpanded] = useState(() => !defaultCollapsed);
  const [reactionDraft, setReactionDraft] = useState(allergy.reaction ?? "");
  const [noteDraft, setNoteDraft] = useState(allergy.note ?? "");
  const collapseHeaderRef = useRef<HTMLDivElement>(null);
  const prevExpandedRef = useRef(expanded);
  const collapsible = !readonly;
  const canExpand = collapsible && !pending;
  const showSummary = collapsible && !expanded;
  const detail = formatAllergyDetail(allergy.reaction, allergy.note);
  const severityTestId = `${testIdPrefix}-severity-${allergy.id}`;
  const reactionQuickAddLabels = useMemo(
    () => availableAllergyReactionQuickAdd(reactionDraft),
    [reactionDraft],
  );

  useEffect(() => {
    setReactionDraft(allergy.reaction ?? "");
    setNoteDraft(allergy.note ?? "");
  }, [allergy.id, allergy.reaction, allergy.note]);

  useLayoutEffect(() => {
    if (!canExpand) return;
    const prev = prevExpandedRef.current;
    if (expanded && !prev) {
      scrollAllergyCardHeaderIntoView(collapseHeaderRef.current);
    } else if (!expanded && prev && captureInputId) {
      scrollAllergyCaptureIntoView({ sectionId, captureInputId });
    }
    prevExpandedRef.current = expanded;
  }, [canExpand, captureInputId, expanded, sectionId]);

  const collapse = () => setExpanded(false);

  const commitReaction = () => {
    const next = reactionDraft.trim() || null;
    if (next === (allergy.reaction?.trim() || null)) return;
    onPatch({ reaction: next });
  };

  const commitNote = () => {
    const next = noteDraft.trim() || null;
    if (next === (allergy.note?.trim() || null)) return;
    onPatch({ note: next });
  };

  const addReactionChip = (label: string) => {
    const next = appendAllergyReaction(reactionDraft, label);
    setReactionDraft(next);
    onPatch({ reaction: next || null });
  };

  const handleSummaryKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canExpand) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded(true);
    }
  };

  const summarySeverityToggle =
    !readonly ? (
      <div
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <AllergySeverityToggle
          value={allergy.severity}
          testId={severityTestId}
          ariaLabel={`Severity for ${allergy.allergen}`}
          onChange={(severity) => onPatch({ severity })}
        />
      </div>
    ) : allergy.severity !== "unknown" ? (
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {severityLabel(allergy.severity)}
      </span>
    ) : null;

  if (showSummary) {
    return (
      <div
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onClick={() => {
          if (canExpand) setExpanded(true);
        }}
        onKeyDown={handleSummaryKeyDown}
        className={cn(
          "group flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5",
          canExpand &&
            "cursor-pointer hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring",
        )}
        data-testid={`${testIdPrefix}-summary-${allergy.id}`}
        aria-label={canExpand ? `${allergy.allergen} — expand allergy` : undefined}
        aria-expanded={false}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">{allergy.allergen}</span>
          {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
          {summarySeverityToggle}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={busy || pending}
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
          aria-label={`Remove allergy ${allergy.allergen}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="space-y-2 rounded-md border border-border/60 bg-background px-2.5 py-2"
      data-testid={`${testIdPrefix}-card-${allergy.id}`}
      aria-expanded={canExpand ? expanded : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && canExpand) collapse();
      }}
    >
      {canExpand && (
        <div
          ref={collapseHeaderRef}
          className="-mx-2.5 -mt-2 mb-1 flex items-center gap-1.5 border-b border-border/60 bg-muted/25 px-2 py-1"
          data-testid={`${testIdPrefix}-collapse-header-${allergy.id}`}
        >
          <button
            type="button"
            onClick={collapse}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-0.5 pl-0.5 text-left hover:bg-muted/40"
            aria-label={`Collapse ${allergy.allergen}`}
            aria-expanded
          >
            <span className="truncate text-xs font-medium text-foreground">{allergy.allergen}</span>
            {detail ? (
              <span className="truncate text-xs text-muted-foreground">· {detail}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={collapse}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label={`Collapse ${allergy.allergen}`}
            aria-expanded
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          {!readonly && (
            <button
              type="button"
              disabled={busy || pending}
              onClick={onRemove}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive disabled:opacity-50"
              aria-label={`Remove allergy ${allergy.allergen}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {!readonly && !pending ? (
          <>
            <ChartEditorFieldRow label="Severity">
              <AllergySeverityToggle
                value={allergy.severity}
                testId={severityTestId}
                ariaLabel={`Severity for ${allergy.allergen}`}
                onChange={(severity) => onPatch({ severity })}
              />
            </ChartEditorFieldRow>
            <ChartEditorFieldRow label="Reaction">
              <div className="min-w-0 space-y-2">
                <ChartQuickAddChips
                  labels={reactionQuickAddLabels}
                  disabled={busy}
                  groupLabel="Common reactions"
                  testId={`${testIdPrefix}-reaction-quick-add-${allergy.id}`}
                  onAdd={addReactionChip}
                />
                <input
                  type="text"
                  value={reactionDraft}
                  disabled={busy}
                  placeholder="e.g. Rash, anaphylaxis"
                  aria-label={`Reaction for ${allergy.allergen}`}
                  className={cn(CHART_COMPACT_INPUT_CLASS, "h-8 w-full min-w-0")}
                  data-testid={`${testIdPrefix}-reaction-${allergy.id}`}
                  onChange={(e) => setReactionDraft(e.target.value)}
                  onBlur={commitReaction}
                />
              </div>
            </ChartEditorFieldRow>
            <ChartEditorFieldRow label="Note">
              <input
                type="text"
                value={noteDraft}
                disabled={busy}
                placeholder="Additional context"
                aria-label={`Note for ${allergy.allergen}`}
                className={cn(CHART_COMPACT_INPUT_CLASS, "h-8 w-full min-w-0")}
                data-testid={`${testIdPrefix}-note-${allergy.id}`}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={commitNote}
              />
            </ChartEditorFieldRow>
          </>
        ) : readonly && detail ? (
          <p className="text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
