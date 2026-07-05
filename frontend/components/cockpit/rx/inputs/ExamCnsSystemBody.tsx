"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  reAnchorExamCnsFindingCardOnClose,
  scrollExamCnsFindingCardIntoView,
  scrollExamSubsectionIntoView,
} from "@/lib/cockpit/exam-card-scroll";
import { ExamCnsFindingCard } from "@/components/cockpit/rx/inputs/ExamCnsFindingCard";
import {
  ExamSubsectionCollapsible,
  examSubsectionSummary,
  orderSubsectionsForModality,
  resolveTeleconsultSubsectionTag,
  useExamSubsectionOpenState,
} from "@/components/cockpit/rx/inputs/ExamSubsectionCollapsible";
import { ExamCnsGcsField } from "@/components/cockpit/rx/inputs/ExamCnsGcsField";
import { ExamCnsPupilsField } from "@/components/cockpit/rx/inputs/ExamCnsPupilsField";
import {
  cnsSubsectionHasCards,
  cnsSubsectionNotesFindingId,
  cnsSubsectionScrollKey,
  CNS_EXAM_SUBSECTIONS,
  listCnsStructuredFindingsForSubsection,
  listCnsSubsectionChips,
  resolveCnsCardSubsectionScrollKey,
} from "@/lib/cockpit/cns-exam-finding-schema";
import {
  resolveExamChipTeleconsultFlags,
  resolveExamStructuredTeleconsultHint,
  resolveExamSubsectionTeleconsultNote,
} from "@/lib/cockpit/exam-teleconsult-item-hints";
import {
  chipLabelToFindingId,
  cnsFindingEntryHasAttributes,
  cnsFindingEntryPreview,
  createEmptyFindingEntry,
  findExamFindingEntry,
  patchFindingEntryAttributes,
} from "@/lib/cockpit/exam-finding-utils";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import { ExamTeleconsultFeasibilityChip } from "@/components/cockpit/rx/inputs/ExamTeleconsultFeasibilityChip";
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
import type { CnsExamSubsectionDef } from "@/lib/cockpit/cns-exam-finding-schema";
import { ExamSystemStatusToolbar } from "@/components/cockpit/rx/inputs/ExamSystemStatusToolbar";
import { resolveExamCardStatus } from "@/components/cockpit/rx/inputs/ExamSystemCard";

