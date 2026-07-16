"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  scrollExamAbdFindingCardIntoView,
  scrollExamSubsectionIntoView,
} from "@/lib/cockpit/exam-card-scroll";
import { ExamAbdFindingCard } from "@/components/cockpit/rx/inputs/ExamAbdFindingCard";
import {
  ExamSubsectionCollapsible,
  examSubsectionSummary,
  orderSubsectionsForModality,
  resolveTeleconsultSubsectionTag,
  useExamSubsectionOpenState,
} from "@/components/cockpit/rx/inputs/ExamSubsectionCollapsible";
import {
  clearAbdChipGroupEntries,
  ExamAbdChipGroupCard,
  patchAbdChipGroupNotesEntry,
} from "@/components/cockpit/rx/inputs/ExamAbdChipGroupCard";
import type {
  AbdExamChipGroupDef,
  AbdExamSubsectionDef,
} from "@/lib/cockpit/abd-exam-finding-schema";
import {
  abdChipGroupCardId,
  abdSubsectionHasCards,
  abdSubsectionScrollKey,
  ABD_EXAM_SUBSECTIONS,
  ABD_INSPECTION_NOTES_FINDING_ID,
  ABD_AUSCULTATION_NOTES_FINDING_ID,
  ABD_PALPATION_NOTES_FINDING_ID,
  ABD_PERCUSSION_NOTES_FINDING_ID,
  listAbdStructuredFindingsForSubsection,
  listAbdSubsectionChips,
  resolveAbdCardSubsectionScrollKey,
  resolveAbdChipGroupNotesMeta,
} from "@/lib/cockpit/abd-exam-finding-schema";
import {
  abdFindingEntryPreview,
  chipLabelToFindingId,
  createEmptyFindingEntry,
  findExamFindingEntry,
  patchFindingEntryAttributes,
  abdFindingEntryHasAttributes,
} from "@/lib/cockpit/exam-finding-utils";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_EXAM_ADDITIONAL_NOTES_LABEL,
  RX_EXAM_FIELD_LABEL_BLOCK_CLASS,
  RX_EXAM_SUBSECTION_HEADING_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  isTeleconsult,
  resolveExamSystem,
  resolveSubsectionRemoteFeasibility,
  teleconsultNormalLine,
} from "@/lib/cockpit/exam-schema";
import type { ExamFindingEntry, ExamSystemFinding } from "@/types/prescription";
import { cn } from "@/lib/utils";
import { ExamSystemStatusToolbar } from "@/components/cockpit/rx/inputs/ExamSystemStatusToolbar";
import { resolveExamCardStatus } from "@/components/cockpit/rx/inputs/ExamSystemCard";

