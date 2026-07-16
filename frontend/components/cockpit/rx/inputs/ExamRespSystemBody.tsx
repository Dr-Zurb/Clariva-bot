"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  scrollExamRespFindingCardIntoView,
  scrollExamSubsectionIntoView,
} from "@/lib/cockpit/exam-card-scroll";
import { ExamRespFindingCard } from "@/components/cockpit/rx/inputs/ExamRespFindingCard";
import {
  ExamSubsectionCollapsible,
  examSubsectionSummary,
  orderSubsectionsForModality,
  resolveTeleconsultSubsectionTag,
  useExamSubsectionOpenState,
} from "@/components/cockpit/rx/inputs/ExamSubsectionCollapsible";
import {
  clearRespChipGroupEntries,
  ExamRespChipGroupCard,
  patchRespChipGroupNotesEntry,
} from "@/components/cockpit/rx/inputs/ExamRespChipGroupCard";
import { CategoricalVitalSelect } from "@/components/cockpit/rx/inputs/CategoricalVitalSelect";
import type {
  RespExamChipGroupDef,
  RespExamSubsectionDef,
} from "@/lib/cockpit/resp-exam-finding-schema";
import {
  respAuscultationChipGroupCardId,
  respSubsectionScrollKey,
  RESP_AUSCULTATION_SUBSECTION_SCROLL_KEY,
  RESP_EXAM_SUBSECTIONS,
  RESP_INSPECTION_NOTES_FINDING_ID,
  RESP_PALPATION_NOTES_FINDING_ID,
  RESP_PERCUSSION_NOTES_FINDING_ID,
  RESP_AUSCULTATION_NOTES_FINDING_ID,
  isRespAuscultationExpandableCardId,
  listRespStructuredFindingsForSubsection,
  listRespSubsectionChips,
  resolveRespAuscultationChipGroupNotesMeta,
  resolveRespExamFinding,
} from "@/lib/cockpit/resp-exam-finding-schema";
import {
  chipLabelToFindingId,
  createEmptyFindingEntry,
  findExamFindingEntry,
  patchFindingEntryAttributes,
  respFindingEntryHasAttributes,
  respFindingEntryPreview,
} from "@/lib/cockpit/exam-finding-utils";
import { VITAL_NOTE_MAX_LEN } from "@/lib/cockpit/vital-notes";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_EXAM_ADDITIONAL_NOTES_LABEL,
  RX_EXAM_FIELD_LABEL_BLOCK_CLASS,
  RX_EXAM_FIELD_LABEL_CLASS,
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
  return `exam-finding-resp-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

const RESP_SUBSECTION_NOTES_BY_SUBSECTION_ID: Record<string, string> = {
  inspection: RESP_INSPECTION_NOTES_FINDING_ID,
  palpation: RESP_PALPATION_NOTES_FINDING_ID,
  percussion: RESP_PERCUSSION_NOTES_FINDING_ID,
  auscultation: RESP_AUSCULTATION_NOTES_FINDING_ID,
};

/** All findingIds a subsection owns (chips, group chips/notes, cards, its notes row). */
function respSubsectionOwnedFindingIds(subsection: RespExamSubsectionDef): Set<string> {
  const ids = new Set<string>();
  for (const chip of listRespSubsectionChips(subsection)) ids.add(chipLabelToFindingId(chip));
  for (const def of listRespStructuredFindingsForSubsection(subsection.id)) ids.add(def.findingId);
  for (const group of subsection.chipGroups ?? []) {
    const notesMeta = resolveRespAuscultationChipGroupNotesMeta(group.id);
    if (notesMeta?.findingId) ids.add(notesMeta.findingId);
  }
  const notesId = RESP_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id];
  if (notesId) ids.add(notesId);
  return ids;
}

export interface ExamRespSystemBodyProps {
  finding?: ExamSystemFinding;
  disabled?: boolean;
  onDone: () => void;
}

export function ExamRespSystemBody({
  finding,
  disabled = false,
  onDone,
}: ExamRespSystemBodyProps) {
  const { dispatch, state, setField } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const isTele = isTeleconsult(state.consultationType);
  const normalLine = isTele
    ? teleconsultNormalLine("resp")
    : resolveExamSystem("resp").normalLine;
  const respRate = state.fields.vitalsRr;
  const spo2 = state.fields.vitalsSpo2;
  const respRateNote = state.fields.vitalsNotes.vitalsRr ?? "";
  const entries = finding?.findings ?? [];
  const systemNotes = finding?.notes ?? "";
  const showBody = status !== "normal";

  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  // Oxygenation lives in the canonical vitals fields (not exam entries), so detect
  // its content and preview separately from the entry-based summary.
  const oxygenationHasVitals = respRate != null || spo2 != null || respRateNote.trim() !== "";
  const oxygenationPreview = [
    respRate != null ? `RR ${respRate}` : null,
    spo2 != null ? `SpO₂ ${spo2}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Teleconsult (tc-02): foreground assessable subsections; grey/collapse the
  // in-person-only ones. In-clinic order + open-state are byte-identical.
  const orderedSubsections = orderSubsectionsForModality(RESP_EXAM_SUBSECTIONS, isTele);

  const {
    isOpen: isSubsectionOpen,
    toggle: toggleSubsection,
    expandAll: expandAllSubsections,
    collapseAll: collapseAllSubsections,
  } = useExamSubsectionOpenState({
    systemId: "resp",
    subsections: RESP_EXAM_SUBSECTIONS,
    initialEntries: finding?.findings ?? [],
    ownedFindingIds: respSubsectionOwnedFindingIds,
    scrollKeyFor: respSubsectionScrollKey,
    fallbackOpenIds: RESP_EXAM_SUBSECTIONS[0] ? [RESP_EXAM_SUBSECTIONS[0].id] : [],
    initialExtraOpenIds: oxygenationHasVitals ? ["oxygenation"] : [],
    excludeFromAutoOpen: isTele
      ? (subsection) => resolveSubsectionRemoteFeasibility(subsection) === "in_person_only"
      : undefined,
  });

  const setFindingOpen = useCallback((findingId: string, open: boolean) => {
    setOpenFindingId(open ? findingId : null);
    if (open) {
      scrollExamRespFindingCardIntoView(findingId);
      return;
    }
    if (isRespAuscultationExpandableCardId(findingId)) {
      scrollExamSubsectionIntoView(RESP_AUSCULTATION_SUBSECTION_SCROLL_KEY);
      return;
    }
    const def = resolveRespExamFinding(findingId);
    if (def) {
      scrollExamSubsectionIntoView(respSubsectionScrollKey(def.subsectionId));
    }
  }, []);

  function commit(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "resp" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "resp",
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "resp" });
      setOpenFindingId(null);
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "resp",
      status: "normal",
      findings: [],
      notes: null,
    });
    setOpenFindingId(null);
  }

  function upsertEntry(nextEntry: ExamFindingEntry) {
    if (!respFindingEntryHasAttributes(nextEntry)) {
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
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "resp" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "resp",
      status: "abnormal",
      findings: entries,
      notes: trimmed || null,
    });
  }

  function setSubsectionNotes(notesFindingId: string, notes: string) {
    if (disabled) return;
    const base = findExamFindingEntry(entries, notesFindingId) ?? createEmptyFindingEntry(notesFindingId);
    upsertEntry(patchFindingEntryAttributes(base, { notes }));
  }

  function subsectionNotesValue(subsectionId: string): string {
    const notesFindingId = RESP_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsectionId];
    if (!notesFindingId) return "";
    return findExamFindingEntry(entries, notesFindingId)?.attributes?.notes ?? "";
  }

  function setChipGroupNotes(notesFindingId: string, notes: string) {
    if (disabled) return;
    const next = patchRespChipGroupNotesEntry(entries, notesFindingId, notes);
    commit(next, finding?.notes ?? null);
  }

  function clearChipGroup(group: RespExamChipGroupDef) {
    if (disabled) return;
    const next = clearRespChipGroupEntries(entries, group);
    const cardId = respAuscultationChipGroupCardId(group.id);
    if (openFindingId === cardId) setOpenFindingId(null);
    commit(next, finding?.notes ?? null);
  }

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "resp" });
    setOpenFindingId(null);
  }

  function setRespRate(raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField("vitalsRr", null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField("vitalsRr", next);
  }

  function setSpo2(raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField("vitalsSpo2", null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField("vitalsSpo2", next);
  }

  function setRespRateNote(note: string) {
    if (disabled) return;
    setField("vitalsNotes", {
      ...state.fields.vitalsNotes,
      vitalsRr: note.length > 0 ? note : null,
    });
  }

  return (
    <div className="space-y-2.5" data-testid="exam-resp-system-body">
      <ExamSystemStatusToolbar
        systemId="resp"
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
            const structuredDefs = listRespStructuredFindingsForSubsection(subsection.id);
            const subsectionChips = listRespSubsectionChips(subsection);
            const hasChips = subsectionChips.length > 0 && !subsection.chipGroups?.length;
            const chipGroups = subsection.chipGroups ?? [];
            const isAuscultation = subsection.id === "auscultation";
            const { hasData, preview } =
              subsection.id === "oxygenation"
                ? { hasData: oxygenationHasVitals, preview: oxygenationPreview }
                : examSubsectionSummary(
                    respSubsectionOwnedFindingIds(subsection),
                    entries,
                    respFindingEntryPreview,
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
                systemId="resp"
                subsectionId={subsection.id}
                label={subsection.label}
                scrollKey={respSubsectionScrollKey(subsection.id)}
                open={isSubsectionOpen(subsection.id)}
                onToggle={() => toggleSubsection(subsection.id)}
                hasData={hasData}
                preview={preview}
                disabled={disabled}
                deemphasised={deemphasised}
                tag={tag}
              >
                {subsection.id === "oxygenation" ? (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
                    data-testid="resp-oxygenation-vitals-fields"
                  >
                    <div className="flex shrink-0 items-center gap-1">
                      <label htmlFor="resp-rr" className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
                        RR
                      </label>
                      <input
                        id="resp-rr"
                        type="number"
                        inputMode="numeric"
                        min={4}
                        max={80}
                        value={respRate ?? ""}
                        onChange={(event) => setRespRate(event.target.value)}
                        disabled={disabled}
                        placeholder="—"
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-16 py-1 text-xs")}
                        aria-label="Respiratory Rate (RR) in breaths per minute"
                        data-testid="resp-rr"
                      />
                      <span className={RX_EXAM_FIELD_LABEL_CLASS}>/min</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <label htmlFor="resp-spo2" className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
                        SpO₂
                      </label>
                      <input
                        id="resp-spo2"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={spo2 ?? ""}
                        onChange={(event) => setSpo2(event.target.value)}
                        disabled={disabled}
                        placeholder="—"
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-16 py-1 text-xs")}
                        aria-label="Oxygen Saturation (SpO₂) in percent"
                        data-testid="resp-spo2"
                      />
                      <span className={RX_EXAM_FIELD_LABEL_CLASS}>%</span>
                    </div>
                    <CategoricalVitalSelect
                      vitalKey="vitalsO2DeliveryMethod"
                      variant="inline"
                      inlineLabelClassName={RX_EXAM_FIELD_LABEL_CLASS}
                    />
                  </div>
                ) : null}

                {hasChips ? (
                  <div
                    className="mt-2"
                    data-testid={`exam-findings-resp-${subsection.id}`}
                  >
                    <div
                      className={CHART_SELECT_CHIP_GROUP_CLASS}
                      role="group"
                      aria-label={`Respiratory — ${subsection.label}`}
                    >
                      {subsectionChips.map(renderChipButton)}
                    </div>
                  </div>
                ) : null}

                {isAuscultation ? (
                  <div
                    className="mt-2 space-y-0.5"
                    data-testid="exam-findings-resp-auscultation"
                  >
                    {chipGroups.map((group) => (
                      <ExamRespChipGroupCard
                        key={group.id}
                        group={group}
                        subsectionLabel={subsection.label}
                        entries={entries}
                        disabled={disabled}
                        open={openFindingId === respAuscultationChipGroupCardId(group.id)}
                        onOpenChange={(open) =>
                          setFindingOpen(respAuscultationChipGroupCardId(group.id), open)
                        }
                        onToggleChip={toggleChip}
                        onNotesChange={setChipGroupNotes}
                        onClear={() => clearChipGroup(group)}
                      />
                    ))}
                    {structuredDefs.map((def) => (
                      <ExamRespFindingCard
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

                {subsection.id === "oxygenation" ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label htmlFor="resp-oxygenation-notes" className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                      Notes
                    </label>
                    <input
                      id="resp-oxygenation-notes"
                      type="text"
                      value={respRateNote}
                      onChange={(event) => setRespRateNote(event.target.value)}
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={VITAL_NOTE_MAX_LEN}
                      aria-label="Respiratory Rate (RR) note"
                      data-testid="vital-note-vitalsRr"
                    />
                  </div>
                ) : null}

                {RESP_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id] ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label
                      htmlFor={`resp-${subsection.id}-notes`}
                      className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}
                    >
                      Notes
                    </label>
                    <input
                      id={`resp-${subsection.id}-notes`}
                      type="text"
                      value={subsectionNotesValue(subsection.id)}
                      onChange={(event) =>
                        setSubsectionNotes(
                          RESP_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsection.id]!,
                          event.target.value,
                        )
                      }
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid={`resp-${subsection.id}-notes`}
                    />
                  </div>
                ) : null}
              </ExamSubsectionCollapsible>
            );
          })}

          <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
            <label htmlFor="exam-notes-resp" className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
              {RX_EXAM_ADDITIONAL_NOTES_LABEL}
            </label>
            <input
              id="exam-notes-resp"
              type="text"
              value={systemNotes}
              onChange={(event) => setSystemNotes(event.target.value)}
              disabled={disabled}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid="exam-notes-resp"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          aria-label="Collapse Respiratory examination"
          data-testid="exam-done-resp"
          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
