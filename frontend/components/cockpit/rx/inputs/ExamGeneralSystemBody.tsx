"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  scrollExamGeneralFindingCardIntoView,
  scrollExamSubsectionIntoView,
} from "@/lib/cockpit/exam-card-scroll";
import { ExamGeneralFindingCard } from "@/components/cockpit/rx/inputs/ExamGeneralFindingCard";
import {
  ExamSubsectionCollapsible,
  examSubsectionSummary,
  orderSubsectionsForModality,
  resolveTeleconsultSubsectionTag,
  useExamSubsectionOpenState,
} from "@/components/cockpit/rx/inputs/ExamSubsectionCollapsible";
import {
  GENERAL_EXAM_SUBSECTIONS,
  generalSubsectionNotesFindingId,
  listGeneralExamFindingsForSubsection,
  resolveGeneralExamFinding,
} from "@/lib/cockpit/general-exam-finding-schema";
import {
  createEmptyFindingEntry,
  findingEntryHasAttributes,
  findExamFindingEntry,
  generalFindingEntryPreview,
  patchFindingEntryAttributes,
} from "@/lib/cockpit/exam-finding-utils";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  RX_EXAM_ADDITIONAL_NOTES_LABEL,
  RX_EXAM_FIELD_LABEL_BLOCK_CLASS,
  RX_EXAM_SUBSECTION_HEADING_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  isTeleconsult,
  resolveExamSystem,
  teleconsultNormalLine,
} from "@/lib/cockpit/exam-schema";
import {
  resolveExamStructuredTeleconsultHint,
  resolveExamSubsectionTeleconsultNote,
} from "@/lib/cockpit/exam-teleconsult-item-hints";
import type { ExamFindingEntry, ExamSystemFinding } from "@/types/prescription";
import { cn } from "@/lib/utils";
import { ExamSystemStatusToolbar } from "@/components/cockpit/rx/inputs/ExamSystemStatusToolbar";
import { resolveExamCardStatus } from "@/components/cockpit/rx/inputs/ExamSystemCard";

/** Finding-card ids grouped under a General subsection (cards + subsection notes row). */
function generalSubsectionOwnedFindingIds(subsection: { id: string }): Set<string> {
  const ids = new Set(
    listGeneralExamFindingsForSubsection(subsection.id).map((d) => d.findingId),
  );
  const notesId = generalSubsectionNotesFindingId(subsection.id);
  if (notesId) ids.add(notesId);
  return ids;
}

function generalSubsectionScrollKey(subsectionId: string): string {
  return `general-${subsectionId}`;
}

export interface ExamGeneralSystemBodyProps {
  finding?: ExamSystemFinding;
  disabled?: boolean;
  onDone: () => void;
}