function chipTestId(chip: string): string {
  return `exam-finding-abd-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

const ABD_SUBSECTION_NOTES_BY_SUBSECTION_ID: Record<string, string> = {
  inspection: ABD_INSPECTION_NOTES_FINDING_ID,
  auscultation: ABD_AUSCULTATION_NOTES_FINDING_ID,
  palpation: ABD_PALPATION_NOTES_FINDING_ID,
  percussion: ABD_PERCUSSION_NOTES_FINDING_ID,
};

/** All findingIds a subsection owns (chips, group chips/notes, cards, its notes row). */
function abdSubsectionOwnedFindingIds(subsection: AbdExamSubsectionDef): Set<string> {
  const ids = new Set<string>();
  for (const chip of listAbdSubsectionChips(subsection)) ids.add(chipLabelToFindingId(chip));
  for (const id of subsection.structuredFindingIds) ids.add(id);
  for (const group of subsection.chipGroups ?? []) {
    const notesMeta = resolveAbdChipGroupNotesMeta(group.id);
    if (notesMeta?.findingId) ids.add(notesMeta.findingId);
  }
  const notesId = ABD_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id];
  if (notesId) ids.add(notesId);
  return ids;
}

export interface ExamAbdSystemBodyProps {
  finding?: ExamSystemFinding;
  disabled?: boolean;
  onDone: () => void;
}

export function ExamAbdSystemBody({
  finding,
  disabled = false,
  onDone,
}: ExamAbdSystemBodyProps) {
  const { dispatch, state } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const isTele = isTeleconsult(state.consultationType);
  const normalLine = isTele
    ? teleconsultNormalLine("abd")
    : resolveExamSystem("abd").normalLine;
  const entries = finding?.findings ?? [];
  const systemNotes = finding?.notes ?? "";
  const showBody = status !== "normal";

  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  // Teleconsult (tc-02): Inspection foregrounded; Auscultation / Palpation /
  // Percussion grey out. In-clinic order + open-state are byte-identical.
  const orderedSubsections = orderSubsectionsForModality(ABD_EXAM_SUBSECTIONS, isTele);

  const {
    isOpen: isSubsectionOpen,
    toggle: toggleSubsection,
    expandAll: expandAllSubsections,
    collapseAll: collapseAllSubsections,
  } = useExamSubsectionOpenState({
    systemId: "abd",
    subsections: ABD_EXAM_SUBSECTIONS,
    initialEntries: finding?.findings ?? [],
    ownedFindingIds: abdSubsectionOwnedFindingIds,
    scrollKeyFor: abdSubsectionScrollKey,
    fallbackOpenIds: ABD_EXAM_SUBSECTIONS[0] ? [ABD_EXAM_SUBSECTIONS[0].id] : [],
    excludeFromAutoOpen: isTele
      ? (subsection) => resolveSubsectionRemoteFeasibility(subsection) === "in_person_only"
      : undefined,
  });

  const setFindingOpen = useCallback((findingId: string, open: boolean) => {
    setOpenFindingId(open ? findingId : null);
    if (open) {
      scrollExamAbdFindingCardIntoView(findingId);
      return;
    }
    const subsectionScrollKey = resolveAbdCardSubsectionScrollKey(findingId);
    if (subsectionScrollKey) {
      scrollExamSubsectionIntoView(subsectionScrollKey);
    }
  }, []);

  function commit(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "abd" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "abd",
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "abd" });
      setOpenFindingId(null);
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "abd",
      status: "normal",
      findings: [],
      notes: null,
    });
    setOpenFindingId(null);
  }

  function upsertEntry(nextEntry: ExamFindingEntry) {
    if (!abdFindingEntryHasAttributes(nextEntry)) {
      commit(
        entries.filter((e) => e.findingId !== nextEntry.findingId),
        finding?.notes ?? null,
      );
      return;
    }
    const idx = entries.findIndex((e) => e.findingId === nextEntry.findingId);
    const next =
      idx === -1
        ? [...entries, nextEntry]
        : entries.map((e, i) => (i === idx ? nextEntry : e));
    commit(next, finding?.notes ?? null);
  }

  function removeEntry(findingId: string) {
    const next = entries.filter((e) => e.findingId !== findingId);
    if (openFindingId === findingId) setOpenFindingId(null);
    commit(next, finding?.notes ?? null);
  }

  function toggleChip(chip: string) {
    if (disabled) return;
    const findingId = chipLabelToFindingId(chip);
    const existing = findExamFindingEntry(entries, findingId);
    const next = existing
      ? entries.filter((e) => e.findingId !== findingId)
      : [...entries, { findingId, attributes: {} }];
    commit(next, finding?.notes ?? null);
  }

  function setSystemNotes(notes: string) {
    if (disabled) return;
    const trimmed = notes.trim();
    if (entries.length === 0 && !trimmed) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "abd" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "abd",
      status: "abnormal",
      findings: entries,
      notes: trimmed || null,
    });
  }

  function setSubsectionNotes(notesFindingId: string, notes: string) {
    if (disabled) return;
    const base =
      findExamFindingEntry(entries, notesFindingId) ?? createEmptyFindingEntry(notesFindingId);
    upsertEntry(patchFindingEntryAttributes(base, { notes }));
  }

  function subsectionNotesValue(subsectionId: string): string {
    const notesFindingId = ABD_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsectionId];
    if (!notesFindingId) return "";
    return findExamFindingEntry(entries, notesFindingId)?.attributes?.notes ?? "";
  }

  function setChipGroupNotes(notesFindingId: string, notes: string) {
    if (disabled) return;
    const next = patchAbdChipGroupNotesEntry(entries, notesFindingId, notes);
    commit(next, finding?.notes ?? null);
  }

  function clearChipGroup(group: AbdExamChipGroupDef) {
    if (disabled) return;
    const next = clearAbdChipGroupEntries(entries, group);
    const cardId = abdChipGroupCardId(group.id);
    if (openFindingId === cardId) setOpenFindingId(null);
    commit(next, finding?.notes ?? null);
  }

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "abd" });
    setOpenFindingId(null);
  }

  return (
    <div className="space-y-2.5" data-testid="exam-abd-system-body">
      <ExamSystemStatusToolbar
        systemId="abd"
        status={status}
        normalLine={normalLine}
        disabled={disabled}
        onMarkNormal={markNormal}
        onClear={clearSection}
        onExpandAllSubsections={showBody ? expandAllSubsections : undefined}
        onCollapseAllSubsections={showBody ? collapseAllSubsections : undefined}
      />

      {showBody ? (
        <div className="space-y-3">
          {orderedSubsections.map((subsection) => {
            const structuredDefs = listAbdStructuredFindingsForSubsection(subsection.id);
            const subsectionChips = listAbdSubsectionChips(subsection);
            const hasChips = subsectionChips.length > 0 && !subsection.chipGroups?.length;
            const chipGroups = subsection.chipGroups ?? [];
            const hasCards = abdSubsectionHasCards(subsection);
            const { hasData, preview } = examSubsectionSummary(
              abdSubsectionOwnedFindingIds(subsection),
              entries,
              abdFindingEntryPreview,
            );
            const { deemphasised, tag } = resolveTeleconsultSubsectionTag(
              isTele,
              subsection,
              hasData,
            );

            function renderChipButton(chip: string) {
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
                  onClick={() => toggleChip(chip)}
                  className={chartSelectChipClass(isSelected)}
                >
                  {chip}
                </button>
              );
            }

            return (
              <ExamSubsectionCollapsible
                key={subsection.id}
                systemId="abd"
                subsectionId={subsection.id}
                label={subsection.label}
                scrollKey={abdSubsectionScrollKey(subsection.id)}
                open={isSubsectionOpen(subsection.id)}
                onToggle={() => toggleSubsection(subsection.id)}
                hasData={hasData}
                preview={preview}
                disabled={disabled}
                deemphasised={deemphasised}
                tag={tag}
              >
                {hasChips ? (
                  <div className="mt-2" data-testid={`exam-findings-abd-${subsection.id}`}>
                    <div
                      className={CHART_SELECT_CHIP_GROUP_CLASS}
                      role="group"
                      aria-label={`Abdomen — ${subsection.label}`}
                    >
                      {subsectionChips.map(renderChipButton)}
                    </div>
                  </div>
                ) : null}

                {hasCards ? (
                  <div
                    className="mt-2 space-y-0.5"
                    data-testid={`exam-findings-abd-${subsection.id}-cards`}
                  >
                    {chipGroups.map((group) => (
                      <ExamAbdChipGroupCard
                        key={group.id}
                        group={group}
                        subsectionLabel={subsection.label}
                        entries={entries}
                        disabled={disabled}
                        open={openFindingId === abdChipGroupCardId(group.id)}
                        onOpenChange={(open) =>
                          setFindingOpen(abdChipGroupCardId(group.id), open)
                        }
                        onToggleChip={toggleChip}
                        onNotesChange={setChipGroupNotes}
                        onClear={() => clearChipGroup(group)}
                      />
                    ))}
                    {structuredDefs.map((def) => (
                      <ExamAbdFindingCard
                        key={def.findingId}
                        definition={def}
                        entry={findExamFindingEntry(entries, def.findingId)}
                        disabled={disabled}
                        open={openFindingId === def.findingId}
                        onOpenChange={(open) => setFindingOpen(def.findingId, open)}
                        onChange={upsertEntry}
                        onClear={() => removeEntry(def.findingId)}
                      />
                    ))}
                  </div>
                ) : null}

                {ABD_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id] ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label
                      htmlFor={`abd-${subsection.id}-notes`}
                      className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
                    >
                      Notes
                    </label>
                    <input
                      id={`abd-${subsection.id}-notes`}
                      type="text"
                      value={subsectionNotesValue(subsection.id)}
                      onChange={(event) =>
                        setSubsectionNotes(
                          ABD_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id]!,
                          event.target.value,
                        )
                      }
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid={`abd-${subsection.id}-notes`}
                    />
                  </div>
                ) : null}
              </ExamSubsectionCollapsible>
            );
          })}

          <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
            <label htmlFor="exam-notes-abd" className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
              {RX_EXAM_ADDITIONAL_NOTES_LABEL}
            </label>
            <input
              id="exam-notes-abd"
              type="text"
              value={systemNotes}
              onChange={(event) => setSystemNotes(event.target.value)}
              disabled={disabled}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid="exam-notes-abd"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          aria-label="Collapse Abdomen examination"
          data-testid="exam-done-abd"
          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
