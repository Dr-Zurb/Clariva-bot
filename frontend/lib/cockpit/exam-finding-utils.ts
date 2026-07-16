/**
 * Exam finding entry helpers (obj-31).
 *
 * Normalizes legacy string findings into structured `{ findingId, attributes? }`
 * rows, renders derived text for General cards, and builds collapsed previews.
 */

import {
  GENERAL_EXAM_SUBSECTIONS,
  GENERAL_EXAM_FINDINGS,
  generalSubsectionNotesFindingId,
  listGeneralExamFindingsForSubsection,
  resolveGeneralExamFinding,
  resolveGeneralSubsectionNotesLabel,
} from "@/lib/cockpit/general-exam-finding-schema";
import {
  CVS_AUSCULTATION_CHIP_GROUP_NOTES,
  CVS_EXAM_SUBSECTIONS,
  CVS_INSPECTION_NOTES_FINDING_ID,
  CVS_STRUCTURED_FINDING_ORDER,
  listCvsSubsectionChips,
  resolveCvsAuscultationChipGroupNotesByFindingId,
  resolveCvsExamFinding,
} from "@/lib/cockpit/cvs-exam-finding-schema";
import { migrateCvsFindingEntry } from "@/lib/cockpit/cvs-exam-migrations";
import {
  RESP_AUSCULTATION_CHIP_GROUP_NOTES,
  RESP_EXAM_SUBSECTIONS,
  RESP_SUBSECTION_NOTES_FINDINGS,
  RESP_STRUCTURED_FINDING_ORDER,
  listRespSubsectionChips,
  resolveRespAuscultationChipGroupNotesByFindingId,
  resolveRespExamFinding,
  resolveRespSubsectionNotesLabel,
} from "@/lib/cockpit/resp-exam-finding-schema";
import {
  ABD_CHIP_GROUP_NOTES,
  ABD_EXAM_SUBSECTIONS,
  ABD_SUBSECTION_NOTES_FINDINGS,
  ABD_STRUCTURED_FINDING_ORDER,
  listAbdSubsectionChips,
  resolveAbdChipGroupNotesByFindingId,
  resolveAbdExamFinding,
  resolveAbdSubsectionNotesLabel,
} from "@/lib/cockpit/abd-exam-finding-schema";
import {
  CNS_EXAM_SUBSECTIONS,
  CNS_SUBSECTION_NOTES_FINDINGS,
  CNS_STRUCTURED_FINDING_ORDER,
  listCnsSubsectionChips,
  resolveCnsExamFinding,
  resolveCnsSubsectionNotesLabel,
} from "@/lib/cockpit/cns-exam-finding-schema";
import {
  LYMPH_SITES_JSON_KEY,
  lymphAttributesHaveContent,
  lymphDerivedDetail,
  lymphPreviewParts,
  migrateLymphadenopathyAttributes,
  parseLymphSites,
  serializeLymphSites,
} from "@/lib/cockpit/lymphadenopathy-sites";
import { migrateClubbingAttributes } from "@/lib/cockpit/clubbing-grade";
import {
  EDEMA_SITES_JSON_KEY,
  edemaAttributesHaveContent,
  edemaDerivedDetail,
  edemaPreviewParts,
  migrateEdemaAttributes,
  parseEdemaSites,
  serializeEdemaSites,
} from "@/lib/cockpit/edema-sites";
import { listExamSystemChips, resolveExamSystem } from "@/lib/cockpit/exam-schema";
import type { ExamFindingEntry, ExamSystemFinding } from "@/types/prescription";

const GENERAL_FINDING_ORDER = GENERAL_EXAM_SUBSECTIONS.flatMap((subsection) => {
  const findingIds = listGeneralExamFindingsForSubsection(subsection.id).map((f) => f.findingId);
  const notesId = generalSubsectionNotesFindingId(subsection.id);
  return notesId ? [...findingIds, notesId] : findingIds;
});

const CVS_CHIP_FINDING_ORDER = CVS_EXAM_SUBSECTIONS.flatMap((subsection) => {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => {
      const notesMeta = CVS_AUSCULTATION_CHIP_GROUP_NOTES.find((row) => row.groupId === group.id);
      const chipIds = group.chips.map((chip) => chipLabelToFindingId(chip));
      return notesMeta ? [notesMeta.findingId, ...chipIds] : chipIds;
    });
  }
  return listCvsSubsectionChips(subsection).map((chip) => chipLabelToFindingId(chip));
});
const CVS_FINDING_ORDER = [
  CVS_INSPECTION_NOTES_FINDING_ID,
  ...CVS_STRUCTURED_FINDING_ORDER,
  ...CVS_CHIP_FINDING_ORDER,
];

