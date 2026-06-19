import {
  filterPastSurgicalProcedureCatalog,
  pastSurgicalProcedureLabel,
  PAST_SURGICAL_PROCEDURE_CATALOG,
  resolvePastSurgicalCatalogProcedure,
  type PastSurgicalCatalogProcedure,
} from "@/lib/cockpit/past-surgical-procedures";

export type PastSurgicalProcedure = PastSurgicalCatalogProcedure;
export type PastSurgicalAgoUnit = "days" | "weeks" | "months" | "years";

export interface PastSurgicalProcedureEntry {
  id: string;
  procedure: PastSurgicalProcedure | "other";
  procedureOther?: string;
  agoValue?: number;
  agoUnit?: PastSurgicalAgoUnit;
  notes?: string;
}

export interface PastSurgicalHistoryStructured {
  none?: boolean;
  procedures?: PastSurgicalProcedureEntry[];
  notes?: string;
}

export const PAST_SURGICAL_AGO_UNITS: readonly { value: PastSurgicalAgoUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
  { value: "years", label: "years" },
] as const;

export const PAST_SURGICAL_AGO_VALUE_MAX = 120;

export const PAST_SURGICAL_PROCEDURE_OPTIONS = PAST_SURGICAL_PROCEDURE_CATALOG.map((def) => ({
  value: def.value,
  label: def.label,
}));

export const PAST_SURGICAL_PROCEDURE_NOTE_PLACEHOLDER = "Note (optional)";
export const PAST_SURGICAL_PROCEDURE_OTHER_MAX = 120;
export const PAST_SURGICAL_PROCEDURE_NOTE_MAX = 200;
export const PAST_SURGICAL_SECTION_NOTES_MAX = 2000;
export const PAST_SURGICAL_SECTION_NOTES_PLACEHOLDER =
  "e.g. Multiple laparotomies, surgery abroad";
export const MAX_PAST_SURGICAL_PROCEDURES = 20;

export const EMPTY_PAST_SURGICAL_HISTORY_STRUCTURED: PastSurgicalHistoryStructured = {};

const LEGACY_NONE_PATTERNS = [
  /^no prior surgeries$/i,
  /^no previous surgeries$/i,
  /^no prior surgery$/i,
  /^no previous surgery$/i,
  /^none$/i,
  /^nps$/i,
  /^nil$/i,
];

const AGO_UNIT_SINGULAR: Record<PastSurgicalAgoUnit, string> = {
  days: "day",
  weeks: "week",
  months: "month",
  years: "year",
};

function createEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `psh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isStructuredInput(
  input: PastSurgicalHistoryStructured | string | null | undefined,
): input is PastSurgicalHistoryStructured {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isCatalogProcedure(value: string): value is PastSurgicalProcedure {
  return PAST_SURGICAL_PROCEDURE_CATALOG.some((def) => def.value === value);
}

export function isPastSurgicalAgoUnit(value: string): value is PastSurgicalAgoUnit {
  return value === "days" || value === "weeks" || value === "months" || value === "years";
}

export function formatPastSurgicalAgo(
  agoValue?: number,
  agoUnit?: PastSurgicalAgoUnit,
): string {
  if (agoValue == null || !agoUnit || agoValue <= 0) return "";
  const unitLabel = agoValue === 1 ? AGO_UNIT_SINGULAR[agoUnit] : agoUnit;
  return `${agoValue} ${unitLabel} ago`;
}

export function parsePastSurgicalAgoFromText(
  text: string,
): Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit"> | null {
  const trimmed = text.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)\s+ago$/);
  if (!match) return null;
  const agoValue = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(agoValue) || agoValue <= 0) return null;
  const unitRaw = match[2]!;
  const unitMap: Record<string, PastSurgicalAgoUnit> = {
    day: "days",
    days: "days",
    week: "weeks",
    weeks: "weeks",
    month: "months",
    months: "months",
    year: "years",
    years: "years",
  };
  const agoUnit = unitMap[unitRaw];
  if (!agoUnit) return null;
  return { agoValue, agoUnit };
}

function normalizeAgoFields(
  source: Partial<PastSurgicalProcedureEntry> & { year?: string },
): Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit"> {
  const next: Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit"> = {};

  if (
    typeof source.agoValue === "number" &&
    Number.isFinite(source.agoValue) &&
    source.agoValue > 0 &&
    source.agoUnit &&
    isPastSurgicalAgoUnit(source.agoUnit)
  ) {
    const rounded = Math.min(Math.floor(source.agoValue), PAST_SURGICAL_AGO_VALUE_MAX);
    next.agoValue = rounded;
    next.agoUnit = source.agoUnit;
    return next;
  }

  if (source.year?.trim()) {
    const parsed = parsePastSurgicalAgoFromText(source.year);
    if (parsed) return parsed;
  }

  return next;
}

function normalizeEntry(
  raw: unknown,
  options: { preserveWhitespace?: boolean } = {},
): PastSurgicalProcedureEntry | null {
  const preserveWhitespace = options.preserveWhitespace ?? false;
  if (raw && typeof raw === "object" && "procedure" in raw) {
    const source = raw as Partial<PastSurgicalProcedureEntry> & {
      year?: string;
      side?: string;
      approach?: string;
      complication?: boolean;
      complicationNote?: string;
    };
    const procedure = source.procedure;
    if (!procedure) return null;

    const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : createEntryId();
    const notes = preserveWhitespace ? source.notes : source.notes?.trim();
    const ago = normalizeAgoFields(source);

    const legacyNoteParts: string[] = [];
    if (source.year?.trim() && !ago.agoValue) {
      legacyNoteParts.push(source.year.trim());
    }
    if (source.side?.trim()) legacyNoteParts.push(source.side.trim());
    if (source.approach?.trim()) legacyNoteParts.push(source.approach.trim());
    if (source.complication === false) legacyNoteParts.push("uneventful");
    if (source.complication === true) {
      legacyNoteParts.push(
        source.complicationNote?.trim()
          ? `complication: ${source.complicationNote.trim()}`
          : "complication",
      );
    }

    const mergedNotes = [notes, legacyNoteParts.join(", ")].filter(Boolean).join("; ") || undefined;

    if (procedure === "other") {
      const procedureOther = preserveWhitespace
        ? source.procedureOther
        : source.procedureOther?.trim();
      if (!preserveWhitespace && !procedureOther) {
        return { id, procedure: "other", ...ago, ...(mergedNotes ? { notes: mergedNotes } : {}) };
      }
      return {
        id,
        procedure: "other",
        ...(procedureOther ? { procedureOther } : {}),
        ...ago,
        ...(mergedNotes ? { notes: mergedNotes } : {}),
      };
    }

    if (!isCatalogProcedure(procedure)) return null;
    return {
      id,
      procedure,
      ...ago,
      ...(mergedNotes ? { notes: mergedNotes } : {}),
    };
  }
  return null;
}

function normalizeProcedureEntries(
  raw: unknown,
  options: { preserveWhitespace?: boolean } = {},
): PastSurgicalProcedureEntry[] {
  if (!Array.isArray(raw)) return [];
  const catalogSeen = new Set<PastSurgicalProcedure>();
  const customSeen = new Set<string>();
  const entries: PastSurgicalProcedureEntry[] = [];
  for (const item of raw) {
    const entry = normalizeEntry(item, options);
    if (!entry) continue;
    if (entry.procedure === "other") {
      const key = entry.procedureOther?.trim().toLowerCase() ?? "";
      if (key && customSeen.has(key)) continue;
      if (key) customSeen.add(key);
      entries.push(entry);
      continue;
    }
    if (catalogSeen.has(entry.procedure)) continue;
    catalogSeen.add(entry.procedure);
    entries.push(entry);
  }
  return entries;
}

export function resolveCatalogProcedureFromQuery(
  value: string,
): PastSurgicalProcedure | undefined {
  return resolvePastSurgicalCatalogProcedure(value);
}

export function pastSurgicalProcedureEntryLabel(entry: PastSurgicalProcedureEntry): string {
  if (entry.procedure === "other") {
    return entry.procedureOther?.trim() || "Other procedure";
  }
  return pastSurgicalProcedureLabel(entry.procedure);
}

export function getPastSurgicalProcedureEntries(
  structured: PastSurgicalHistoryStructured,
): PastSurgicalProcedureEntry[] {
  return Array.isArray(structured.procedures) ? structured.procedures : [];
}

export function availablePastSurgicalCatalogProcedures(
  entries: PastSurgicalProcedureEntry[],
): typeof PAST_SURGICAL_PROCEDURE_OPTIONS {
  const selected = new Set(
    entries.filter((entry) => entry.procedure !== "other").map((entry) => entry.procedure),
  );
  return PAST_SURGICAL_PROCEDURE_OPTIONS.filter((option) => !selected.has(option.value));
}

export function hasPastSurgicalHistoryStructuredContent(
  structured: PastSurgicalHistoryStructured,
): boolean {
  if (structured.none) return true;
  if (structured.notes?.trim()) return true;
  if (getPastSurgicalProcedureEntries(structured).length > 0) return true;
  return false;
}

export function normalizePastSurgicalHistoryStructured(
  input: PastSurgicalHistoryStructured,
  options: { keepEmptyProcedureRows?: boolean } = {},
): PastSurgicalHistoryStructured {
  const keepEmpty = options.keepEmptyProcedureRows ?? false;
  const preserveWhitespace = keepEmpty;
  const next: PastSurgicalHistoryStructured = {};

  if (input.none) {
    next.none = true;
    return next;
  }

  const procedures = normalizeProcedureEntries(input.procedures, { preserveWhitespace });
  if (procedures.length > 0 || (keepEmpty && input.procedures != null)) {
    next.procedures = procedures.length > 0 ? procedures : [];
  }

  if (preserveWhitespace) {
    if (input.notes != null && input.notes !== "") next.notes = input.notes;
  } else {
    const notes = input.notes?.trim();
    if (notes) next.notes = notes;
  }

  return next;
}

function serializeEntry(entry: PastSurgicalProcedureEntry): string {
  const label = pastSurgicalProcedureEntryLabel(entry);
  const ago = formatPastSurgicalAgo(entry.agoValue, entry.agoUnit);
  const note = entry.notes?.trim();

  const innerParts: string[] = [];
  if (ago) innerParts.push(ago);
  if (note) innerParts.push(note);

  if (innerParts.length === 0) return label;
  return `${label} (${innerParts.join(", ")})`;
}

export function serializePastSurgicalHistory(
  structured: PastSurgicalHistoryStructured,
): string {
  const normalized = normalizePastSurgicalHistoryStructured(structured);
  if (!hasPastSurgicalHistoryStructuredContent(normalized)) return "";

  if (normalized.none) return "No prior surgeries";

  const parts: string[] = [];
  const entries = getPastSurgicalProcedureEntries(normalized);
  if (entries.length) {
    parts.push(entries.map(serializeEntry).join(", "));
  }
  if (normalized.notes?.trim()) parts.push(normalized.notes.trim());
  return parts.join(" · ");
}

export function formatPastSurgicalHistoryPreview(
  structured: PastSurgicalHistoryStructured,
): string {
  const serialized = serializePastSurgicalHistory(structured);
  if (!serialized) return "";
  return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
}

export function pastSurgicalHistoryFilledCount(
  structured: PastSurgicalHistoryStructured,
): number {
  const normalized = normalizePastSurgicalHistoryStructured(structured, {
    keepEmptyProcedureRows: true,
  });
  if (normalized.none) return 1;
  let count = getPastSurgicalProcedureEntries(normalized).length;
  if (count === 0 && normalized.procedures != null) count = 1;
  if (normalized.notes?.trim()) count += 1;
  return count;
}

function clearNoneFlag(
  structured: PastSurgicalHistoryStructured,
): PastSurgicalHistoryStructured {
  const next = { ...structured };
  delete next.none;
  return next;
}

function splitInnerParts(inner: string): {
  ago?: Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit">;
  notes?: string;
} {
  const parts = inner.split(/,\s*/).map((part) => part.trim()).filter(Boolean);
  let ago: Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit"> | undefined;
  const noteParts: string[] = [];

  for (const part of parts) {
    const parsedAgo = parsePastSurgicalAgoFromText(part);
    if (parsedAgo) {
      ago = parsedAgo;
      continue;
    }
    if (/^\d{4}(?:-\d{2})?$/.test(part)) {
      noteParts.push(part);
      continue;
    }
    noteParts.push(part);
  }

  return {
    ...(ago ? { ago } : {}),
    ...(noteParts.length ? { notes: noteParts.join(", ") } : {}),
  };
}

function parseEntryToken(token: string): Partial<PastSurgicalProcedureEntry> | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (parenMatch) {
    const namePart = parenMatch[1].trim();
    const inner = parenMatch[2].trim();
    const { ago, notes } = splitInnerParts(inner);
    return buildParsedEntry(namePart, ago, notes);
  }

  const yearSuffix = trimmed.match(/^(.+?)\s+(\d{4}(?:-\d{2})?)\s*$/);
  if (yearSuffix) {
    return buildParsedEntry(yearSuffix[1].trim(), undefined, yearSuffix[2]);
  }

  return buildParsedEntry(trimmed);
}

function buildParsedEntry(
  name: string,
  ago?: Pick<PastSurgicalProcedureEntry, "agoValue" | "agoUnit">,
  notes?: string,
): Partial<PastSurgicalProcedureEntry> {
  const catalog = resolvePastSurgicalCatalogProcedure(name);
  const timing = ago ?? {};
  if (catalog) {
    return {
      procedure: catalog,
      ...timing,
      ...(notes ? { notes } : {}),
    };
  }
  return {
    procedure: "other",
    procedureOther: name,
    ...timing,
    ...(notes ? { notes } : {}),
  };
}

function pushParsedEntry(
  structured: PastSurgicalHistoryStructured,
  partial: Partial<PastSurgicalProcedureEntry>,
): void {
  const entries = getPastSurgicalProcedureEntries(structured);
  const id = createEntryId();
  if (partial.procedure === "other") {
    entries.push({
      id,
      procedure: "other",
      ...(partial.procedureOther ? { procedureOther: partial.procedureOther } : {}),
      ...(partial.agoValue ? { agoValue: partial.agoValue } : {}),
      ...(partial.agoUnit ? { agoUnit: partial.agoUnit } : {}),
      ...(partial.notes ? { notes: partial.notes } : {}),
    });
  } else if (partial.procedure && isCatalogProcedure(partial.procedure)) {
    if (entries.some((e) => e.procedure === partial.procedure)) return;
    entries.push({
      id,
      procedure: partial.procedure,
      ...(partial.agoValue ? { agoValue: partial.agoValue } : {}),
      ...(partial.agoUnit ? { agoUnit: partial.agoUnit } : {}),
      ...(partial.notes ? { notes: partial.notes } : {}),
    });
  }
  structured.procedures = entries;
}

export function parsePastSurgicalHistoryAsStructured(
  input: string | PastSurgicalHistoryStructured | null | undefined,
): PastSurgicalHistoryStructured {
  if (isStructuredInput(input)) {
    return normalizePastSurgicalHistoryStructured(input, { keepEmptyProcedureRows: true });
  }

  const text = (input ?? "").trim();
  if (!text) return {};

  if (LEGACY_NONE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { none: true };
  }

  const structured: PastSurgicalHistoryStructured = {};
  const segments = text.split(/\s*·\s*/);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]?.trim() ?? "";
    if (!segment) continue;

    if (i === segments.length - 1 && segments.length > 1 && !segment.includes(",")) {
      const mightBeNote = !resolvePastSurgicalCatalogProcedure(segment);
      if (mightBeNote && !parseEntryToken(segment)?.procedure) {
        structured.notes = segment;
        continue;
      }
    }

    for (const token of segment.split(/,\s*/)) {
      const parsed = parseEntryToken(token);
      if (parsed) pushParsedEntry(structured, parsed);
    }
  }

  return normalizePastSurgicalHistoryStructured(structured, { keepEmptyProcedureRows: true });
}

export function setPastSurgicalHistoryNone(
  structured: PastSurgicalHistoryStructured,
  none: boolean,
): PastSurgicalHistoryStructured {
  if (!none) {
    return normalizePastSurgicalHistoryStructured(clearNoneFlag(structured), {
      keepEmptyProcedureRows: true,
    });
  }
  return { none: true };
}

export function addPastSurgicalCatalogProcedure(
  structured: PastSurgicalHistoryStructured,
  procedure: PastSurgicalProcedure,
): PastSurgicalHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  const entries = [...getPastSurgicalProcedureEntries(next)];
  if (entries.some((entry) => entry.procedure === procedure)) {
    return next;
  }
  if (entries.length >= MAX_PAST_SURGICAL_PROCEDURES) return next;
  entries.push({ id: createEntryId(), procedure });
  next.procedures = entries;
  return next;
}

export function addPastSurgicalOtherProcedure(
  structured: PastSurgicalHistoryStructured,
  procedureOther = "",
): PastSurgicalHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  const entries = [...getPastSurgicalProcedureEntries(next)];
  const trimmedOther = procedureOther.trim();
  if (trimmedOther) {
    const catalogMatch = resolvePastSurgicalCatalogProcedure(trimmedOther);
    if (catalogMatch) {
      return addPastSurgicalCatalogProcedure(next, catalogMatch);
    }
    const duplicate = entries.some(
      (entry) =>
        entry.procedure === "other" &&
        entry.procedureOther?.trim().toLowerCase() === trimmedOther.toLowerCase(),
    );
    if (duplicate) return next;
  }
  if (entries.length >= MAX_PAST_SURGICAL_PROCEDURES) return next;
  entries.push({
    id: createEntryId(),
    procedure: "other",
    ...(trimmedOther ? { procedureOther: trimmedOther } : {}),
  });
  next.procedures = entries;
  return next;
}

function mergeProcedureEntryPatch(
  entry: PastSurgicalProcedureEntry,
  patch: Partial<
    Pick<PastSurgicalProcedureEntry, "procedureOther" | "agoValue" | "agoUnit" | "notes">
  >,
): PastSurgicalProcedureEntry {
  const next = { ...entry };
  if (patch.notes !== undefined) {
    next.notes = patch.notes === "" ? undefined : patch.notes;
  }
  if (entry.procedure === "other" && patch.procedureOther !== undefined) {
    next.procedureOther = patch.procedureOther === "" ? undefined : patch.procedureOther;
  }
  if ("agoValue" in patch) {
    if (patch.agoValue == null || patch.agoValue <= 0) {
      delete next.agoValue;
      delete next.agoUnit;
    } else {
      next.agoValue = Math.min(Math.floor(patch.agoValue), PAST_SURGICAL_AGO_VALUE_MAX);
    }
  }
  if ("agoUnit" in patch) {
    if (patch.agoUnit) next.agoUnit = patch.agoUnit;
    else delete next.agoUnit;
  }
  if (!next.agoValue || !next.agoUnit) {
    delete next.agoValue;
    delete next.agoUnit;
  }
  return next;
}

export function patchPastSurgicalProcedureEntry(
  structured: PastSurgicalHistoryStructured,
  entryId: string,
  patch: Partial<
    Pick<PastSurgicalProcedureEntry, "procedureOther" | "agoValue" | "agoUnit" | "notes">
  >,
): PastSurgicalHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.procedures = getPastSurgicalProcedureEntries(next).map((entry) =>
    entry.id === entryId ? mergeProcedureEntryPatch(entry, patch) : entry,
  );
  return next;
}

export function removePastSurgicalProcedureEntry(
  structured: PastSurgicalHistoryStructured,
  entryId: string,
): PastSurgicalHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.procedures = getPastSurgicalProcedureEntries(next).filter((entry) => entry.id !== entryId);
  if (next.procedures.length === 0) next.procedures = [];
  return next;
}

export function setPastSurgicalHistoryNotes(
  structured: PastSurgicalHistoryStructured,
  notes: string,
): PastSurgicalHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  if (notes === "") delete next.notes;
  else next.notes = notes;
  return next;
}

export { filterPastSurgicalProcedureCatalog, PAST_SURGICAL_PROCEDURE_CATALOG };