function chipTestId(chip: string): string {
  return `exam-finding-cns-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

/** All findingIds a subsection owns (chips + structured cards + its notes row). */
function cnsSubsectionOwnedFindingIds(subsection: CnsExamSubsectionDef): Set<string> {
  const ids = new Set<string>();
  for (const chip of subsection.chips) ids.add(chipLabelToFindingId(chip));
  for (const id of subsection.structuredFindingIds) ids.add(id);
  const notesId = cnsSubsectionNotesFindingId(subsection.id);
  if (notesId) ids.add(notesId);
  return ids;
}

export interface ExamCnsSystemBodyProps {
  finding?: ExamSystemFinding;
  disabled?: boolean;
  onDone: () => void;
}

export function ExamCnsSystemBody({
  finding,
  disabled = false,
  onDone,
}: ExamCnsSystemBodyProps) {
  const { dispatch, state } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const isTele = isTeleconsult(state.consultationType);
  const normalLine = isTele
    ? teleconsultNormalLine("cns")
    : resolveExamSystem("cns").normalLine;
  const entries = finding?.findings ?? [];
  const systemNotes = finding?.notes ?? "";
  const showBody = status !== "normal";

  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  // Teleconsult (tc-02): most CNS is observable over video (mental status,
  // speech, cranial, gross motor, coordination, gait); the contact-dependent
  // subsections (reflexes, sensory, meningeal) grey out. In-clinic unchanged.
  const orderedSubsections = orderSubsectionsForModality(CNS_EXAM_SUBSECTIONS, isTele);

  // Subsections are individually collapsible (multi-open). On mount, expand any
  // subsection that already has recorded findings; otherwise open Mental status.
  const { isOpen: isSubsectionOpen, toggle: toggleSubsection } = useExamSubsectionOpenState({
    subsections: CNS_EXAM_SUBSECTIONS,
    initialEntries: finding?.findings ?? [],
    ownedFindingIds: cnsSubsectionOwnedFindingIds,
    scrollKeyFor: cnsSubsectionScrollKey,
    fallbackOpenIds: ["mental"],
    excludeFromAutoOpen: isTele
      ? (subsection) => resolveSubsectionRemoteFeasibility(subsection) === "in_person_only"
      : undefined,
  });

  const setFindingOpen = useCallback((findingId: string, open: boolean) => {
    setOpenFindingId(open ? findingId : null);
    if (open) {
      scrollExamCnsFindingCardIntoView(findingId);
      return;
    }
    const subsectionScrollKey = resolveCnsCardSubsectionScrollKey(findingId);
    if (subsectionScrollKey) {
      scrollExamSubsectionIntoView(subsectionScrollKey);
    } else {
      reAnchorExamCnsFindingCardOnClose(findingId);
    }
  }, []);

  function commit(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cns" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cns",
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cns" });
      setOpenFindingId(null);
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cns",
      status: "normal",
      findings: [],
      notes: null,
    });
    setOpenFindingId(null);
  }

  function upsertEntry(nextEntry: ExamFindingEntry) {
    if (!cnsFindingEntryHasAttributes(nextEntry)) {
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
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cns" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cns",
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
    const notesFindingId = cnsSubsectionNotesFindingId(subsectionId);
    if (!notesFindingId) return "";
    return findExamFindingEntry(entries, notesFindingId)?.attributes?.notes ?? "";
  }

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cns" });
    setOpenFindingId(null);
  }

  return (
    <div className="space-y-2.5" data-testid="exam-cns-system-body">
      <ExamSystemStatusToolbar
        systemId="cns"
        status={status}
        normalLine={normalLine}
        disabled={disabled}
        onMarkNormal={markNormal}
        onClear={clearSection}
      />

      {showBody ? (
        <div className="space-y-3">
          {orderedSubsections.map((subsection) => {
            const structuredDefs = listCnsStructuredFindingsForSubsection(subsection.id);
            const subsectionChips = listCnsSubsectionChips(subsection);
            const hasChips = subsectionChips.length > 0;
            const hasCards = cnsSubsectionHasCards(subsection);
            const notesFindingId = cnsSubsectionNotesFindingId(subsection.id);
            const { hasData, preview } = examSubsectionSummary(
              cnsSubsectionOwnedFindingIds(subsection),
              entries,
              cnsFindingEntryPreview,
            );
            const { deemphasised, tag } = resolveTeleconsultSubsectionTag(
              isTele,
              subsection,
              hasData,
            );

            const teleconsultNote = isTele
              ? resolveExamSubsectionTeleconsultNote("cns", subsection.id)
              : undefined;

            function renderChipButton(chip: string) {
              const findingId = chipLabelToFindingId(chip);
              const isSelected = Boolean(findExamFindingEntry(entries, findingId));
              const flags = isTele
                ? resolveExamChipTeleconsultFlags("cns", subsection.id, chip)
                : undefined;

              if (flags) {
                return (
                  <ExamTeleconsultFeasibilityChip
                    key={chip}
                    label={chip}
                    selected={isSelected}
                    disabled={disabled}
                    testId={chipTestId(chip)}
                    flagged
                    hint={!isSelected ? flags.hint : undefined}
                    inPersonOnly={Boolean(flags.inPersonOnly)}
                    onClick={() => toggleChip(chip)}
                  />
                );
              }

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
                systemId="cns"
                subsectionId={subsection.id}
                label={subsection.label}
                scrollKey={cnsSubsectionScrollKey(subsection.id)}
                open={isSubsectionOpen(subsection.id)}
                onToggle={() => toggleSubsection(subsection.id)}
                hasData={hasData}
                preview={preview}
                disabled={disabled}
                deemphasised={deemphasised}
                tag={tag}
              >
                  {subsection.id === "mental" ? <ExamCnsGcsField disabled={disabled} /> : null}
                  {subsection.id === "cranial" ? (
                    <ExamCnsPupilsField disabled={disabled} />
                  ) : null}

                  {teleconsultNote ? (
                    <p
                      className="mt-1 text-[10px] leading-snug text-muted-foreground"
                      data-testid={`cns-${subsection.id}-teleconsult-note`}
                    >
                      {teleconsultNote}
                    </p>
                  ) : null}

                  {hasChips ? (
                    <div className="mt-2" data-testid={`exam-findings-cns-${subsection.id}`}>
                      <div
                        className={CHART_SELECT_CHIP_GROUP_CLASS}
                        role="group"
                        aria-label={`CNS / Neuro — ${subsection.label}`}
                      >
                        {subsectionChips.map(renderChipButton)}
                      </div>
                    </div>
                  ) : null}

                  {hasCards ? (
                    <div
                      className="mt-2 divide-y divide-border/45"
                      data-testid={`exam-findings-cns-${subsection.id}-cards`}
                    >
                      {structuredDefs.map((def) => (
                        <ExamCnsFindingCard
                          key={def.findingId}
                          definition={def}
                          entry={findExamFindingEntry(entries, def.findingId)}
                          disabled={disabled}
                          open={openFindingId === def.findingId}
                          onOpenChange={(open) => setFindingOpen(def.findingId, open)}
                          onChange={upsertEntry}
                          onClear={() => removeEntry(def.findingId)}
                          teleconsultFeasibilityHint={
                            isTele
                              ? resolveExamStructuredTeleconsultHint("cns", def.findingId)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : null}

                  {notesFindingId ? (
                    <div className="mt-2 border-t border-border/45 pt-2">
                      <label
                        htmlFor={`cns-${subsection.id}-notes`}
                        className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
                      >
                        Notes
                      </label>
                      <input
                        id={`cns-${subsection.id}-notes`}
                        type="text"
                        value={subsectionNotesValue(subsection.id)}
                        onChange={(event) =>
                          setSubsectionNotes(notesFindingId, event.target.value)
                        }
                        disabled={disabled}
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                        placeholder="Optional detail"
                        maxLength={500}
                        data-testid={`cns-${subsection.id}-notes`}
                      />
                    </div>
                  ) : null}
              </ExamSubsectionCollapsible>
            );
          })}

          <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
            <label htmlFor="exam-notes-cns" className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
              {RX_EXAM_ADDITIONAL_NOTES_LABEL}
            </label>
            <input
              id="exam-notes-cns"
              type="text"
              value={systemNotes}
              onChange={(event) => setSystemNotes(event.target.value)}
              disabled={disabled}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid="exam-notes-cns"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          aria-label="Collapse CNS / Neuro examination"
          data-testid="exam-done-cns"
          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