const RESP_CHIP_FINDING_ORDER = RESP_EXAM_SUBSECTIONS.flatMap((subsection) => {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => {
      const notesMeta = RESP_AUSCULTATION_CHIP_GROUP_NOTES.find((row) => row.groupId === group.id);
      const chipIds = group.chips.map((chip) => chipLabelToFindingId(chip));
      return notesMeta ? [notesMeta.findingId, ...chipIds] : chipIds;
    });
  }
  return listRespSubsectionChips(subsection).map((chip) => chipLabelToFindingId(chip));
});
const RESP_FINDING_ORDER = [
  ...RESP_SUBSECTION_NOTES_FINDINGS.map((row) => row.findingId),
  ...RESP_STRUCTURED_FINDING_ORDER,
  ...RESP_CHIP_FINDING_ORDER,
];

const ABD_CHIP_FINDING_ORDER = ABD_EXAM_SUBSECTIONS.flatMap((subsection) => {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => {
      const notesMeta = ABD_CHIP_GROUP_NOTES.find((row) => row.groupId === group.id);
      const chipIds = group.chips.map((chip) => chipLabelToFindingId(chip));
      return notesMeta ? [notesMeta.findingId, ...chipIds] : chipIds;
    });
  }
  return listAbdSubsectionChips(subsection).map((chip) => chipLabelToFindingId(chip));
});
const ABD_FINDING_ORDER = [
  ...ABD_SUBSECTION_NOTES_FINDINGS.map((row) => row.findingId),
  ...ABD_STRUCTURED_FINDING_ORDER,
  ...ABD_CHIP_FINDING_ORDER,
];

const CNS_CHIP_FINDING_ORDER = CNS_EXAM_SUBSECTIONS.flatMap((subsection) =>
  listCnsSubsectionChips(subsection).map((chip) => chipLabelToFindingId(chip)),
);
const CNS_FINDING_ORDER = [
  ...CNS_SUBSECTION_NOTES_FINDINGS.map((row) => row.findingId),
  ...CNS_STRUCTURED_FINDING_ORDER,
  ...CNS_CHIP_FINDING_ORDER,
];

function renderCvsInspectionNotesEntry(entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `Inspection: ${notes}` : "Inspection";
}

function cvsInspectionNotesPreview(entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `Inspection · ${notes}` : "Inspection";
}

function renderCvsChipGroupNotesEntry(
  label: string,
  entry: ExamFindingEntry,
): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function cvsChipGroupNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderRespSubsectionNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function respSubsectionNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderRespChipGroupNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function respChipGroupNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderAbdSubsectionNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function abdSubsectionNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderAbdChipGroupNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function abdChipGroupNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderCnsSubsectionNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function cnsSubsectionNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

