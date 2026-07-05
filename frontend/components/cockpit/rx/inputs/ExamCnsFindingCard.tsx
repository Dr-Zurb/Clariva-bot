"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type {
  CnsExamFieldDef,
  CnsExamFieldGroupDef,
  CnsExamFindingDef,
} from "@/lib/cockpit/cns-exam-finding-schema";
import {
  cnsFindingAttributesPreview,
  cnsFindingEntryHasAttributes,
  createEmptyFindingEntry,
  patchFindingEntryAttributes,
} from "@/lib/cockpit/exam-finding-utils";
import { EXAM_CNS_FINDING_CARD_ATTR } from "@/lib/cockpit/exam-card-scroll";
import type { ExamFindingEntry } from "@/types/prescription";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_EXAM_FIELD_LABEL_BLOCK_CLASS,
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { Collapse } from "@/components/ui/Collapse";
import { EXAM_PATIENT_ASSISTED_PILL_CLASS } from "@/components/cockpit/rx/inputs/ExamTeleconsultFeasibilityChip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function splitMultiValue(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinMultiValue(values: string[]): string {
  return values.join(", ");
}

function chipTestSlug(chip: string): string {
  return chip.replace(/\s+/g, "-").replace(/\//g, "-").replace(/'/g, "").toLowerCase();
}

function CnsFindingFieldGroupRow({
  group,
  findingId,
  attributes,
  disabled,
  onPatch,
}: {
  group: CnsExamFieldGroupDef;
  findingId: string;
  attributes: Record<string, string>;
  disabled?: boolean;
  onPatch: (patch: Record<string, string | null>) => void;
}) {
  const selected = splitMultiValue(attributes[group.attributeKey]);

  return (
    <div data-testid={`cns-field-group-${findingId}-${group.id}`}>
      <span className={RX_EXAM_FIELD_LABEL_CLASS}>{group.label}</span>
      <div
        className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
        role="group"
        aria-label={group.label}
      >
        {group.chips.map((chip) => {
          const isSelected = selected.some(
            (item) => item.toLowerCase() === chip.toLowerCase(),
          );
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              data-testid={`cns-field-${findingId}-${group.attributeKey}-${chipTestSlug(chip)}`}
              onClick={() => {
                const next = isSelected
                  ? selected.filter((item) => item.toLowerCase() !== chip.toLowerCase())
                  : [...selected, chip];
                onPatch({
                  [group.attributeKey]: next.length > 0 ? joinMultiValue(next) : null,
                });
              }}
              className={chartSelectChipClass(isSelected)}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CnsFindingFieldRow({
  field,
  findingId,
  attributes,
  disabled,
  onPatch,
}: {
  field: CnsExamFieldDef;
  findingId: string;
  attributes: Record<string, string>;
  disabled?: boolean;
  onPatch: (patch: Record<string, string | null>) => void;
}) {
  const value = attributes[field.key] ?? "";

  if (field.type === "chips") {
    const selected = field.multi ? splitMultiValue(value) : value ? [value] : [];
    return (
      <div>
        <span className={RX_EXAM_FIELD_LABEL_CLASS}>{field.label}</span>
        <div
          className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
          role="group"
          aria-label={field.label}
        >
          {(field.chips ?? []).map((chip) => {
            const isSelected = selected.some(
              (item) => item.toLowerCase() === chip.toLowerCase(),
            );
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                data-testid={`cns-field-${findingId}-${field.key}-${chipTestSlug(chip)}`}
                onClick={() => {
                  if (field.multi) {
                    const next = isSelected
                      ? selected.filter((item) => item.toLowerCase() !== chip.toLowerCase())
                      : [...selected, chip];
                    onPatch({ [field.key]: next.length > 0 ? joinMultiValue(next) : null });
                    return;
                  }
                  onPatch({ [field.key]: isSelected ? null : chip });
                }}
                className={chartSelectChipClass(isSelected)}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={`cns-finding-${findingId}-${field.key}`}
        className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
      >
        {field.label}
      </label>
      <input
        id={`cns-finding-${findingId}-${field.key}`}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={field.placeholder}
        maxLength={500}
        onChange={(event) => onPatch({ [field.key]: event.target.value || null })}
        className={RX_FIELD_INPUT_CLASS}
        data-testid={`cns-field-${findingId}-${field.key}`}
      />
    </div>
  );
}

export interface ExamCnsFindingCardProps {
  definition: CnsExamFindingDef;
  entry?: ExamFindingEntry;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (entry: ExamFindingEntry) => void;
  onClear: () => void;
  /** Teleconsult hint for cranial structured cards with contact-dependent fields. */
  teleconsultFeasibilityHint?: string;
}

export function ExamCnsFindingCard({
  definition,
  entry,
  disabled = false,
  open,
  onOpenChange,
  onChange,
  onClear,
  teleconsultFeasibilityHint,
}: ExamCnsFindingCardProps) {
  const isRecorded = Boolean(entry && cnsFindingEntryHasAttributes(entry));
  const detailPreview = entry && isRecorded ? cnsFindingAttributesPreview(entry) : "";
  const attributes = entry?.attributes ?? {};
  const flaggedTeleconsult = Boolean(teleconsultFeasibilityHint);
  const limitedOnTeleconsult = flaggedTeleconsult && !isRecorded;
  const patientAssisted = flaggedTeleconsult && isRecorded;

  function patchAttributes(patch: Record<string, string | null>) {
    const base = entry ?? createEmptyFindingEntry(definition.findingId);
    onChange(patchFindingEntryAttributes(base, patch));
  }

  return (
    <article
      className={cn(
        "scroll-mt-[calc(var(--collapsible-sticky-top,2.75rem)_+_var(--exam-card-sticky-top,2.75rem))] transition-colors",
        limitedOnTeleconsult && !open && "border border-dashed border-border/50 bg-muted/20",
        open
          ? "my-1 rounded-sm border border-border/70 bg-background px-1 shadow-sm"
          : isRecorded
            ? "bg-muted/10 hover:bg-muted/20"
            : limitedOnTeleconsult
              ? "hover:bg-muted/25"
              : "hover:bg-muted/15",
      )}
      {...{ [EXAM_CNS_FINDING_CARD_ATTR]: definition.findingId }}
      data-testid={`cns-finding-card-${definition.findingId}`}
      data-recorded={isRecorded ? "true" : "false"}
      data-open={open ? "true" : "false"}
      data-teleconsult-limited={limitedOnTeleconsult ? "true" : "false"}
      data-patient-assisted={patientAssisted ? "true" : "false"}
    >
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        {limitedOnTeleconsult ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpenChange(!open)}
                aria-expanded={open}
                aria-label={`${definition.label}. ${teleconsultFeasibilityHint}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-muted-foreground disabled:opacity-50"
                data-testid={`cns-finding-toggle-${definition.findingId}`}
              >
                <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
                  {definition.label}
                </span>
                {!open ? (
                  <span className="truncate text-xs text-muted-foreground/60">
                    — Limited on teleconsult
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[16rem] text-left">
              {teleconsultFeasibilityHint}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left disabled:opacity-50"
            data-testid={`cns-finding-toggle-${definition.findingId}`}
          >
            {isRecorded && !open ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
            ) : null}
            <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>{definition.label}</span>
            {!open ? (
              <span
                className={cn(
                  "truncate text-xs",
                  isRecorded ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {detailPreview ? ` — ${detailPreview}` : null}
              </span>
            ) : null}
          </button>
        )}
        {patientAssisted ? (
          <span
            className={EXAM_PATIENT_ASSISTED_PILL_CLASS}
            data-testid={`cns-finding-patient-assisted-${definition.findingId}`}
          >
            Patient-assisted
          </span>
        ) : null}
        {isRecorded ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            aria-label={`Clear ${definition.label}`}
            data-testid={`cns-finding-clear-${definition.findingId}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${definition.label}` : `Expand ${definition.label}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open ? "-rotate-180" : "rotate-0",
            )}
            aria-hidden
          />
        </button>
      </div>

      <Collapse open={open} className="space-y-2 border-t border-border/50 px-2 pb-2 pt-2">
          {(definition.fieldGroups ?? []).map((group) => (
            <CnsFindingFieldGroupRow
              key={group.id}
              group={group}
              findingId={definition.findingId}
              attributes={attributes}
              disabled={disabled}
              onPatch={patchAttributes}
            />
          ))}
          {definition.fields.map((field) => (
            <CnsFindingFieldRow
              key={field.key}
              field={field}
              findingId={definition.findingId}
              attributes={attributes}
              disabled={disabled}
              onPatch={patchAttributes}
            />
          ))}
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenChange(false)}
              aria-label={`Collapse ${definition.label}`}
              data-testid={`cns-finding-done-${definition.findingId}`}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ChevronUp className="h-3 w-3" aria-hidden />
              Collapse
            </button>
          </div>
      </Collapse>
    </article>
  );
}
