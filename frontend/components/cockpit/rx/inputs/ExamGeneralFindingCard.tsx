"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type {
  GeneralExamFieldDef,
  GeneralExamFieldGroupDef,
  GeneralExamFindingDef,
} from "@/lib/cockpit/general-exam-finding-schema";
import {
  createEmptyFindingEntry,
  findingEntryHasAttributes,
  generalFindingAttributesPreview,
  patchFindingEntryAttributes,
  setEdemaSites,
  setLymphadenopathySites,
} from "@/lib/cockpit/exam-finding-utils";
import { EXAM_GENERAL_FINDING_CARD_ATTR } from "@/lib/cockpit/exam-card-scroll";
import { migrateEdemaAttributes, parseEdemaSites } from "@/lib/cockpit/edema-sites";
import {
  migrateLymphadenopathyAttributes,
  parseLymphSites,
} from "@/lib/cockpit/lymphadenopathy-sites";
import { EdemaSitesPanel } from "@/components/cockpit/rx/inputs/EdemaSitesPanel";
import { LymphadenopathySitesPanel } from "@/components/cockpit/rx/inputs/LymphadenopathySitesPanel";
import { ClubbingGradeHelp } from "@/components/cockpit/rx/inputs/ClubbingGradeHelp";
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
import {
  ExamTeleconsultFindingCardHeader,
  examTeleconsultFindingCardShellClass,
  useExamTeleconsultFindingCardState,
} from "@/components/cockpit/rx/inputs/ExamTeleconsultFindingCardHeader";
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
  return chip.replace(/\s+/g, "-").replace(/\//g, "-").toLowerCase();
}

function GeneralFindingFieldGroupRow({
  group,
  findingId,
  attributes,
  disabled,
  onPatch,
}: {
  group: GeneralExamFieldGroupDef;
  findingId: string;
  attributes: Record<string, string>;
  disabled?: boolean;
  onPatch: (patch: Record<string, string | null>) => void;
}) {
  const selected = splitMultiValue(attributes[group.attributeKey]);

  return (
    <div data-testid={`general-field-group-${findingId}-${group.id}`}>
      <span className={RX_EXAM_FIELD_LABEL_CLASS}>{group.label}</span>
      <div
        className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
        role="group"
        aria-label={`${group.label} sites`}
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
              data-testid={`general-field-${findingId}-${group.attributeKey}-${chipTestSlug(chip)}`}
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

function GeneralFindingFieldRow({
  field,
  findingId,
  attributes,
  disabled,
  onPatch,
}: {
  field: GeneralExamFieldDef;
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
        <div className="flex items-center gap-1">
          <span className={RX_EXAM_FIELD_LABEL_CLASS}>{field.label}</span>
          {findingId === "clubbing" && field.key === "grade" ? <ClubbingGradeHelp /> : null}
        </div>
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
                data-testid={`general-field-${findingId}-${field.key}-${chipTestSlug(chip)}`}
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
        htmlFor={`general-finding-${findingId}-${field.key}`}
        className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
      >
        {field.label}
      </label>
      <input
        id={`general-finding-${findingId}-${field.key}`}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={field.placeholder}
        maxLength={500}
        onChange={(event) => onPatch({ [field.key]: event.target.value || null })}
        className={RX_FIELD_INPUT_CLASS}
      />
    </div>
  );
}

export interface ExamGeneralFindingCardProps {
  definition: GeneralExamFindingDef;
  /** When absent the card is idle (implicit normal); first field edit creates an entry. */
  entry?: ExamFindingEntry;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (entry: ExamFindingEntry) => void;
  onClear: () => void;
  teleconsultFeasibilityHint?: string;
}

export function ExamGeneralFindingCard({
  definition,
  entry,
  disabled = false,
  open,
  onOpenChange,
  onChange,
  onClear,
  teleconsultFeasibilityHint,
}: ExamGeneralFindingCardProps) {
  const isRecorded = Boolean(entry && findingEntryHasAttributes(entry));
  const { limitedOnTeleconsult, patientAssisted } = useExamTeleconsultFindingCardState(
    isRecorded,
    teleconsultFeasibilityHint,
  );
  const detailPreview =
    entry && isRecorded ? generalFindingAttributesPreview(entry) : "";
  const attributes = entry?.attributes ?? {};
  const edemaSites =
    definition.findingId === "edema"
      ? parseEdemaSites(migrateEdemaAttributes(attributes))
      : [];
  const lymphSites =
    definition.findingId === "lymphadenopathy"
      ? parseLymphSites(migrateLymphadenopathyAttributes(attributes))
      : [];

  function patchAttributes(patch: Record<string, string | null>) {
    const base = entry ?? createEmptyFindingEntry(definition.findingId);
    onChange(patchFindingEntryAttributes(base, patch));
  }

  function handleEdemaSitesChange(sites: ReturnType<typeof parseEdemaSites>) {
    const base = entry ?? createEmptyFindingEntry(definition.findingId);
    onChange(setEdemaSites(base, sites));
  }

  function handleLymphSitesChange(sites: ReturnType<typeof parseLymphSites>) {
    const base = entry ?? createEmptyFindingEntry(definition.findingId);
    onChange(setLymphadenopathySites(base, sites));
  }

  function renderFindingBody() {
    if (definition.findingId === "edema") {
      return (
        <EdemaSitesPanel sites={edemaSites} disabled={disabled} onChange={handleEdemaSitesChange} />
      );
    }
    if (definition.findingId === "lymphadenopathy") {
      return (
        <LymphadenopathySitesPanel
          sites={lymphSites}
          disabled={disabled}
          onChange={handleLymphSitesChange}
        />
      );
    }
    return definition.fields.map((field) => (
      <GeneralFindingFieldRow
        key={field.key}
        field={field}
        findingId={definition.findingId}
        attributes={attributes}
        disabled={disabled}
        onPatch={patchAttributes}
      />
    ));
  }

  return (
    <article
      className={cn(
        "scroll-mt-[calc(var(--collapsible-sticky-top,2.75rem)_+_var(--exam-card-sticky-top,2.75rem))] transition-colors",
        examTeleconsultFindingCardShellClass(open, isRecorded, limitedOnTeleconsult),
      )}
      {...{ [EXAM_GENERAL_FINDING_CARD_ATTR]: definition.findingId }}
      data-testid={`general-finding-card-${definition.findingId}`}
      data-recorded={isRecorded ? "true" : "false"}
      data-open={open ? "true" : "false"}
      data-teleconsult-limited={limitedOnTeleconsult ? "true" : "false"}
      data-patient-assisted={patientAssisted ? "true" : "false"}
    >
      <ExamTeleconsultFindingCardHeader
        label={definition.label}
        findingId={definition.findingId}
        testIdPrefix="general-finding"
        disabled={disabled}
        open={open}
        isRecorded={isRecorded}
        detailPreview={detailPreview}
        teleconsultFeasibilityHint={teleconsultFeasibilityHint}
        onToggle={() => onOpenChange(!open)}
        onClear={isRecorded ? onClear : undefined}
        expandCollapseButton={
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
        }
      />

      <Collapse open={open} className="space-y-2 border-t border-border/50 px-2 pb-2 pt-2">
          {(definition.fieldGroups ?? []).map((group) => (
            <GeneralFindingFieldGroupRow
              key={group.id}
              group={group}
              findingId={definition.findingId}
              attributes={attributes}
              disabled={disabled}
              onPatch={patchAttributes}
            />
          ))}
          {renderFindingBody()}
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenChange(false)}
              aria-label={`Collapse ${definition.label}`}
              data-testid={`general-finding-done-${definition.findingId}`}
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
