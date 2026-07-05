"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import {
  reAnchorExamCvsFindingCardOnClose,
  scrollExamCvsFindingCardIntoView,
  scrollExamSubsectionIntoView,
} from "@/lib/cockpit/exam-card-scroll";
import {
  ExamCvsFindingCard,
  ExamCvsInlineFindingFields,
} from "@/components/cockpit/rx/inputs/ExamCvsFindingCard";
import {
  ExamSubsectionCollapsible,
  examSubsectionSummary,
  orderSubsectionsForModality,
  resolveTeleconsultSubsectionTag,
  useExamSubsectionOpenState,
} from "@/components/cockpit/rx/inputs/ExamSubsectionCollapsible";
import {
  clearCvsChipGroupEntries,
  ExamCvsChipGroupCard,
  patchCvsChipGroupNotesEntry,
} from "@/components/cockpit/rx/inputs/ExamCvsChipGroupCard";
import { CategoricalVitalSelect } from "@/components/cockpit/rx/inputs/CategoricalVitalSelect";
import type {
  CvsExamChipGroupDef,
  CvsExamSubsectionDef,
} from "@/lib/cockpit/cvs-exam-finding-schema";
import {
  cvsAuscultationChipGroupCardId,
  cvsSubsectionScrollKey,
  CVS_AUSCULTATION_SUBSECTION_SCROLL_KEY,
  CVS_EXAM_SUBSECTIONS,
  CVS_INLINE_STRUCTURED_FINDING_IDS,
  CVS_INSPECTION_NOTES_FINDING_ID,
  isCvsAuscultationExpandableCardId,
  listCvsStructuredFindingsForSubsection,
  listCvsSubsectionChips,
  resolveCvsAuscultationChipGroupNotesMeta,
} from "@/lib/cockpit/cvs-exam-finding-schema";
import {
  chipLabelToFindingId,
  createEmptyFindingEntry,
  cvsFindingEntryHasAttributes,
  cvsFindingEntryPreview,
  findExamFindingEntry,
  patchFindingEntryAttributes,
} from "@/lib/cockpit/exam-finding-utils";
import { VITAL_NOTE_MAX_LEN } from "@/lib/cockpit/vital-notes";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  ExamTeleconsultFeasibilityChip,
  EXAM_PATIENT_ASSISTED_PILL_CLASS,
} from "@/components/cockpit/rx/inputs/ExamTeleconsultFeasibilityChip";
import {
  resolveExamChipTeleconsultFlags,
  resolveExamStructuredTeleconsultHint,
  resolveExamSubsectionTeleconsultNote,
} from "@/lib/cockpit/exam-teleconsult-item-hints";
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
  return `exam-finding-cvs-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

/** All findingIds a subsection owns (chips, group chips/notes, structured, inspection notes). */
function cvsSubsectionOwnedFindingIds(subsection: CvsExamSubsectionDef): Set<string> {
  const ids = new Set<string>();
  for (const chip of listCvsSubsectionChips(subsection)) ids.add(chipLabelToFindingId(chip));
  for (const def of listCvsStructuredFindingsForSubsection(subsection.id)) ids.add(def.findingId);
  for (const group of subsection.chipGroups ?? []) {
    for (const chip of group.chips) ids.add(chipLabelToFindingId(chip));
    const notesMeta = resolveCvsAuscultationChipGroupNotesMeta(group.id);
    if (notesMeta?.findingId) ids.add(notesMeta.findingId);
  }
  if (subsection.id === "inspection") ids.add(CVS_INSPECTION_NOTES_FINDING_ID);
  return ids;
}

export interface ExamCvsSystemBodyProps {
  finding?: ExamSystemFinding;
  disabled?: boolean;
  onDone: () => void;
}

export function ExamCvsSystemBody({
  finding,
  disabled = false,
  onDone,
}: ExamCvsSystemBodyProps) {
  const { dispatch, state, setField } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const isTele = isTeleconsult(state.consultationType);
  const normalLine = isTele
    ? teleconsultNormalLine("cvs")
    : resolveExamSystem("cvs").normalLine;
  const pulseRate = state.fields.vitalsHr;
  const pulseHrNote = state.fields.vitalsNotes.vitalsHr ?? "";
  const entries = finding?.findings ?? [];
  const systemNotes = finding?.notes ?? "";
  const inspectionNotesEntry = findExamFindingEntry(entries, CVS_INSPECTION_NOTES_FINDING_ID);
  const inspectionNotes = inspectionNotesEntry?.attributes?.notes ?? "";
  const apexBeatEntry = findExamFindingEntry(entries, "apex_beat");
  const apexBeatNotes = apexBeatEntry?.attributes?.notes ?? "";
  const jvpRaisedEntry = findExamFindingEntry(entries, "jvp_raised");
  const jvpNotes = jvpRaisedEntry?.attributes?.notes ?? "";
  const showBody = status !== "normal";

  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  // Pulse rate/note live in the canonical vitals fields (not exam entries), so detect
  // their content separately and fold them into the Pulse subsection summary.
  const pulseHasVitals = pulseRate != null || pulseHrNote.trim() !== "";
  const pulsePreview = pulseRate != null ? `${pulseRate} bpm` : "";

  // Teleconsult (tc-02): Inspection + Pulse (vitals) stay foregrounded; the
  // palpation/auscultation subsections grey out. In-clinic is byte-identical.
  const orderedSubsections = orderSubsectionsForModality(CVS_EXAM_SUBSECTIONS, isTele);

  const { isOpen: isSubsectionOpen, toggle: toggleSubsection } = useExamSubsectionOpenState({
    subsections: CVS_EXAM_SUBSECTIONS,
    initialEntries: finding?.findings ?? [],
    ownedFindingIds: cvsSubsectionOwnedFindingIds,
    scrollKeyFor: cvsSubsectionScrollKey,
    fallbackOpenIds: CVS_EXAM_SUBSECTIONS[0] ? [CVS_EXAM_SUBSECTIONS[0].id] : [],
    initialExtraOpenIds: pulseHasVitals ? ["pulse"] : [],
    excludeFromAutoOpen: isTele
      ? (subsection) => resolveSubsectionRemoteFeasibility(subsection) === "in_person_only"
      : undefined,
  });

  // Open → glide the finding/chip-group card under both sticky headers concurrently
  // with the expand; close auscultation cards → scroll whole subsection to top.
  const setFindingOpen = useCallback((findingId: string, open: boolean) => {
    setOpenFindingId(open ? findingId : null);
    if (open) {
      scrollExamCvsFindingCardIntoView(findingId);
    } else if (isCvsAuscultationExpandableCardId(findingId)) {
      scrollExamSubsectionIntoView(CVS_AUSCULTATION_SUBSECTION_SCROLL_KEY);
    } else {
      reAnchorExamCvsFindingCardOnClose(findingId);
    }
  }, []);

  function commit(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cvs" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cvs",
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cvs" });
      setOpenFindingId(null);
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cvs",
      status: "normal",
      findings: [],
      notes: null,
    });
    setOpenFindingId(null);
  }

  function upsertEntry(nextEntry: ExamFindingEntry) {
    if (!cvsFindingEntryHasAttributes(nextEntry)) {
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
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cvs" });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId: "cvs",
      status: "abnormal",
      findings: entries,
      notes: trimmed || null,
    });
  }

  function setInspectionNotes(notes: string) {
    if (disabled) return;
    const base =
      inspectionNotesEntry ?? createEmptyFindingEntry(CVS_INSPECTION_NOTES_FINDING_ID);
    upsertEntry(patchFindingEntryAttributes(base, { notes }));
  }

  function setApexBeatNotes(notes: string) {
    if (disabled) return;
    const base = apexBeatEntry ?? createEmptyFindingEntry("apex_beat");
    upsertEntry(patchFindingEntryAttributes(base, { notes }));
  }

  function setJvpNotes(notes: string) {
    if (disabled) return;
    const base = jvpRaisedEntry ?? createEmptyFindingEntry("jvp_raised");
    upsertEntry(patchFindingEntryAttributes(base, { notes }));
  }

  function setChipGroupNotes(notesFindingId: string, notes: string) {
    if (disabled) return;
    const next = patchCvsChipGroupNotesEntry(entries, notesFindingId, notes);
    commit(next, finding?.notes ?? null);
  }

  function clearChipGroup(group: CvsExamChipGroupDef) {
    if (disabled) return;
    const next = clearCvsChipGroupEntries(entries, group);
    const cardId = cvsAuscultationChipGroupCardId(group.id);
    if (openFindingId === cardId) setOpenFindingId(null);
    commit(next, finding?.notes ?? null);
  }

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "cvs" });
    setOpenFindingId(null);
  }

  function setPulseRate(raw: string) {
    if (disabled) return;
    if (raw.trim() === "") {
      setField("vitalsHr", null);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setField("vitalsHr", next);
  }

  function setPulseHrNote(note: string) {
    if (disabled) return;
    setField("vitalsNotes", {
      ...state.fields.vitalsNotes,
      vitalsHr: note.length > 0 ? note : null,
    });
  }

  return (
    <div className="space-y-2.5" data-testid="exam-cvs-system-body">
      <ExamSystemStatusToolbar
        systemId="cvs"
        status={status}
        normalLine={normalLine}
        disabled={disabled}
        onMarkNormal={markNormal}
        onClear={clearSection}
      />

      {showBody ? (
        <div className="space-y-3">
          {orderedSubsections.map((subsection) => {
            const structuredDefs = listCvsStructuredFindingsForSubsection(subsection.id);
            const inlineStructuredDefs = structuredDefs.filter((def) =>
              CVS_INLINE_STRUCTURED_FINDING_IDS.has(def.findingId),
            );
            const cardStructuredDefs = structuredDefs.filter(
              (def) => !CVS_INLINE_STRUCTURED_FINDING_IDS.has(def.findingId),
            );
            const hasCardStructured = cardStructuredDefs.length > 0;
            const hasInlineStructured = inlineStructuredDefs.length > 0;
            const subsectionChips = listCvsSubsectionChips(subsection);
            const hasChips = subsectionChips.length > 0;
            const chipGroups = subsection.chipGroups ?? [];
            const baseSummary = examSubsectionSummary(
              cvsSubsectionOwnedFindingIds(subsection),
              entries,
              cvsFindingEntryPreview,
            );
            const { hasData, preview } =
              subsection.id === "pulse"
                ? {
                    hasData: baseSummary.hasData || pulseHasVitals,
                    preview: [pulsePreview, baseSummary.preview].filter(Boolean).join(" · "),
                  }
                : baseSummary;
            const { deemphasised, tag } = resolveTeleconsultSubsectionTag(
              isTele,
              subsection,
              hasData,
            );

            const teleconsultNote = isTele
              ? resolveExamSubsectionTeleconsultNote("cvs", subsection.id)
              : undefined;

            function renderChipButton(chip: string) {
              const findingId = chipLabelToFindingId(chip);
              const isSelected = Boolean(findExamFindingEntry(entries, findingId));
              const flags = isTele
                ? resolveExamChipTeleconsultFlags("cvs", subsection.id, chip)
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

            const contentOrder = ["inline", "cards", "chips"] as const;

            function renderAuscultationCardsBlock(separated: boolean) {
              return (
                <div
                  key="auscultation-cards"
                  className={cn(
                    "divide-y divide-border/45",
                    separated ? "mt-2 border-t border-border/45 pt-2" : "mt-2",
                  )}
                  data-testid="exam-findings-cvs-auscultation"
                >
                  {chipGroups.map((group) => (
                    <ExamCvsChipGroupCard
                      key={group.id}
                      group={group}
                      subsectionLabel={subsection.label}
                      entries={entries}
                      disabled={disabled}
                      open={openFindingId === cvsAuscultationChipGroupCardId(group.id)}
                      onOpenChange={(open) =>
                        setFindingOpen(cvsAuscultationChipGroupCardId(group.id), open)
                      }
                      onToggleChip={toggleChip}
                      onNotesChange={setChipGroupNotes}
                      onClear={() => clearChipGroup(group)}
                    />
                  ))}
                  {cardStructuredDefs.map((def) => (
                    <ExamCvsFindingCard
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
              );
            }

            function renderChipsBlock(separated: boolean) {
              if (!hasChips || subsection.id === "auscultation") return null;
              return (
                <div
                  key="chips"
                  className={cn(separated ? "mt-2 border-t border-border/45 pt-2" : "mt-2")}
                  data-testid={`exam-findings-cvs-${subsection.id}`}
                >
                  {chipGroups.length > 0 ? (
                    <div className="space-y-2">
                      {chipGroups.map((group) => (
                        <div
                          key={group.id}
                          data-testid={`cvs-chip-group-${subsection.id}-${group.id}`}
                        >
                          <span className={RX_EXAM_FIELD_LABEL_CLASS}>{group.label}</span>
                          <div
                            className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
                            role="group"
                            aria-label={`Cardiovascular — ${subsection.label} — ${group.label}`}
                          >
                            {group.chips.map(renderChipButton)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className={CHART_SELECT_CHIP_GROUP_CLASS}
                      role="group"
                      aria-label={`Cardiovascular — ${subsection.label}`}
                    >
                      {subsectionChips.map(renderChipButton)}
                    </div>
                  )}
                </div>
              );
            }

            function renderInlineBlock(separated: boolean) {
              if (!hasInlineStructured) return null;
              return (
                <div
                  key="inline"
                  className={cn("space-y-2", separated ? "mt-2 border-t border-border/45 pt-2" : "mt-2")}
                >
                  {inlineStructuredDefs.map((def) => {
                    const entry = findExamFindingEntry(entries, def.findingId);
                    const teleconsultHint = isTele
                      ? resolveExamStructuredTeleconsultHint("cvs", def.findingId)
                      : undefined;
                    const isRecorded = Boolean(entry && cvsFindingEntryHasAttributes(entry));
                    const patientAssisted = Boolean(teleconsultHint && isRecorded);
                    return (
                      <div key={def.findingId}>
                        {patientAssisted ? (
                          <div className="mb-1 flex justify-end">
                            <span
                              className={EXAM_PATIENT_ASSISTED_PILL_CLASS}
                              data-testid={`cvs-inline-patient-assisted-${def.findingId}`}
                            >
                              Patient-assisted
                            </span>
                          </div>
                        ) : null}
                        <ExamCvsInlineFindingFields
                          definition={def}
                          entry={entry}
                          disabled={disabled}
                          onChange={upsertEntry}
                          teleconsultFeasibilityHint={
                            teleconsultHint && !isRecorded ? teleconsultHint : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              );
            }

            function renderCardsBlock(separated: boolean) {
              if (!hasCardStructured) return null;
              return (
                <div
                  key="cards"
                  className={cn(
                    "divide-y divide-border/45",
                    separated ? "mt-2 border-t border-border/45 pt-2" : "mt-2",
                  )}
                >
                  {cardStructuredDefs.map((def) => (
                    <ExamCvsFindingCard
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
              );
            }

            let priorBlock = subsection.id === "pulse";

            function renderContentBlock(kind: (typeof contentOrder)[number]) {
              const separated = priorBlock;
              let node: ReactNode = null;
              if (kind === "chips") node = renderChipsBlock(separated);
              else if (kind === "inline") node = renderInlineBlock(separated);
              else node = renderCardsBlock(separated);
              if (node) priorBlock = true;
              return node;
            }

            return (
              <ExamSubsectionCollapsible
                key={subsection.id}
                systemId="cvs"
                subsectionId={subsection.id}
                label={subsection.label}
                scrollKey={cvsSubsectionScrollKey(subsection.id)}
                open={isSubsectionOpen(subsection.id)}
                onToggle={() => toggleSubsection(subsection.id)}
                hasData={hasData}
                preview={preview}
                disabled={disabled}
                deemphasised={deemphasised}
                tag={tag}
              >
                {subsection.id === "pulse" ? (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
                    data-testid="cvs-pulse-vitals-fields"
                  >
                    <div className="flex shrink-0 items-center gap-1">
                      <label htmlFor="cvs-pulse-rate" className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>
                        Rate
                      </label>
                      <input
                        id="cvs-pulse-rate"
                        type="number"
                        inputMode="numeric"
                        min={20}
                        max={250}
                        value={pulseRate ?? ""}
                        onChange={(event) => setPulseRate(event.target.value)}
                        disabled={disabled}
                        placeholder="—"
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-7 w-16 py-1 text-xs")}
                        aria-label="Pulse Rate (PR) in bpm"
                        data-testid="cvs-pulse-rate"
                      />
                      <span className={RX_EXAM_FIELD_LABEL_CLASS}>bpm</span>
                    </div>
                    <CategoricalVitalSelect
                      vitalKey="vitalsPulseRhythm"
                      variant="inline"
                      inlineLabelClassName={RX_EXAM_FIELD_LABEL_CLASS}
                    />
                  </div>
                ) : null}

                {teleconsultNote ? (
                  <p
                    className="mt-1 text-[10px] leading-snug text-muted-foreground"
                    data-testid={`cvs-${subsection.id}-teleconsult-note`}
                  >
                    {teleconsultNote}
                  </p>
                ) : null}

                {subsection.id === "auscultation"
                  ? renderAuscultationCardsBlock(false)
                  : contentOrder.map((kind) => renderContentBlock(kind))}

                {subsection.id === "pulse" ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label htmlFor="cvs-pulse-notes" className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                      Notes
                    </label>
                    <input
                      id="cvs-pulse-notes"
                      type="text"
                      value={pulseHrNote}
                      onChange={(event) => setPulseHrNote(event.target.value)}
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={VITAL_NOTE_MAX_LEN}
                      aria-label="Pulse Rate (PR) note"
                      data-testid="vital-note-vitalsHr"
                    />
                  </div>
                ) : null}

                {subsection.id === "precordium" ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label htmlFor="cvs-precordium-notes" className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                      Notes
                    </label>
                    <input
                      id="cvs-precordium-notes"
                      type="text"
                      value={apexBeatNotes}
                      onChange={(event) => setApexBeatNotes(event.target.value)}
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid="cvs-precordium-notes"
                    />
                  </div>
                ) : null}

                {subsection.id === "jvp" ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label htmlFor="cvs-jvp-notes" className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                      Notes
                    </label>
                    <input
                      id="cvs-jvp-notes"
                      type="text"
                      value={jvpNotes}
                      onChange={(event) => setJvpNotes(event.target.value)}
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid="cvs-jvp-notes"
                    />
                  </div>
                ) : null}

                {subsection.id === "inspection" ? (
                  <div className="mt-2 border-t border-border/45 pt-2">
                    <label htmlFor="cvs-inspection-notes" className={RX_EXAM_FIELD_LABEL_BLOCK_CLASS}>
                      Notes
                    </label>
                    <input
                      id="cvs-inspection-notes"
                      type="text"
                      value={inspectionNotes}
                      onChange={(event) => setInspectionNotes(event.target.value)}
                      disabled={disabled}
                      className={cn(RX_FIELD_INPUT_CLASS, "mt-1")}
                      placeholder="Optional detail"
                      maxLength={500}
                      data-testid="cvs-inspection-notes"
                    />
                  </div>
                ) : null}
              </ExamSubsectionCollapsible>
            );
          })}

          <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
            <label htmlFor="exam-notes-cvs" className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
              {RX_EXAM_ADDITIONAL_NOTES_LABEL}
            </label>
            <input
              id="exam-notes-cvs"
              type="text"
              value={systemNotes}
              onChange={(event) => setSystemNotes(event.target.value)}
              disabled={disabled}
              className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid="exam-notes-cvs"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          aria-label="Collapse Cardiovascular examination"
          data-testid="exam-done-cvs"
          className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
