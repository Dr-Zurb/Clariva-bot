/**
 * Describe-visit router (vnb-03).
 *
 * Deterministic recognizers first, then cue-routed existing clients.
 * No new route. No logging of slice text (RFE3-D7 / VN-DL-4).
 */

import {
  parseComplaintWithAI,
  type AiParsedComplaint,
  type ComplaintParseTier,
} from "@/lib/api/complaint-parse";
import {
  parseMedicineWithAI,
  type AiParsedMedicine,
  type MedicineParseTier,
} from "@/lib/api/medicine-parse";
import {
  resolveDiagnosisWithAI,
  type DiagnosisResolveSuggestion,
} from "@/lib/api/diagnosis-parse";
import { resolveInvestigationWithAI } from "@/lib/api/investigation-parse";
import { searchComplaints } from "@/lib/api/complaint-master";
import { resolveComplaintAttributeFields } from "@/lib/cockpit/complaint-schema";
import { complaintNamesEquivalent } from "@/lib/cockpit/complaint-search-normalize";
import {
  parseSetVitalCommand,
  type SetVitalOption,
} from "@/lib/cockpit/command-bar-set-vital";
import {
  parseMedicineLine,
  type ParsedMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";
import { shouldRequestAiMedParse } from "@/lib/cockpit/should-request-ai-med-parse";
import { mapResolvedTermsToCatalog } from "@/lib/cockpit/investigation-order-catalog";
import {
  segmentVisitText,
  type VisitProseTarget,
  type VisitSlice,
} from "@/lib/cockpit/visit-segmenter";

export type VisitParseTabId =
  | "subjective"
  | "plan"
  | "vitals"
  | "assessment"
  | "investigations"
  | "prose";

export type VisitParseTier = ComplaintParseTier & MedicineParseTier;

export type VisitItemSource = "deterministic" | "ai" | "transcript";

/** Span into a stored transcript. Quote is sliced at render — never stored here. */
export interface VisitTranscriptEvidence {
  transcriptId: string;
  spanStart: number;
  spanEnd: number;
}

export function isTranscriptSource(source: VisitItemSource): boolean {
  return source === "transcript";
}

/**
 * Half-open [spanStart, spanEnd) into `transcriptText` — same bounds as
 * `verifyExtractLines` on the server. Returns null when the span does not
 * resolve; callers drop the row (never render a blank quote).
 */
export function sliceTranscriptQuote(
  transcriptText: string,
  spanStart: number,
  spanEnd: number
): string | null {
  if (!Number.isInteger(spanStart) || !Number.isInteger(spanEnd)) return null;
  if (spanStart < 0 || spanEnd > transcriptText.length || spanEnd <= spanStart) {
    return null;
  }
  return transcriptText.slice(spanStart, spanEnd);
}

export interface VisitVitalItem {
  source: VisitItemSource;
  option: SetVitalOption;
  evidence?: VisitTranscriptEvidence;
}

export interface VisitDiagnosisItem {
  source: VisitItemSource;
  suggestion: DiagnosisResolveSuggestion;
  evidence?: VisitTranscriptEvidence;
}

export interface VisitInvestigationItem {
  source: VisitItemSource;
  term: string;
  catalogValue: string;
  label: string;
  evidence?: VisitTranscriptEvidence;
}

export interface VisitProseItem {
  source: VisitItemSource;
  target: VisitProseTarget;
  text: string;
  evidence?: VisitTranscriptEvidence;
}

/** Locked DTO for vnb-04. Existing card arrays stay for the current proposal UI. */
export interface VisitParseProposal {
  sourceText: string;
  tier: VisitParseTier;
  subjective: AiParsedComplaint[];
  plan: AiParsedMedicine[];
  vitals: VisitVitalItem[];
  assessment: VisitDiagnosisItem[];
  investigations: VisitInvestigationItem[];
  prose: VisitProseItem[];
  subjectiveSource: VisitItemSource[];
  planSource: VisitItemSource[];
  planParsed: Array<ParsedMedicineLine | null>;
  /** Parallel to subjective when a row is transcript-derived. Omitted on typed/dictated. */
  subjectiveEvidence?: Array<VisitTranscriptEvidence | undefined>;
  /** Parallel to plan when a row is transcript-derived. Omitted on typed/dictated. */
  planEvidence?: Array<VisitTranscriptEvidence | undefined>;
}

export interface ParseVisitDescriptionInput {
  text: string;
  token: string;
  /** Explicit ✨ refine → flagship. Auto-gate omits this. */
  refine?: boolean;
  signal?: AbortSignal;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Same resolved spec the complaint capture bar already builds. */
export function complaintFieldSpecForParse(text: string) {
  return resolveComplaintAttributeFields({ complaintName: text }).filter(
    (field) => field.type !== "painscale" && field.type !== "temperature"
  );
}

export function emptyVisitParseProposal(
  sourceText = "",
  tier: VisitParseTier = "default"
): VisitParseProposal {
  return {
    sourceText,
    tier,
    subjective: [],
    plan: [],
    vitals: [],
    assessment: [],
    investigations: [],
    prose: [],
    subjectiveSource: [],
    planSource: [],
    planParsed: [],
  };
}

function isLeftoverOnly(slices: readonly VisitSlice[]): boolean {
  return slices.length === 1 && slices[0]?.kind === "leftover";
}

function trimCueText(text: string): string {
  return text.replace(/[.,;:]+$/g, "").trim();
}

function lineForSlice(slice: VisitSlice): string {
  const body = trimCueText(slice.text);
  if (slice.cue) return `${slice.cue} ${body}`.trim();
  return body;
}

function slicesAreSingleLine(slices: readonly VisitSlice[]): boolean {
  if (isLeftoverOnly(slices)) return true;
  return slices.every(
    (slice) =>
      slice.kind === "leftover" ||
      slice.kind === "vital" ||
      slice.kind === "medicine"
  );
}

function tryVital(text: string): VisitVitalItem[] {
  const result = parseSetVitalCommand(text);
  if (result.kind === "one") {
    return [{ source: "deterministic", option: result.option }];
  }
  if (result.kind === "pick") {
    return result.options.map((option) => ({ source: "ai" as const, option }));
  }
  return [];
}

function tryMedicine(text: string): {
  medicine: AiParsedMedicine;
  parsed: ParsedMedicineLine;
} | null {
  const parsed = parseMedicineLine(text);
  if (!parsed || shouldRequestAiMedParse(text, parsed)) return null;
  if (!parsed.medicineName.trim()) return null;
  const hasSig = Boolean(
    parsed.frequencyCode ||
      parsed.doseQty ||
      parsed.durationValue ||
      parsed.dosage.trim()
  );
  if (!hasSig) return null;
  return { medicine: { name: parsed.medicineName }, parsed };
}

async function tryCatalogComplaint(
  token: string,
  text: string,
  signal?: AbortSignal
): Promise<AiParsedComplaint | null> {
  const query = text.trim();
  if (!query) return null;
  try {
    const res = await searchComplaints(token, query, { limit: 5 });
    const rows = res.data.results;
    const hit = rows.find(
      (row) =>
        complaintNamesEquivalent(query, row.name) ||
        row.synonyms.some((syn) => complaintNamesEquivalent(query, syn))
    );
    if (!hit) return null;
    return { name: hit.name, patch: {}, associated: [] };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
}

async function parseComplaints(
  token: string,
  texts: readonly string[],
  tier: VisitParseTier,
  signal?: AbortSignal
): Promise<AiParsedComplaint[]> {
  const out: AiParsedComplaint[] = [];
  for (const text of texts) {
    try {
      const res = await parseComplaintWithAI(token, {
        text,
        fieldSpec: complaintFieldSpecForParse(text),
        tier,
        signal,
      });
      out.push(...res.data.complaints);
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }
  return out;
}

async function parseMedicines(
  token: string,
  texts: readonly string[],
  tier: VisitParseTier,
  signal?: AbortSignal
): Promise<AiParsedMedicine[]> {
  const out: AiParsedMedicine[] = [];
  for (const text of texts) {
    try {
      const res = await parseMedicineWithAI(token, { text, tier, signal });
      out.push(...res.data.medicines);
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }
  return out;
}

async function resolveDiagnoses(
  token: string,
  texts: readonly string[],
  tier: VisitParseTier,
  signal?: AbortSignal
): Promise<VisitDiagnosisItem[]> {
  const out: VisitDiagnosisItem[] = [];
  for (const text of texts) {
    try {
      const res = await resolveDiagnosisWithAI(token, { text, tier, signal });
      for (const suggestion of res.data.suggestions) {
        out.push({ source: "ai", suggestion });
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }
  return out;
}

async function resolveInvestigations(
  token: string,
  texts: readonly string[],
  tier: VisitParseTier,
  signal?: AbortSignal
): Promise<VisitInvestigationItem[]> {
  const out: VisitInvestigationItem[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    try {
      const res = await resolveInvestigationWithAI(token, {
        text,
        tier,
        signal,
      });
      const mapped = mapResolvedTermsToCatalog(
        res.data.candidates.map((c) => c.term)
      );
      for (const entry of mapped) {
        if (seen.has(entry.value)) continue;
        seen.add(entry.value);
        out.push({
          source: "ai",
          term: entry.label,
          catalogValue: entry.value,
          label: entry.label,
        });
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
    }
  }
  return out;
}

function mergeInto(
  target: VisitParseProposal,
  part: Partial<VisitParseProposal>
): void {
  if (part.subjective?.length) {
    target.subjective.push(...part.subjective);
    target.subjectiveSource.push(
      ...(part.subjectiveSource ?? part.subjective.map(() => "ai" as const))
    );
  }
  if (part.plan?.length) {
    target.plan.push(...part.plan);
    target.planSource.push(
      ...(part.planSource ?? part.plan.map(() => "ai" as const))
    );
    target.planParsed.push(
      ...(part.planParsed ?? part.plan.map(() => null))
    );
  }
  if (part.vitals?.length) target.vitals.push(...part.vitals);
  if (part.assessment?.length) target.assessment.push(...part.assessment);
  if (part.investigations?.length) {
    target.investigations.push(...part.investigations);
  }
  if (part.prose?.length) target.prose.push(...part.prose);
}

/** Stamp every item as transcript-derived with the line's span (VNT-D4). */
export function stampTranscriptProposal(
  proposal: VisitParseProposal,
  evidence: VisitTranscriptEvidence
): VisitParseProposal {
  return {
    ...proposal,
    subjectiveSource: proposal.subjective.map(() => "transcript" as const),
    planSource: proposal.plan.map(() => "transcript" as const),
    subjectiveEvidence: proposal.subjective.map(() => evidence),
    planEvidence: proposal.plan.map(() => evidence),
    vitals: proposal.vitals.map((item) => ({
      ...item,
      source: "transcript",
      evidence,
    })),
    assessment: proposal.assessment.map((item) => ({
      ...item,
      source: "transcript",
      evidence,
    })),
    investigations: proposal.investigations.map((item) => ({
      ...item,
      source: "transcript",
      evidence,
    })),
    prose: proposal.prose.map((item) => ({
      ...item,
      source: "transcript",
      evidence,
    })),
  };
}

export function mergeVisitParseProposals(
  target: VisitParseProposal,
  part: VisitParseProposal
): void {
  const subjectiveBefore = target.subjective.length;
  const planBefore = target.plan.length;
  mergeInto(target, part);
  if (part.subjectiveEvidence?.length || target.subjectiveEvidence) {
    const dest =
      target.subjectiveEvidence ??
      Array.from({ length: subjectiveBefore }, () => undefined);
    dest.push(
      ...(part.subjectiveEvidence ?? part.subjective.map(() => undefined))
    );
    target.subjectiveEvidence = dest;
  }
  if (part.planEvidence?.length || target.planEvidence) {
    const dest =
      target.planEvidence ?? Array.from({ length: planBefore }, () => undefined);
    dest.push(...(part.planEvidence ?? part.plan.map(() => undefined)));
    target.planEvidence = dest;
  }
}

export async function proposalFromTranscriptExtract(input: {
  token: string;
  transcriptId: string;
  transcriptText: string;
  lines: ReadonlyArray<{ text: string; spanStart: number; spanEnd: number }>;
  signal?: AbortSignal;
}): Promise<VisitParseProposal> {
  const out = emptyVisitParseProposal(input.transcriptText);
  for (const line of input.lines) {
    if (sliceTranscriptQuote(input.transcriptText, line.spanStart, line.spanEnd) == null) {
      continue;
    }
    const parsed = await parseVisitDescription({
      text: line.text,
      token: input.token,
      signal: input.signal,
    });
    mergeVisitParseProposals(
      out,
      stampTranscriptProposal(parsed, {
        transcriptId: input.transcriptId,
        spanStart: line.spanStart,
        spanEnd: line.spanEnd,
      })
    );
  }
  return out;
}

/**
 * Ladder 1.1–1.3 on a single line. Returns a partial proposal or null.
 */
async function tryDeterministicLine(
  token: string,
  text: string,
  signal?: AbortSignal
): Promise<Partial<VisitParseProposal> | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const vitals = tryVital(trimmed);
  if (vitals.some((item) => item.source === "deterministic")) {
    return { vitals: vitals.filter((item) => item.source === "deterministic") };
  }

  const med = tryMedicine(trimmed);
  if (med) {
    return {
      plan: [med.medicine],
      planSource: ["deterministic"],
      planParsed: [med.parsed],
    };
  }

  const complaint = await tryCatalogComplaint(token, trimmed, signal);
  if (complaint) {
    return {
      subjective: [complaint],
      subjectiveSource: ["deterministic"],
    };
  }

  if (vitals.length > 0) return { vitals };

  return null;
}

/**
 * Fan slices through the VNB-D2 ladder. Fail soft per group.
 * Whole-line deterministic hit short-circuits segmentation.
 */
export async function parseVisitDescription(
  input: ParseVisitDescriptionInput
): Promise<VisitParseProposal> {
  const tier: VisitParseTier = input.refine ? "escalation" : "default";
  const sourceText = input.text;
  if (sourceText.trim().length === 0) {
    return emptyVisitParseProposal(sourceText, tier);
  }

  const out = emptyVisitParseProposal(sourceText, tier);

  const slices = segmentVisitText(sourceText);

  if (slicesAreSingleLine(slices)) {
    const wholeLine = await tryDeterministicLine(
      input.token,
      sourceText,
      input.signal
    );
    if (wholeLine) {
      mergeInto(out, wholeLine);
      return out;
    }
  }

  if (isLeftoverOnly(slices)) {
    const leftover = slices[0]!.text;
    const det = await tryDeterministicLine(input.token, leftover, input.signal);
    if (det) {
      mergeInto(out, det);
      return out;
    }
    const [subjective, plan] = await Promise.all([
      parseComplaints(input.token, [leftover], tier, input.signal),
      parseMedicines(input.token, [leftover], tier, input.signal),
    ]);
    mergeInto(out, {
      subjective,
      plan,
      subjectiveSource: subjective.map(() => "ai"),
      planSource: plan.map(() => "ai"),
      planParsed: plan.map(() => null),
    });
    return out;
  }

  const complaintAiTexts: string[] = [];
  const medicineAiTexts: string[] = [];
  const diagnosisTexts: string[] = [];
  const investigationTexts: string[] = [];

  for (const slice of slices) {
    if (slice.kind === "ignored") continue;

    if (slice.kind === "prose") {
      const target = slice.proseTarget ?? "note";
      out.prose.push({ source: "deterministic", target, text: slice.text });
      continue;
    }

    if (slice.kind === "vital") {
      const vitals = tryVital(lineForSlice(slice));
      if (vitals.length > 0) {
        out.vitals.push(...vitals);
        continue;
      }
    }

    if (slice.kind === "medicine") {
      const med = tryMedicine(slice.text) ?? tryMedicine(lineForSlice(slice));
      if (med) {
        mergeInto(out, {
          plan: [med.medicine],
          planSource: ["deterministic"],
          planParsed: [med.parsed],
        });
        continue;
      }
      medicineAiTexts.push(slice.text);
      continue;
    }

    if (slice.kind === "complaint") {
      const catalog = await tryCatalogComplaint(
        input.token,
        slice.text,
        input.signal
      );
      if (catalog) {
        mergeInto(out, {
          subjective: [catalog],
          subjectiveSource: ["deterministic"],
        });
        continue;
      }
      complaintAiTexts.push(slice.text);
      continue;
    }

    if (slice.kind === "diagnosis") {
      diagnosisTexts.push(trimCueText(slice.text));
      continue;
    }

    if (slice.kind === "investigation") {
      investigationTexts.push(trimCueText(slice.text));
      continue;
    }

    if (slice.kind === "leftover") {
      const det = await tryDeterministicLine(
        input.token,
        slice.text,
        input.signal
      );
      if (det) mergeInto(out, det);
    }
  }

  const [aiComplaints, aiMedicines, diagnoses, investigations] =
    await Promise.all([
      parseComplaints(input.token, complaintAiTexts, tier, input.signal),
      parseMedicines(input.token, medicineAiTexts, tier, input.signal),
      resolveDiagnoses(input.token, diagnosisTexts, tier, input.signal),
      resolveInvestigations(input.token, investigationTexts, tier, input.signal),
    ]);

  mergeInto(out, {
    subjective: aiComplaints,
    plan: aiMedicines,
    subjectiveSource: aiComplaints.map(() => "ai"),
    planSource: aiMedicines.map(() => "ai"),
    planParsed: aiMedicines.map(() => null),
    assessment: diagnoses,
    investigations,
  });

  return out;
}
