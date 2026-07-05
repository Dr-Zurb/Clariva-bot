"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { RespExamChipGroupDef } from "@/lib/cockpit/resp-exam-finding-schema";
import {
  respAuscultationChipGroupCardId,
  resolveRespAuscultationChipGroupNotesMeta,
} from "@/lib/cockpit/resp-exam-finding-schema";
import { EXAM_RESP_FINDING_CARD_ATTR } from "@/lib/cockpit/exam-card-scroll";
import {
  chipLabelToFindingId,
  createEmptyFindingEntry,
  findExamFindingEntry,
  patchFindingEntryAttributes,
} from "@/lib/cockpit/exam-finding-utils";
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
import { cn } from "@/lib/utils";

function chipTestId(chip: string): string {
  return `exam-finding-resp-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

export interface ExamRespChipGroupCardProps {
  group: RespExamChipGroupDef;
  subsectionLabel: string;
  entries: ExamFindingEntry[];
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleChip: (chip: string) => void;
  onNotesChange: (notesFindingId: string, notes: string) => void;
  onClear: () => void;
}

export function ExamRespChipGroupCard({
  group,
  subsectionLabel,
  entries,
  disabled = false,
  open,
  onOpenChange,
  onToggleChip,
  onNotesChange,
  onClear,
}: ExamRespChipGroupCardProps) {
  const cardId = respAuscultationChipGroupCardId(group.id);
  const notesMeta = resolveRespAuscultationChipGroupNotesMeta(group.id);
  const notesFindingId = notesMeta?.findingId ?? "";
  const notesEntry = notesFindingId
    ? findExamFindingEntry(entries, notesFindingId)
    : undefined;
  const notes = notesEntry?.attributes?.notes ?? "";

  const selectedChips = group.chips.filter((chip) =>
    Boolean(findExamFindingEntry(entries, chipLabelToFindingId(chip))),
  );
  const hasNotes = notes.trim().length > 0;
  const isRecorded = selectedChips.length > 0 || hasNotes;
  const detailPreview = [
    selectedChips.length > 0 ? selectedChips.join(" · ") : "",
    hasNotes ? notes.trim() : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cn(
        "scroll-mt-[calc(var(--collapsible-sticky-top,2.75rem)_+_var(--exam-card-sticky-top,2.75rem))] transition-colors",
        open
          ? "my-1 rounded-sm border border-border/70 bg-background px-1 shadow-sm"
          : isRecorded
            ? "bg-muted/10 hover:bg-muted/20"
            : "hover:bg-muted/15",
      )}
      {...{ [EXAM_RESP_FINDING_CARD_ATTR]: cardId }}
      data-testid={`resp-chip-group-card-${cardId}`}
      data-recorded={isRecorded ? "true" : "false"}
      data-open={open ? "true" : "false"}
    >
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left disabled:opacity-50"
          data-testid={`resp-chip-group-toggle-${cardId}`}
        >
          {isRecorded && !open ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
          ) : null}
          <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>{group.label}</span>
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
        {isRecorded ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            aria-label={`Clear ${group.label}`}
            data-testid={`resp-chip-group-clear-${cardId}`}
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
          aria-label={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
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
          <div
            className={CHART_SELECT_CHIP_GROUP_CLASS}
            role="group"
            aria-label={`Respiratory — ${subsectionLabel} — ${group.label}`}
            data-testid={`resp-chip-group-${cardId}`}
          >
            {group.chips.map((chip) => {
              const findingId = chipLabelToFindingId(chip);
              const isSelected = Boolean(findExamFindingEntry(entries, findingId));
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={chip}
                  data-testid={chipTestId(chip)}
                  onClick={() => onToggleChip(chip)}
                  className={chartSelectChipClass(isSelected)}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          {notesFindingId ? (
            <div>
              <label htmlFor={`resp-chip-group-notes-${cardId}`} className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                Notes
              </label>
              <input
                id={`resp-chip-group-notes-${cardId}`}
                type="text"
                value={notes}
                disabled={disabled}
                placeholder="Optional detail"
                maxLength={500}
                onChange={(event) => onNotesChange(notesFindingId, event.target.value)}
                className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                data-testid={`resp-chip-group-notes-${cardId}`}
              />
            </div>
          ) : null}
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenChange(false)}
              aria-label={`Collapse ${group.label}`}
              data-testid={`resp-chip-group-done-${cardId}`}
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

export function clearRespChipGroupEntries(
  entries: ExamFindingEntry[],
  group: RespExamChipGroupDef,
): ExamFindingEntry[] {
  const chipIds = new Set(group.chips.map((chip) => chipLabelToFindingId(chip)));
  const notesMeta = resolveRespAuscultationChipGroupNotesMeta(group.id);
  return entries.filter((entry) => {
    if (chipIds.has(entry.findingId)) return false;
    if (notesMeta && entry.findingId === notesMeta.findingId) return false;
    return true;
  });
}

export function patchRespChipGroupNotesEntry(
  entries: ExamFindingEntry[],
  notesFindingId: string,
  notes: string,
): ExamFindingEntry[] {
  const base = findExamFindingEntry(entries, notesFindingId) ?? createEmptyFindingEntry(notesFindingId);
  const nextEntry = patchFindingEntryAttributes(base, { notes });
  const hasNotes = notes.trim().length > 0;
  if (!hasNotes) {
    return entries.filter((entry) => entry.findingId !== notesFindingId);
  }
  const idx = entries.findIndex((entry) => entry.findingId === notesFindingId);
  if (idx === -1) return [...entries, nextEntry];
  return entries.map((entry, i) => (i === idx ? nextEntry : entry));
}