export function ExamGeneralSystemBody({
  finding,
  disabled = false,
  onDone,
}: ExamGeneralSystemBodyProps) {
  const { dispatch, state } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const isTele = isTeleconsult(state.consultationType);
  const normalLine = isTele
    ? teleconsultNormalLine("general")
    : resolveExamSystem("general").normalLine;
  const entries = finding?.findings ?? [];
  const systemNotes = finding?.notes ?? "";
  const showFindingCards = status !== "normal";

  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  // Teleconsult (tc-02): General is entirely inspection/observable, so the preset
  // is inert here — order + tags are unchanged from in-clinic.
  const orderedSubsections = orderSubsectionsForModality(GENERAL_EXAM_SUBSECTIONS, isTele);

  // General groups finding cards by subsection. Accordion: one subsection open
  // at a time (manual toggle); expand-all opens every group for survey mode.
  const {
    isOpen: isSubsectionOpen,
    toggle: toggleSubsection,
    expandAll: expandAllSubsections,
    collapseAll: collapseAllSubsections,
  } = useExamSubsectionOpenState({
    systemId: "general",
    subsections: GENERAL_EXAM_SUBSECTIONS,
    initialEntries: finding?.findings ?? [],
    ownedFindingIds: generalSubsectionOwnedFindingIds,
    scrollKeyFor: generalSubsectionScrollKey,
    fallbackOpenIds: GENERAL_EXAM_SUBSECTIONS[0] ? [GENERAL_EXAM_SUBSECTIONS[0].id] : [],
  });

  // Open → glide the finding card under both sticky headers concurrently with the
  // expand; close → keep it put unless it scrolled above the sticky line.
  const setFindingOpen = useCallback((findingId: string, open: boolean) => {
    setOpenFindingId(open ? findingId : null);
    if (open) {
      scrollExamGeneralFindingCardIntoView(findingId);
      return;
    }
    const def = resolveGeneralExamFinding(findingId);
    if (def) {
      scrollExamSubsectionIntoView(generalSubsectionScrollKey(def.subsectionId));
    }
  }, []);

  function commit(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "general" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "general",
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "general" });
      setOpenFindingId(null);
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "general",
      status: "normal",
      findings: [],
      notes: null,
    });
    setOpenFindingId(null);
  }

  function upsertEntry(nextEntry: ExamFindingEntry) {
    // Emptying the last attribute clears the row from storage but keeps the
    // card expanded so the doctor can keep editing (only the × collapses).
    if (!findingEntryHasAttributes(nextEntry)) {
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

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "general" });
    setOpenFindingId(null);
  }

  function setSystemNotes(notes: string) {
    if (disabled) return;
    const trimmed = notes.trim();
    if (entries.length === 0 && !trimmed) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "general" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "general",
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
    const notesFindingId = generalSubsectionNotesFindingId(subsectionId);
    if (!notesFindingId) return "";
    return findExamFindingEntry(entries, notesFindingId)?.attributes?.notes ?? "";
  }

  return (
    <div className="space-y-2.5" data-testid="exam-general-system-body">
      <ExamSystemStatusToolbar
        systemId="general"
        status={status}
        normalLine={normalLine}
        disabled={disabled}
        onMarkNormal={markNormal}
        onClear={clearSection}
        onExpandAllSubsections={showFindingCards ? expandAllSubsections : undefined}
        onCollapseAllSubsections={showFindingCards ? collapseAllSubsections : undefined}
      />

      {showFindingCards ? (
        <div className="space-y-3">
          {orderedSubsections.map((subsection) => {
            const defs = listGeneralExamFindingsForSubsection(subsection.id);
            const { hasData, preview } = examSubsectionSummary(
              generalSubsectionOwnedFindingIds(subsection),
              entries,
              generalFindingEntryPreview,
            );
            const { deemphasised, tag } = resolveTeleconsultSubsectionTag(
              isTele,
              subsection,
              hasData,
            );
            const teleconsultNote = isTele
              ? resolveExamSubsectionTeleconsultNote("general", subsection.id)
              : undefined;
            const notesFindingId = generalSubsectionNotesFindingId(subsection.id);

            return (
              <ExamSubsectionCollapsible
                key={subsection.id}
                systemId="general"
                subsectionId={subsection.id}
                label={subsection.label}
                scrollKey={generalSubsectionScrollKey(subsection.id)}
                open={isSubsectionOpen(subsection.id)}
                onToggle={() => toggleSubsection(subsection.id)}
                hasData={hasData}
                preview={preview}
                disabled={disabled}
                deemphasised={deemphasised}
                tag={tag}
              >
                {teleconsultNote ? (
                  <p
                    className="mt-1 text-[10px] leading-snug text-muted-foreground"
                    data-testid={`general-${subsection.id}-teleconsult-note`}
                  >
                    {teleconsultNote}
                  </p>
                ) : null}
                <div className="mt-2 space-y-0.5">
                  {defs.map((def) => (
                    <ExamGeneralFindingCard
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
                          ? resolveExamStructuredTeleconsultHint("general", def.findingId)
                          : undefined
                      }
                    />
                  ))}
                </div>
                {notesFindingId ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label
                      htmlFor={`general-${subsection.id}-notes`}
                      className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
                    >
                      Notes
                    </label>
                    <input
                      id={`general-${subsection.id}-notes`}
                      type="text"
                      value={subsectionNotesValue(subsection.id)}
                      onChange={(event) =>
                        setSubsectionNotes(notesFindingId, event.target.value)
                      }
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid={`general-${subsection.id}-notes`}
                    />
                  </div>
                ) : null}
              </ExamSubsectionCollapsible>
            );
          })}

          <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
            <label htmlFor="exam-notes-general" className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
              {RX_EXAM_ADDITIONAL_NOTES_LABEL}
            </label>
            <input
              id="exam-notes-general"
              type="text"
              value={systemNotes}
              onChange={(event) => setSystemNotes(event.target.value)}
              disabled={disabled}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid="exam-notes-general"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          aria-label="Collapse General examination"
          data-testid="exam-done-general"
          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
