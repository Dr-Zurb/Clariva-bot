/**
 * Describe-visit apply converters (rfed-04 / vnb-04).
 *
 * Same card construction the capture bars already use for AI accept.
 * Callers dispatch ADD_COMPLAINT / ADD_MEDICINE / ADD_DIAGNOSIS or
 * setField — no third writer.
 */

import type { AiParsedComplaint } from "@/lib/api/complaint-parse";
import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import type { DiagnosisResolveSuggestion } from "@/lib/api/diagnosis-parse";
import type { RxHiddenTarget } from "@/components/cockpit/rx/command-bar/rx-hidden-set";
import {
  createEmptyComplaint,
  type Complaint,
  type RxFormFields,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import {
  buildConfirmedDefaultsPatch,
  filterSuggestionsForEmptyFields,
} from "@/lib/cockpit/complaint-defaults";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import { complaintNamesEquivalent } from "@/lib/cockpit/complaint-search-normalize";
import type { ComplaintAttributeKey } from "@/lib/cockpit/complaint-schema";
import { isLateralityValidForComplaint } from "@/lib/cockpit/parse-complaint-text";
import {
  buildParsedCueItems,
  recordParsedFields,
} from "@/lib/cockpit/parsed-fields-signal";
import {
  applySetVitalWrites,
  type SetVitalOption,
} from "@/lib/cockpit/command-bar-set-vital";
import {
  createEmptyDiagnosisRow,
  normalizeConditionKey,
} from "@/lib/cockpit/diagnoses";
import {
  createImagingBasket,
  createPanelBasket,
  findOrderCatalogEntryByValue,
  parseInvestigationOrdersFromFlat,
  serializeInvestigationOrdersToFlat,
} from "@/lib/cockpit/investigation-order-catalog";
import { appendUniquePlanPhrase } from "@/lib/cockpit/plan-quick-picks";
import {
  rxMedicineFromAiMedicine,
  rxMedicineFromParsed,
} from "@/lib/cockpit/rx-medicine-from-capture";
import type { VisitProseTarget } from "@/lib/cockpit/visit-segmenter";
import {
  emptyVisitParseProposal,
  isTranscriptSource,
  type VisitInvestigationItem,
  type VisitItemSource,
  type VisitParseProposal,
  type VisitProseItem,
  type VisitTranscriptEvidence,
  type VisitVitalItem,
} from "@/lib/cockpit/visit-parse-orchestrator";
import type { DiagnosisRow } from "@/types/prescription";

function buildAssociatedChildren(names: string[], parentName: string): Complaint[] {
  const children: Complaint[] = [];
  for (const raw of names) {
    const name = formatComplaintDisplayName(raw.trim());
    if (!name) continue;
    if (complaintNamesEquivalent(name, parentName)) continue;
    if (children.some((child) => complaintNamesEquivalent(child.name, name))) continue;
    const child = createEmptyComplaint();
    child.name = name;
    children.push(child);
  }
  return children;
}

/** Build a form complaint the same way ComplaintList.addAiComplaint does. */
export function complaintFromAiParsed(parsed: AiParsedComplaint): Complaint | null {
  const finalName = formatComplaintDisplayName(parsed.name);
  if (!finalName) return null;

  const complaint = createEmptyComplaint();
  complaint.name = finalName;
  Object.assign(complaint, parsed.patch);

  if (
    !isLateralityValidForComplaint(
      complaint.name,
      complaint.category ?? undefined,
      complaint.laterality
    )
  ) {
    delete complaint.laterality;
  }

  const children = buildAssociatedChildren(parsed.associated, complaint.name);
  if (children.length > 0) complaint.associatedComplaints = children;

  recordParsedFields(
    complaint.id,
    buildParsedCueItems(
      complaint,
      parsed.patch,
      children.map((child) => child.name)
    )
  );

  return complaint;
}

/**
 * Merge an AI parse onto a card the doctor already added.
 * Empty fields and new associated names only — never overwrites typed field
 * values. `suggestedName` is the AI title when it differs; Apply / Apply all
 * write it onto the card. `Use “…”` writes the name only.
 */
export function mergeAiParsedIntoComplaint(
  existing: Complaint,
  parsed: AiParsedComplaint
): {
  fieldPatch: Partial<Complaint>;
  associatedNames: string[];
  suggestedName: string | null;
} {
  const keys = Object.keys(parsed.patch) as ComplaintAttributeKey[];
  const fieldPatch = buildConfirmedDefaultsPatch(
    filterSuggestionsForEmptyFields(existing, parsed.patch, keys)
  );

  if (
    typeof fieldPatch.laterality === "string" &&
    !isLateralityValidForComplaint(
      existing.name,
      existing.category ?? undefined,
      fieldPatch.laterality
    )
  ) {
    delete fieldPatch.laterality;
  }

  const existingAssociated = new Set(
    (existing.associatedComplaints ?? [])
      .map((child) => child.name.trim().toLowerCase())
      .filter(Boolean)
  );
  const associatedNames: string[] = [];
  for (const raw of parsed.associated) {
    const name = formatComplaintDisplayName(raw.trim());
    if (!name) continue;
    if (complaintNamesEquivalent(name, existing.name)) continue;
    const key = name.toLowerCase();
    if (existingAssociated.has(key)) continue;
    if (associatedNames.some((entry) => entry.toLowerCase() === key)) continue;
    associatedNames.push(name);
  }

  const suggested = formatComplaintDisplayName(parsed.name);
  const suggestedName =
    suggested && !complaintNamesEquivalent(suggested, existing.name)
      ? suggested
      : null;

  return { fieldPatch, associatedNames, suggestedName };
}

/** Plan rows via the existing AI → RxMedicine mapper. */
export function medicinesFromAiParsed(
  parsed: readonly AiParsedMedicine[]
): RxMedicine[] {
  return parsed
    .map(rxMedicineFromAiMedicine)
    .filter((row) => row.medicineName.trim().length > 0);
}

/** Deterministic plan row via the capture-bar converter. */
export function medicineFromVisitPlanItem(
  proposal: VisitParseProposal,
  index: number
): RxMedicine | null {
  const parsed = proposal.planParsed[index];
  if (parsed) {
    const row = rxMedicineFromParsed(parsed);
    return row.medicineName.trim() ? row : null;
  }
  const item = proposal.plan[index];
  if (!item) return null;
  const row = rxMedicineFromAiMedicine(item);
  return row.medicineName.trim() ? row : null;
}

export function isVisitProposalEmpty(proposal: VisitParseProposal): boolean {
  return (
    proposal.subjective.length === 0 &&
    proposal.plan.length === 0 &&
    proposal.vitals.length === 0 &&
    proposal.assessment.length === 0 &&
    proposal.investigations.length === 0 &&
    proposal.prose.length === 0
  );
}

function shouldAutoApply(
  source: VisitItemSource,
  evidence?: VisitTranscriptEvidence
): boolean {
  return source === "deterministic" && !isTranscriptSource(source) && evidence == null;
}

function pushAlignedEvidence(
  dest: Array<VisitTranscriptEvidence | undefined>,
  evidence: VisitTranscriptEvidence | undefined
): void {
  dest.push(evidence);
}

/**
 * VNB-D4 split, with VNT-D4 exception: transcript-derived items never
 * auto-apply — including a vital the grammar parsed cleanly.
 * Model-touched items stay pending confirm cards.
 */
export function splitVisitProposal(proposal: VisitParseProposal): {
  applied: VisitParseProposal;
  pending: VisitParseProposal;
} {
  const applied = emptyVisitParseProposal(proposal.sourceText, proposal.tier);
  const pending = emptyVisitParseProposal(proposal.sourceText, proposal.tier);
  const pendingSubjectiveEvidence: Array<VisitTranscriptEvidence | undefined> = [];
  const pendingPlanEvidence: Array<VisitTranscriptEvidence | undefined> = [];
  let anyPendingSubjectiveEvidence = false;
  let anyPendingPlanEvidence = false;

  proposal.subjective.forEach((item, index) => {
    const source = proposal.subjectiveSource[index] ?? "ai";
    const evidence = proposal.subjectiveEvidence?.[index];
    if (shouldAutoApply(source, evidence)) {
      applied.subjective.push(item);
      applied.subjectiveSource.push("deterministic");
    } else {
      pending.subjective.push(item);
      pending.subjectiveSource.push(source);
      pushAlignedEvidence(pendingSubjectiveEvidence, evidence);
      if (evidence) anyPendingSubjectiveEvidence = true;
    }
  });

  proposal.plan.forEach((item, index) => {
    const source = proposal.planSource[index] ?? "ai";
    const parsed = proposal.planParsed[index] ?? null;
    const evidence = proposal.planEvidence?.[index];
    if (shouldAutoApply(source, evidence) && parsed) {
      applied.plan.push(item);
      applied.planSource.push("deterministic");
      applied.planParsed.push(parsed);
    } else {
      pending.plan.push(item);
      pending.planSource.push(source);
      pending.planParsed.push(parsed);
      pushAlignedEvidence(pendingPlanEvidence, evidence);
      if (evidence) anyPendingPlanEvidence = true;
    }
  });

  for (const vital of proposal.vitals) {
    if (shouldAutoApply(vital.source, vital.evidence)) applied.vitals.push(vital);
    else pending.vitals.push(vital);
  }

  for (const item of proposal.assessment) {
    pending.assessment.push(item);
  }
  for (const item of proposal.investigations) {
    pending.investigations.push(item);
  }

  for (const item of proposal.prose) {
    if (shouldAutoApply(item.source, item.evidence)) applied.prose.push(item);
    else pending.prose.push(item);
  }

  if (anyPendingSubjectiveEvidence) {
    pending.subjectiveEvidence = pendingSubjectiveEvidence;
  }
  if (anyPendingPlanEvidence) {
    pending.planEvidence = pendingPlanEvidence;
  }

  return { applied, pending };
}

export function unhideVitalWrites(
  option: SetVitalOption,
  hidden: readonly RxHiddenTarget[],
  show: (target: RxHiddenTarget) => boolean
): void {
  for (const write of option.writes) {
    const target = hidden.find(
      (item) => item.kind === "vital" && item.field === write.key
    );
    if (target) show(target);
  }
}

export function applyVisitVitalOption(
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void,
  fields: Pick<RxFormFields, "vitalsBpReadings" | "vitalsGlucoseReadings">,
  option: SetVitalOption,
  hidden: readonly RxHiddenTarget[],
  show: (target: RxHiddenTarget) => boolean
): void {
  unhideVitalWrites(option, hidden, show);
  applySetVitalWrites(setField, fields, option.writes);
}

export function applyVisitVitalItems(
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void,
  fields: Pick<RxFormFields, "vitalsBpReadings" | "vitalsGlucoseReadings">,
  items: readonly VisitVitalItem[],
  hidden: readonly RxHiddenTarget[],
  show: (target: RxHiddenTarget) => boolean
): void {
  for (const item of items) {
    applyVisitVitalOption(setField, fields, item.option, hidden, show);
  }
}

/** Catalog-coded diagnosis row — same shape DiagnosisRowsList.commitDiagnosis writes. */
export function diagnosisFromSuggestion(
  suggestion: DiagnosisResolveSuggestion,
  existing: readonly DiagnosisRow[]
): DiagnosisRow | null {
  const label = suggestion.title.trim();
  const code = suggestion.code.trim();
  if (!label || !code) return null;
  const key = normalizeConditionKey(label);
  if (existing.some((row) => normalizeConditionKey(row.label) === key)) {
    return null;
  }
  const hasCommitted = existing.some(
    (row) => row.kind === "primary" || row.kind === "secondary"
  );
  return {
    ...createEmptyDiagnosisRow(hasCommitted ? "secondary" : "primary"),
    label,
    code,
    codeTitle: suggestion.title,
  };
}

export function nextInvestigationsOrdersFromItem(
  current: string,
  item: VisitInvestigationItem
): string {
  const entry = findOrderCatalogEntryByValue(item.catalogValue);
  if (!entry) return current;

  let order = null;
  if (entry.kind === "panel") order = createPanelBasket(entry.id);
  else if (entry.kind === "imaging") order = createImagingBasket(entry.id);
  else order = { id: entry.id, label: entry.label, kind: entry.kind };
  if (!order) return current;

  const existing = parseInvestigationOrdersFromFlat(current);
  const without = existing.filter(
    (row) => !(row.kind === order.kind && row.id === order.id)
  );
  return serializeInvestigationOrdersToFlat([...without, order]);
}

export function appendVisitProse(
  existing: string,
  item: VisitProseItem
): string {
  return appendUniquePlanPhrase(existing, item.text);
}

export function applyVisitProseItems(
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void,
  fields: Pick<RxFormFields, "examinationFindings" | "advice" | "clinicalNotes">,
  items: readonly VisitProseItem[]
): void {
  const next: Record<VisitProseTarget, string> = {
    exam: fields.examinationFindings,
    advice: fields.advice,
    note: fields.clinicalNotes,
  };
  for (const item of items) {
    next[item.target] = appendVisitProse(next[item.target], item);
  }
  if (next.exam !== fields.examinationFindings) {
    setField("examinationFindings", next.exam);
  }
  if (next.advice !== fields.advice) {
    setField("advice", next.advice);
  }
  if (next.note !== fields.clinicalNotes) {
    setField("clinicalNotes", next.note);
  }
}
