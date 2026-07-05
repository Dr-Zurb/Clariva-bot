"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { ChartEditorFieldRow } from "@/components/ehr/chart/ConditionTimingField";
import {
  CHART_CARD_OPTION_CHIP_CLASS,
  CHART_COMPACT_INPUT_CLASS,
} from "@/components/ehr/chart/chart-chip-styles";
import { scrollAllergyCardHeaderIntoView } from "@/lib/chart/chart-allergy-scroll";
import { scrollCollapsibleToTop } from "@/lib/cockpit/collapse-scroll";
import {
  appendAllergyReaction,
  availableAllergyReactionQuickAdd,
} from "@/lib/cockpit/common-allergens";
import { Collapse } from "@/components/ui/Collapse";
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
  onPatch: (patch: AllergyCardPatch) => void;
  onRemove: () => void;
}

export function AllergyCard({
  allergy,
  readonly = false,
  busy = false,
  defaultCollapsed = true,
  testIdPrefix = "allergy",
  onPatch,
  onRemove,
}: AllergyCardProps) {
  const pending = allergy.id.startsWith("temp-");
  const [expanded, setExpanded] = useState(() => !defaultCollapsed);
  const [reactionDraft, setReactionDraft] = useState(allergy.reaction ?? "");
  const [noteDraft, setNoteDraft] = useState(allergy.note ?? "");
  const cardRef = useRef<HTMLDivElement>(null);
  const prevExpandedRef = useRef(expanded);
  const collapsible = !readonly;
  const canExpand = collapsible && !pending;
  const detail = formatAllergyDetail(allergy.reaction, allergy.note);
  const severityTestId = `${testIdPrefix}-severity-${allergy.id}`;
  const bodyId = `${testIdPrefix}-body-${allergy.id}`;
  const reactionQuickAddLabels = useMemo(
    () => availableAllergyReactionQuickAdd(reactionDraft),
    [reactionDraft],
  );

  useEffect(() => {
    setReactionDraft(allergy.reaction ?? "");
    setNoteDraft(allergy.note ?? "");
  }, [allergy.id, allergy.reaction, allergy.note]);

  // Open glides the card to the sticky line so its body expands in view. Close
  // glides the whole Allergies container (capture bar + chip list) back to the top —
  // the same gesture chief complaints uses — so the doctor lands where new chips are
  // added, not stranded mid-list.
  useLayoutEffect(() => {
    if (!canExpand) return;
    const prev = prevExpandedRef.current;
    if (expanded === prev) return;
    prevExpandedRef.current = expanded;
    if (expanded) {
      scrollAllergyCardHeaderIntoView(cardRef.current);
    } else {
      scrollCollapsibleToTop(cardRef.current?.closest("section") ?? null);
    }
  }, [canExpand, expanded]);

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
      setExpanded((v) => !v);
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

  // Temp rows stay summary-only (no expand) while the create reconciles.
  if (pending) {
    return (
      <div
        className="group flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
        data-testid={`${testIdPrefix}-summary-${allergy.id}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">{allergy.allergen}</span>
          {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
          {summarySeverityToggle}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
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
      ref={cardRef}
      className="scroll-mt-[var(--collapsible-sticky-top,2.75rem)] rounded-md border border-border/60 bg-background transition-colors"
      data-testid={`${testIdPrefix}-card-${allergy.id}`}
      data-open={expanded ? "true" : "false"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && canExpand && expanded) collapse();
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5",
          expanded && "border-b border-border/60 bg-muted/25",
        )}
        data-testid={
          expanded
            ? `${testIdPrefix}-collapse-header-${allergy.id}`
            : `${testIdPrefix}-summary-${allergy.id}`
        }
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? bodyId : undefined}
        aria-label={
          canExpand
            ? expanded
              ? `Collapse ${allergy.allergen}`
              : `Expand ${allergy.allergen}`
            : undefined
        }
        onClick={() => {
          if (canExpand) setExpanded((v) => !v);
        }}
        onKeyDown={handleSummaryKeyDown}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">{allergy.allergen}</span>
          {!expanded && detail ? (
            <span className="text-muted-foreground">· {detail}</span>
          ) : null}
          {!expanded ? summarySeverityToggle : null}
        </div>

        {!readonly && (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
            aria-label={`Remove allergy ${allergy.allergen}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        {canExpand ? (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded ? "-rotate-180" : "rotate-0",
            )}
            aria-hidden
          />
        ) : null}
      </div>

      {canExpand ? (
        <Collapse open={expanded} id={bodyId} className="space-y-2 px-2.5 pb-2.5 pt-2">
          {!readonly ? (
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
          ) : detail ? (
            <p className="text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </Collapse>
      ) : readonly && detail ? (
        <p className="px-2.5 pb-2 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}