function renderGeneralSubsectionNotesEntry(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label}: ${notes}` : label;
}

function generalSubsectionNotesPreview(label: string, entry: ExamFindingEntry): string {
  const notes = entry.attributes?.notes?.trim();
  return notes ? `${label} · ${notes}` : label;
}

/** Stable slug from a chip label (`Peripheral edema` → `peripheral_edema`). */
export function chipLabelToFindingId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Map legacy chip label to general findingId when possible. */
function legacyLabelToGeneralFindingId(label: string): string | null {
  const slug = chipLabelToFindingId(label);
  if (resolveGeneralExamFinding(slug)) return slug;
  const byLabel = GENERAL_EXAM_FINDINGS.find(
    (f) => f.label.toLowerCase() === label.trim().toLowerCase(),
  );
  return byLabel?.findingId ?? null;
}

function sanitizeAttributes(
  raw: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    if (value.trim() === "") continue;
    out[key] = value;
  }
  return out;
}

/** Normalize one raw findings-array element (legacy string or structured object). */
export function normalizeExamFindingEntry(raw: unknown): ExamFindingEntry | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const generalId = legacyLabelToGeneralFindingId(trimmed);
    return { findingId: generalId ?? chipLabelToFindingId(trimmed), attributes: {} };
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const findingId =
    typeof row.findingId === "string"
      ? row.findingId.trim()
      : typeof row.id === "string"
        ? row.id.trim()
        : "";
  if (!findingId) return null;
  let attributes = sanitizeAttributes(row.attributes as Record<string, unknown> | undefined);
  if (findingId === "cyanosis") {
    attributes = migrateCyanosisAttributes(attributes);
  }
  if (findingId === "edema") {
    attributes = migrateEdemaAttributes(attributes);
  }
  if (findingId === "clubbing") {
    attributes = migrateClubbingAttributes(attributes);
  }
  if (findingId === "lymphadenopathy") {
    attributes = migrateLymphadenopathyAttributes(attributes);
  }
  const migrated = migrateCvsFindingEntry({ findingId, attributes });
  return migrated;
}

export function normalizeExamFindingEntries(
  raw: unknown[] | null | undefined,
): ExamFindingEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamFindingEntry[] = [];
  for (const item of raw) {
    const entry = normalizeExamFindingEntry(item);
    if (entry) out.push(entry);
  }
  return out;
}

export function findExamFindingEntry(
  entries: readonly ExamFindingEntry[],
  findingId: string,
): ExamFindingEntry | undefined {
  return entries.find((e) => e.findingId === findingId);
}

function labelForNonGeneralFindingId(systemId: string, findingId: string): string {
  if (systemId === "cvs") {
    const structured = resolveCvsExamFinding(findingId);
    if (structured) return structured.label;
  }
  if (systemId === "resp") {
    const structured = resolveRespExamFinding(findingId);
    if (structured) return structured.label;
  }
  if (systemId === "abd") {
    const structured = resolveAbdExamFinding(findingId);
    if (structured) return structured.label;
  }
  if (systemId === "cns") {
    const structured = resolveCnsExamFinding(findingId);
    if (structured) return structured.label;
  }
  const def = resolveExamSystem(systemId);
  const chips = listExamSystemChips(def);
  const match = chips.find((chip) => chipLabelToFindingId(chip) === findingId);
  if (match) return match;
  return findingId
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cvsAttributePreviewParts(
  def: ReturnType<typeof resolveCvsExamFinding>,
  attributes: Record<string, string>,
): string[] {
  if (!def) return Object.values(attributes).filter(Boolean);
  const parts: string[] = [];
  if (def.fieldGroups) {
    for (const group of def.fieldGroups) {
      parts.push(...splitCommaSeparated(attributes[group.attributeKey]));
    }
  }
  for (const field of def.fields) {
    const value = attributes[field.key]?.trim();
    if (!value) continue;
    if (field.key === "heightCm") {
      parts.push(`${value} cm`);
      continue;
    }
    if (field.type === "chips") {
      const chips = splitCommaSeparated(value).filter(
        (chip) => chip.toLowerCase() !== "none",
      );
      parts.push(...chips);
    } else {
      parts.push(value);
    }
  }
  return parts;
}

function respAttributePreviewParts(
  def: ReturnType<typeof resolveRespExamFinding>,
  attributes: Record<string, string>,
): string[] {
  if (!def) return Object.values(attributes).filter(Boolean);
  const parts: string[] = [];
  if (def.fieldGroups) {
    for (const group of def.fieldGroups) {
      parts.push(...splitCommaSeparated(attributes[group.attributeKey]));
    }
  }
  for (const field of def.fields) {
    const value = attributes[field.key]?.trim();
    if (!value) continue;
    if (field.type === "chips") {
      const chips = splitCommaSeparated(value).filter(
        (chip) => chip.toLowerCase() !== "none",
      );
      parts.push(...chips);
    } else {
      parts.push(value);
    }
  }
  return parts;
}

function abdAttributePreviewParts(
  def: ReturnType<typeof resolveAbdExamFinding>,
  attributes: Record<string, string>,
): string[] {
  if (!def) return Object.values(attributes).filter(Boolean);
  const parts: string[] = [];
  if (def.fieldGroups) {
    for (const group of def.fieldGroups) {
      parts.push(...splitCommaSeparated(attributes[group.attributeKey]));
    }
  }
  for (const field of def.fields) {
    const value = attributes[field.key]?.trim();
    if (!value) continue;
    if (field.type === "chips") {
      const chips = splitCommaSeparated(value).filter(
        (chip) => chip.toLowerCase() !== "none",
      );
      parts.push(...chips);
    } else {
      parts.push(value);
    }
  }
  return parts;
}

function cnsAttributePreviewParts(
  def: ReturnType<typeof resolveCnsExamFinding>,
  attributes: Record<string, string>,
): string[] {
  if (!def) return Object.values(attributes).filter(Boolean);
  const parts: string[] = [];
  if (def.fieldGroups) {
    for (const group of def.fieldGroups) {
      parts.push(...splitCommaSeparated(attributes[group.attributeKey]));
    }
  }
  for (const field of def.fields) {
    const value = attributes[field.key]?.trim();
    if (!value) continue;
    if (field.type === "chips") {
      const chips = splitCommaSeparated(value).filter(
        (chip) => chip.toLowerCase() !== "none",
      );
      parts.push(...chips);
    } else {
      parts.push(value);
    }
  }
  return parts;
}

/** Whether a CVS structured finding entry has documentable detail. */
export function cvsFindingEntryHasAttributes(entry: ExamFindingEntry): boolean {
  return Object.values(entry.attributes ?? {}).some((v) => v.trim().length > 0);
}

/** Attribute-only preview for CVS structured finding cards. */
export function cvsFindingAttributesPreview(entry: ExamFindingEntry): string {
  const def = resolveCvsExamFinding(entry.findingId);
  const parts = cvsAttributePreviewParts(def, entry.attributes ?? {});
  return parts.join(" · ");
}

/** One-line preview for a CVS finding entry (structured card or chip). */
export function cvsFindingEntryPreview(entry: ExamFindingEntry): string {
  if (entry.findingId === CVS_INSPECTION_NOTES_FINDING_ID) {
    return cvsInspectionNotesPreview(entry);
  }
  const chipGroupNotes = resolveCvsAuscultationChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return cvsChipGroupNotesPreview(chipGroupNotes.label, entry);
  }
  const structured = resolveCvsExamFinding(entry.findingId);
  if (structured) {
    const parts = cvsAttributePreviewParts(structured, entry.attributes ?? {});
    return parts.length > 0 ? `${structured.label} · ${parts.join(" · ")}` : structured.label;
  }
  return labelForNonGeneralFindingId("cvs", entry.findingId);
}

/** Derived-text fragment for one CVS structured finding entry. */
export function renderCvsFindingEntry(entry: ExamFindingEntry): string {
  if (entry.findingId === CVS_INSPECTION_NOTES_FINDING_ID) {
    return renderCvsInspectionNotesEntry(entry);
  }
  const chipGroupNotes = resolveCvsAuscultationChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return renderCvsChipGroupNotesEntry(chipGroupNotes.label, entry);
  }
  const structured = resolveCvsExamFinding(entry.findingId);
  if (!structured) {
    return labelForNonGeneralFindingId("cvs", entry.findingId);
  }
  const parts = cvsAttributePreviewParts(structured, entry.attributes ?? {});
  return parts.length > 0 ? `${structured.label} (${parts.join(", ")})` : structured.label;
}

/** Whether a Resp structured finding entry has documentable detail. */
export function respFindingEntryHasAttributes(entry: ExamFindingEntry): boolean {
  return Object.values(entry.attributes ?? {}).some((v) => v.trim().length > 0);
}

/** Attribute-only preview for Resp structured finding cards. */
export function respFindingAttributesPreview(entry: ExamFindingEntry): string {
  const def = resolveRespExamFinding(entry.findingId);
  const parts = respAttributePreviewParts(def, entry.attributes ?? {});
  return parts.join(" · ");
}

/** One-line preview for a Resp finding entry (structured card or chip). */
export function respFindingEntryPreview(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveRespSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return respSubsectionNotesPreview(subsectionNotesLabel, entry);
  }
  const chipGroupNotes = resolveRespAuscultationChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return respChipGroupNotesPreview(chipGroupNotes.label, entry);
  }
  const structured = resolveRespExamFinding(entry.findingId);
  if (structured) {
    const parts = respAttributePreviewParts(structured, entry.attributes ?? {});
    return parts.length > 0 ? `${structured.label} · ${parts.join(" · ")}` : structured.label;
  }
  return labelForNonGeneralFindingId("resp", entry.findingId);
}

/** Derived-text fragment for one Resp structured finding entry. */
export function renderRespFindingEntry(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveRespSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return renderRespSubsectionNotesEntry(subsectionNotesLabel, entry);
  }
  const chipGroupNotes = resolveRespAuscultationChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return renderRespChipGroupNotesEntry(chipGroupNotes.label, entry);
  }
  const structured = resolveRespExamFinding(entry.findingId);
  if (!structured) {
    return labelForNonGeneralFindingId("resp", entry.findingId);
  }
  const parts = respAttributePreviewParts(structured, entry.attributes ?? {});
  return parts.length > 0 ? `${structured.label} (${parts.join(", ")})` : structured.label;
}

/** Whether an Abdomen structured finding entry has documentable detail. */
export function abdFindingEntryHasAttributes(entry: ExamFindingEntry): boolean {
  return Object.values(entry.attributes ?? {}).some((v) => v.trim().length > 0);
}

/** Attribute-only preview for Abdomen structured finding cards. */
export function abdFindingAttributesPreview(entry: ExamFindingEntry): string {
  const def = resolveAbdExamFinding(entry.findingId);
  const parts = abdAttributePreviewParts(def, entry.attributes ?? {});
  return parts.join(" · ");
}

/** One-line preview for an Abdomen finding entry (structured card or chip). */
export function abdFindingEntryPreview(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveAbdSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return abdSubsectionNotesPreview(subsectionNotesLabel, entry);
  }
  const chipGroupNotes = resolveAbdChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return abdChipGroupNotesPreview(chipGroupNotes.label, entry);
  }
  const structured = resolveAbdExamFinding(entry.findingId);
  if (structured) {
    const parts = abdAttributePreviewParts(structured, entry.attributes ?? {});
    return parts.length > 0 ? `${structured.label} · ${parts.join(" · ")}` : structured.label;
  }
  return labelForNonGeneralFindingId("abd", entry.findingId);
}

/** Derived-text fragment for one Abdomen structured finding entry. */
export function renderAbdFindingEntry(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveAbdSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return renderAbdSubsectionNotesEntry(subsectionNotesLabel, entry);
  }
  const chipGroupNotes = resolveAbdChipGroupNotesByFindingId(entry.findingId);
  if (chipGroupNotes) {
    return renderAbdChipGroupNotesEntry(chipGroupNotes.label, entry);
  }
  const structured = resolveAbdExamFinding(entry.findingId);
  if (!structured) {
    return labelForNonGeneralFindingId("abd", entry.findingId);
  }
  const parts = abdAttributePreviewParts(structured, entry.attributes ?? {});
  return parts.length > 0 ? `${structured.label} (${parts.join(", ")})` : structured.label;
}

/** Whether a CNS structured finding entry has documentable detail. */
export function cnsFindingEntryHasAttributes(entry: ExamFindingEntry): boolean {
  return Object.values(entry.attributes ?? {}).some((v) => v.trim().length > 0);
}

/** Attribute-only preview for CNS structured finding cards. */
export function cnsFindingAttributesPreview(entry: ExamFindingEntry): string {
  const def = resolveCnsExamFinding(entry.findingId);
  const parts = cnsAttributePreviewParts(def, entry.attributes ?? {});
  return parts.join(" · ");
}

/** One-line preview for a CNS finding entry (structured card or chip). */
export function cnsFindingEntryPreview(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveCnsSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return cnsSubsectionNotesPreview(subsectionNotesLabel, entry);
  }
  const structured = resolveCnsExamFinding(entry.findingId);
  if (structured) {
    const parts = cnsAttributePreviewParts(structured, entry.attributes ?? {});
    return parts.length > 0 ? `${structured.label} · ${parts.join(" · ")}` : structured.label;
  }
  return labelForNonGeneralFindingId("cns", entry.findingId);
}

/** Derived-text fragment for one CNS structured finding entry. */
export function renderCnsFindingEntry(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveCnsSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return renderCnsSubsectionNotesEntry(subsectionNotesLabel, entry);
  }
  const structured = resolveCnsExamFinding(entry.findingId);
  if (!structured) {
    return labelForNonGeneralFindingId("cns", entry.findingId);
  }
  const parts = cnsAttributePreviewParts(structured, entry.attributes ?? {});
  return parts.length > 0 ? `${structured.label} (${parts.join(", ")})` : structured.label;
}

function splitCommaSeparated(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const CYANOSIS_CENTRAL_SITES = new Set(["lips", "tongue", "trunk", "generalized", "oral mucosa"]);
const CYANOSIS_PERIPHERAL_SITES = new Set([
  "fingers/toes",
  "fingers",
  "toes",
  "earlobes/nose",
  "earlobes",
  "nose",
  "acrocyanosis",
]);

function classifyCyanosisSite(site: string): "central" | "peripheral" | null {
  const normalized = site.trim().toLowerCase();
  if (CYANOSIS_CENTRAL_SITES.has(normalized)) return "central";
  if (CYANOSIS_PERIPHERAL_SITES.has(normalized)) return "peripheral";
  if (normalized.includes("finger") || normalized.includes("toe") || normalized.includes("earlobe")) {
    return "peripheral";
  }
  return null;
}

/** Migrate legacy cyanosis `{ type, site }` attrs to grouped site keys. */
export function migrateCyanosisAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  if (attributes.centralSites?.trim() || attributes.peripheralSites?.trim()) {
    return attributes;
  }
  const next = { ...attributes };
  const central: string[] = splitCommaSeparated(next.centralSites);
  const peripheral: string[] = splitCommaSeparated(next.peripheralSites);

  for (const site of splitCommaSeparated(next.site)) {
    const bucket = classifyCyanosisSite(site);
    if (bucket === "central") central.push(site);
    else if (bucket === "peripheral") peripheral.push(site);
  }

  if (central.length > 0) next.centralSites = central.join(", ");
  if (peripheral.length > 0) next.peripheralSites = peripheral.join(", ");
  if (splitCommaSeparated(next.site).length > 0) {
    delete next.type;
    delete next.site;
  }
  return next;
}

export function deriveCyanosisTypeLabel(attributes: Record<string, string>): string | null {
  const attrs = migrateCyanosisAttributes(attributes);
  const hasCentral = splitCommaSeparated(attrs.centralSites).length > 0;
  const hasPeripheral = splitCommaSeparated(attrs.peripheralSites).length > 0;
  if (hasCentral && hasPeripheral) return "Central & peripheral";
  if (hasCentral) return "Central";
  if (hasPeripheral) return "Peripheral";
  const legacyType = attributes.type?.trim();
  if (legacyType?.toLowerCase() === "central") return "Central";
  if (legacyType?.toLowerCase() === "peripheral") return "Peripheral";
  return null;
}

function cyanosisPreviewParts(attributes: Record<string, string>): string[] {
  const attrs = migrateCyanosisAttributes(attributes);
  const parts: string[] = [];
  const typeLabel = deriveCyanosisTypeLabel(attrs);
  if (typeLabel) parts.push(typeLabel);
  parts.push(...splitCommaSeparated(attrs.centralSites));
  parts.push(...splitCommaSeparated(attrs.peripheralSites));
  if (attrs.severity?.trim()) parts.push(attrs.severity.trim());
  parts.push(...splitCommaSeparated(attrs.context));
  if (attrs.notes?.trim()) parts.push(attrs.notes.trim());
  return parts;
}

function cyanosisDerivedDetail(attributes: Record<string, string>): string {
  const attrs = migrateCyanosisAttributes(attributes);
  const segments: string[] = [];
  const central = splitCommaSeparated(attrs.centralSites);
  const peripheral = splitCommaSeparated(attrs.peripheralSites);
  if (central.length > 0) segments.push(`Central: ${central.join(", ")}`);
  if (peripheral.length > 0) segments.push(`Peripheral: ${peripheral.join(", ")}`);
  const tail: string[] = [];
  if (attrs.severity?.trim()) tail.push(attrs.severity.trim());
  tail.push(...splitCommaSeparated(attrs.context));
  if (attrs.notes?.trim()) tail.push(attrs.notes.trim());
  if (tail.length > 0) segments.push(tail.join(", "));
  return segments.join("; ");
}
function attributePreviewParts(
  def: ReturnType<typeof resolveGeneralExamFinding>,
  attributes: Record<string, string>,
): string[] {
  if (!def) return Object.values(attributes).filter(Boolean);
  if (def.findingId === "cyanosis") {
    return cyanosisPreviewParts(attributes);
  }
  if (def.findingId === "edema") {
    return edemaPreviewParts(attributes);
  }
  if (def.findingId === "lymphadenopathy") {
    return lymphPreviewParts(attributes);
  }
  const parts: string[] = [];
  if (def.fieldGroups) {
    for (const group of def.fieldGroups) {
      parts.push(...splitCommaSeparated(attributes[group.attributeKey]));
    }
  }
  for (const field of def.fields) {
    const value = attributes[field.key]?.trim();
    if (!value) continue;
    if (field.type === "chips") {
      parts.push(...splitCommaSeparated(value));
    } else {
      parts.push(value);
    }
  }
  return parts;
}

/** One-line preview for a general finding entry (collapsed card header). */
export function generalFindingEntryPreview(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveGeneralSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return generalSubsectionNotesPreview(subsectionNotesLabel, entry);
  }
  const def = resolveGeneralExamFinding(entry.findingId);
  const label = def?.label ?? entry.findingId;
  const parts = attributePreviewParts(def, entry.attributes ?? {});
  return parts.length > 0 ? `${label} · ${parts.join(" · ")}` : label;
}

/** Attribute-only preview for in-card collapsed rows (label is shown separately). */
export function generalFindingAttributesPreview(entry: ExamFindingEntry): string {
  const def = resolveGeneralExamFinding(entry.findingId);
  const parts = attributePreviewParts(def, entry.attributes ?? {});
  return parts.join(" · ");
}

/** Derived-text fragment for one general finding entry. */
export function renderGeneralFindingEntry(entry: ExamFindingEntry): string {
  const subsectionNotesLabel = resolveGeneralSubsectionNotesLabel(entry.findingId);
  if (subsectionNotesLabel) {
    return renderGeneralSubsectionNotesEntry(subsectionNotesLabel, entry);
  }
  const def = resolveGeneralExamFinding(entry.findingId);
  const label = def?.label ?? entry.findingId;
  const attrs = entry.attributes ?? {};
  if (entry.findingId === "cyanosis") {
    const detail = cyanosisDerivedDetail(attrs);
    return detail ? `${label} (${detail})` : label;
  }
  if (entry.findingId === "edema") {
    const detail = edemaDerivedDetail(attrs);
    return detail ? `${label} (${detail})` : label;
  }
  if (entry.findingId === "lymphadenopathy") {
    const detail = lymphDerivedDetail(attrs);
    return detail ? `${label} (${detail})` : label;
  }
  const parts = attributePreviewParts(def, attrs);
  return parts.length > 0 ? `${label} (${parts.join(", ")})` : label;
}

/** Derived-text fragment for a non-general structured entry. */
export function renderDefaultFindingEntry(
  systemId: string,
  entry: ExamFindingEntry,
): string {
  const label = labelForNonGeneralFindingId(systemId, entry.findingId);
  const attrs = Object.values(entry.attributes ?? {})
    .map((v) => v.trim())
    .filter(Boolean);
  return attrs.length > 0 ? `${label} (${attrs.join(", ")})` : label;
}

export function renderFindingEntry(
  systemId: string,
  entry: ExamFindingEntry,
): string {
  if (systemId === "general") return renderGeneralFindingEntry(entry);
  if (systemId === "cvs") return renderCvsFindingEntry(entry);
  if (systemId === "resp") return renderRespFindingEntry(entry);
  if (systemId === "abd") return renderAbdFindingEntry(entry);
  if (systemId === "cns") return renderCnsFindingEntry(entry);
  return renderDefaultFindingEntry(systemId, entry);
}

function sortCvsEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  return [...entries].sort((a, b) => {
    const ai = CVS_FINDING_ORDER.indexOf(a.findingId);
    const bi = CVS_FINDING_ORDER.indexOf(b.findingId);
    const aRank = ai === -1 ? CVS_FINDING_ORDER.length : ai;
    const bRank = bi === -1 ? CVS_FINDING_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.findingId.localeCompare(b.findingId);
  });
}

function sortRespEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  return [...entries].sort((a, b) => {
    const ai = RESP_FINDING_ORDER.indexOf(a.findingId);
    const bi = RESP_FINDING_ORDER.indexOf(b.findingId);
    const aRank = ai === -1 ? RESP_FINDING_ORDER.length : ai;
    const bRank = bi === -1 ? RESP_FINDING_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.findingId.localeCompare(b.findingId);
  });
}

function sortAbdEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  return [...entries].sort((a, b) => {
    const ai = ABD_FINDING_ORDER.indexOf(a.findingId);
    const bi = ABD_FINDING_ORDER.indexOf(b.findingId);
    const aRank = ai === -1 ? ABD_FINDING_ORDER.length : ai;
    const bRank = bi === -1 ? ABD_FINDING_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.findingId.localeCompare(b.findingId);
  });
}

function sortCnsEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  return [...entries].sort((a, b) => {
    const ai = CNS_FINDING_ORDER.indexOf(a.findingId);
    const bi = CNS_FINDING_ORDER.indexOf(b.findingId);
    const aRank = ai === -1 ? CNS_FINDING_ORDER.length : ai;
    const bRank = bi === -1 ? CNS_FINDING_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.findingId.localeCompare(b.findingId);
  });
}

function sortGeneralEntries(entries: ExamFindingEntry[]): ExamFindingEntry[] {
  return [...entries].sort((a, b) => {
    const ai = GENERAL_FINDING_ORDER.indexOf(a.findingId);
    const bi = GENERAL_FINDING_ORDER.indexOf(b.findingId);
    const aRank = ai === -1 ? GENERAL_FINDING_ORDER.length : ai;
    const bRank = bi === -1 ? GENERAL_FINDING_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.findingId.localeCompare(b.findingId);
  });
}

/** Render the abnormal-finding body for one exam system row (derived text). */
export function renderExamSystemFindingBody(finding: ExamSystemFinding): string {
  const entries = finding.findings ?? [];
  if (entries.length === 0) return "Abnormal";
  const sorted =
    finding.systemId === "general"
      ? sortGeneralEntries(entries)
      : finding.systemId === "cvs"
        ? sortCvsEntries(entries)
        : finding.systemId === "resp"
          ? sortRespEntries(entries)
          : finding.systemId === "abd"
            ? sortAbdEntries(entries)
            : finding.systemId === "cns"
              ? sortCnsEntries(entries)
              : [...entries];
  return sorted.map((e) => renderFindingEntry(finding.systemId, e)).join("; ");
}

/** Collapsed system-card preview for abnormal general (and other) systems. */
export function examSystemPreviewText(finding: ExamSystemFinding | undefined): string | null {
  if (!finding) return null;
  if (finding.systemId === "additional_notes" || finding.systemId === "objective_notes") {
    return finding.notes?.trim() || null;
  }
  if (finding.status === "normal") {
    return resolveExamSystem(finding.systemId).normalLine;
  }
  const entries = finding.findings ?? [];
  if (entries.length > 0) {
    const sorted =
      finding.systemId === "general"
        ? sortGeneralEntries(entries)
        : finding.systemId === "cvs"
          ? sortCvsEntries(entries)
          : finding.systemId === "resp"
            ? sortRespEntries(entries)
            : finding.systemId === "abd"
              ? sortAbdEntries(entries)
              : finding.systemId === "cns"
                ? sortCnsEntries(entries)
                : [...entries];
    return sorted
      .map((e) =>
        finding.systemId === "general"
          ? generalFindingEntryPreview(e)
          : finding.systemId === "cvs"
            ? cvsFindingEntryPreview(e)
            : finding.systemId === "resp"
              ? respFindingEntryPreview(e)
              : finding.systemId === "abd"
                ? abdFindingEntryPreview(e)
                : finding.systemId === "cns"
                  ? cnsFindingEntryPreview(e)
                  : renderFindingEntry(finding.systemId, e),
      )
      .join(" · ");
  }
  return finding.notes?.trim() || "Abnormal";
}

export function createEmptyFindingEntry(findingId: string): ExamFindingEntry {
  return { findingId, attributes: {} };
}

export function patchFindingEntryAttributes(
  entry: ExamFindingEntry,
  patch: Record<string, string | null | undefined>,
): ExamFindingEntry {
  const next = { ...(entry.attributes ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  const attributes =
    entry.findingId === "cyanosis"
      ? migrateCyanosisAttributes(next)
      : entry.findingId === "edema"
        ? migrateEdemaAttributes(next)
        : entry.findingId === "clubbing"
          ? migrateClubbingAttributes(next)
          : entry.findingId === "lymphadenopathy"
            ? migrateLymphadenopathyAttributes(next)
            : next;
  return { ...entry, attributes };
}

export function setEdemaSites(
  entry: ExamFindingEntry,
  sites: Parameters<typeof serializeEdemaSites>[0],
): ExamFindingEntry {
  if (sites.length === 0) {
    return { findingId: entry.findingId, attributes: {} };
  }
  return {
    findingId: entry.findingId,
    attributes: { [EDEMA_SITES_JSON_KEY]: serializeEdemaSites(sites) },
  };
}

export function setLymphadenopathySites(
  entry: ExamFindingEntry,
  sites: Parameters<typeof serializeLymphSites>[0],
): ExamFindingEntry {
  if (sites.length === 0) {
    return { findingId: entry.findingId, attributes: {} };
  }
  return {
    findingId: entry.findingId,
    attributes: { [LYMPH_SITES_JSON_KEY]: serializeLymphSites(sites) },
  };
}

export function findingEntryHasAttributes(entry: ExamFindingEntry): boolean {
  if (resolveGeneralSubsectionNotesLabel(entry.findingId)) {
    return Boolean(entry.attributes?.notes?.trim());
  }
  if (entry.findingId === "edema") {
    return edemaAttributesHaveContent(entry.attributes ?? {});
  }
  if (entry.findingId === "lymphadenopathy") {
    return lymphAttributesHaveContent(entry.attributes ?? {});
  }
  if (resolveCvsExamFinding(entry.findingId)) {
    return cvsFindingEntryHasAttributes(entry);
  }
  if (resolveRespExamFinding(entry.findingId)) {
    return respFindingEntryHasAttributes(entry);
  }
  if (resolveAbdExamFinding(entry.findingId)) {
    return abdFindingEntryHasAttributes(entry);
  }
  if (resolveCnsExamFinding(entry.findingId)) {
    return cnsFindingEntryHasAttributes(entry);
  }
  return Object.values(entry.attributes ?? {}).some((v) => v.trim().length > 0);
}
