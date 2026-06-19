import {
  FAMILY_HISTORY_CONDITION_CATALOG,
  familyHistoryConditionLabel,
  filterFamilyHistoryConditionCatalog,
  resolveFamilyHistoryCatalogCondition,
  type FamilyHistoryCatalogCondition,
} from "@/lib/cockpit/family-history-conditions";

export type FamilyHistoryCondition = FamilyHistoryCatalogCondition;

export type FamilyHistoryRelativeKey =
  | "father"
  | "mother"
  | "sibling"
  | "child"
  | "grandparent";

export type FamilyHistorySiblingSex = "brother" | "sister";
export type FamilyHistorySiblingOrder = "older" | "younger" | "twin";
export type FamilyHistoryGrandparentSide = "maternal" | "paternal";
export type FamilyHistoryGrandparentSex = "grandfather" | "grandmother";

export interface FamilyHistorySiblingDetail {
  sex?: FamilyHistorySiblingSex;
  order?: FamilyHistorySiblingOrder;
}

export interface FamilyHistoryGrandparentDetail {
  side?: FamilyHistoryGrandparentSide;
  sex?: FamilyHistoryGrandparentSex;
}

export interface FamilyHistoryRelativesMeta {
  sibling?: FamilyHistorySiblingDetail;
  grandparent?: FamilyHistoryGrandparentDetail;
}

export interface FamilyHistoryEntry {
  id: string;
  condition: FamilyHistoryCondition | "other";
  conditionOther?: string;
  notes?: string;
}

export interface FamilyHistorySiblingCard {
  id: string;
  detail?: FamilyHistorySiblingDetail;
  entries: FamilyHistoryEntry[];
}

/** Relatives with at most one card (siblings use `siblings[]`). */
export type FamilyHistorySingleRelativeKey = Exclude<FamilyHistoryRelativeKey, "sibling">;

export interface FamilyHistoryStructured {
  none?: boolean;
  relatives?: Partial<Record<FamilyHistorySingleRelativeKey, FamilyHistoryEntry[]>>;
  /** Repeatable sibling cards, each with its own detail chips and conditions. */
  siblings?: FamilyHistorySiblingCard[];
  relativesMeta?: FamilyHistoryRelativesMeta;
  /** Who the other relative is (e.g. paternal uncle). */
  other?: string;
  otherRelativeEntries?: FamilyHistoryEntry[];
  /** Legacy section-level note; preserved on read/serialize but not shown in UI. */
  notes?: string;
}

export const FAMILY_HISTORY_CONDITION_OPTIONS = FAMILY_HISTORY_CONDITION_CATALOG.map((def) => ({
  value: def.value,
  label: def.label,
}));

export const FAMILY_HISTORY_RELATIVE_ROWS: readonly {
  key: FamilyHistoryRelativeKey;
  label: string;
}[] = [
  { key: "father", label: "Father" },
  { key: "mother", label: "Mother" },
  { key: "sibling", label: "Sibling" },
  { key: "child", label: "Child" },
  { key: "grandparent", label: "Grandparent" },
] as const;

export const FAMILY_HISTORY_CONDITION_NOTE_PLACEHOLDER = "Note (optional)";
export const FAMILY_HISTORY_CONDITION_OTHER_MAX = 120;
export const FAMILY_HISTORY_CONDITION_NOTE_MAX = 200;
export const FAMILY_HISTORY_OTHER_RELATIVE_MAX = 500;
export const FAMILY_HISTORY_SECTION_NOTES_MAX = 2000;
export const FAMILY_HISTORY_SECTION_NOTES_PLACEHOLDER =
  "e.g. Consanguinity, adoption, anything not covered above";
export const MAX_FAMILY_HISTORY_CONDITIONS_PER_RELATIVE = 15;
export const MAX_FAMILY_HISTORY_SIBLING_CARDS = 5;

export const FAMILY_HISTORY_SINGLE_RELATIVE_ROWS: readonly {
  key: FamilyHistorySingleRelativeKey;
  label: string;
}[] = [
  { key: "father", label: "Father" },
  { key: "mother", label: "Mother" },
  { key: "child", label: "Child" },
  { key: "grandparent", label: "Grandparent" },
] as const;

const RELATIVE_LABELS: Record<FamilyHistoryRelativeKey, string> = {
  father: "Father",
  mother: "Mother",
  sibling: "Sibling",
  child: "Child",
  grandparent: "Grandparent",
};

const LEGACY_NONE_PATTERNS = [
  /^no significant family history$/i,
  /^nsfh$/i,
  /^nil significant family history$/i,
];

export const EMPTY_FAMILY_HISTORY_STRUCTURED: FamilyHistoryStructured = {};

function createEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isStructuredInput(
  input: FamilyHistoryStructured | string | null | undefined,
): input is FamilyHistoryStructured {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isFamilyHistoryCondition(value: string): value is FamilyHistoryCondition {
  return FAMILY_HISTORY_CONDITION_CATALOG.some((def) => def.value === value);
}

function normalizeEntry(
  raw: unknown,
  options: { preserveWhitespace?: boolean } = {},
): FamilyHistoryEntry | null {
  const preserveWhitespace = options.preserveWhitespace ?? false;
  if (typeof raw === "string" && isFamilyHistoryCondition(raw)) {
    return { id: createEntryId(), condition: raw };
  }
  if (raw && typeof raw === "object" && "condition" in raw) {
    const source = raw as Partial<FamilyHistoryEntry> & { condition?: string };
    const condition = source.condition;
    if (!condition) return null;

    const id = typeof source.id === "string" && source.id.trim() ? source.id : createEntryId();
    const notes = preserveWhitespace ? source.notes : source.notes?.trim();

    if (condition === "other") {
      const conditionOther = preserveWhitespace
        ? source.conditionOther
        : source.conditionOther?.trim();
      if (!preserveWhitespace && !conditionOther) return { id, condition: "other" };
      if (preserveWhitespace && (conditionOther === undefined || conditionOther === "")) {
        return notes ? { id, condition: "other", notes } : { id, condition: "other" };
      }
      return notes
        ? { id, condition: "other", conditionOther, notes }
        : { id, condition: "other", conditionOther };
    }

    if (!isFamilyHistoryCondition(condition)) return null;
    return notes ? { id, condition, notes } : { id, condition };
  }
  return null;
}

function normalizeRelativeEntries(
  raw: unknown,
  options: { preserveWhitespace?: boolean } = {},
): FamilyHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const catalogSeen = new Set<FamilyHistoryCondition>();
  const customSeen = new Set<string>();
  const entries: FamilyHistoryEntry[] = [];
  for (const item of raw) {
    const entry = normalizeEntry(item, options);
    if (!entry) continue;
    if (entry.condition === "other") {
      const key = entry.conditionOther?.trim().toLowerCase() ?? "";
      if (key && customSeen.has(key)) continue;
      if (key) customSeen.add(key);
      entries.push(entry);
      continue;
    }
    if (catalogSeen.has(entry.condition)) continue;
    catalogSeen.add(entry.condition);
    entries.push(entry);
  }
  return entries;
}

/** Resolve typed text to a catalog condition when it matches label, value, or synonym. */
export function resolveCatalogConditionFromQuery(
  value: string,
): FamilyHistoryCondition | undefined {
  return resolveFamilyHistoryCatalogCondition(value);
}

export function familyHistoryHasCustomCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  conditionOther: string,
): boolean {
  const key = conditionOther.trim().toLowerCase();
  if (!key) return false;
  return getFamilyHistoryRelativeEntries(structured, relative).some(
    (entry) =>
      entry.condition === "other" && entry.conditionOther?.trim().toLowerCase() === key,
  );
}

function resolveCondition(value: string): FamilyHistoryCondition | undefined {
  return resolveFamilyHistoryCatalogCondition(value);
}

function resolveRelative(value: string): FamilyHistoryRelativeKey | undefined {
  const trimmed = value.trim().toLowerCase();
  return FAMILY_HISTORY_RELATIVE_ROWS.find(
    (row) => row.key === trimmed || row.label.toLowerCase() === trimmed,
  )?.key;
}

export function familyHistoryEntryLabel(entry: FamilyHistoryEntry): string {
  if (entry.condition === "other") {
    return entry.conditionOther?.trim() || "Other condition";
  }
  return familyHistoryConditionLabel(entry.condition);
}

export function formatSiblingCardLabel(detail?: FamilyHistorySiblingDetail): string {
  const parts: string[] = [];
  if (detail?.order) {
    parts.push(
      detail.order === "twin"
        ? "Twin"
        : `${detail.order.charAt(0).toUpperCase()}${detail.order.slice(1)}`,
    );
  }
  if (detail?.sex) {
    parts.push(detail.sex === "brother" ? "brother" : "sister");
  }
  if (parts.length > 0) return parts.join(" ");
  return RELATIVE_LABELS.sibling;
}

export function formatFamilyHistoryRelativeLabel(
  relative: FamilyHistoryRelativeKey,
  meta?: FamilyHistoryRelativesMeta,
): string {
  if (relative === "sibling") {
    return formatSiblingCardLabel(meta?.sibling);
  }
  if (relative === "grandparent") {
    const detail = meta?.grandparent;
    const parts: string[] = [];
    if (detail?.side) {
      parts.push(detail.side === "maternal" ? "Maternal" : "Paternal");
    }
    if (detail?.sex) {
      parts.push(detail.sex === "grandfather" ? "grandfather" : "grandmother");
    }
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }
  return RELATIVE_LABELS[relative];
}

export function getFamilyHistorySiblingCards(
  structured: FamilyHistoryStructured,
): FamilyHistorySiblingCard[] {
  return Array.isArray(structured.siblings) ? structured.siblings : [];
}

export function canAddFamilyHistorySiblingCard(structured: FamilyHistoryStructured): boolean {
  return getFamilyHistorySiblingCards(structured).length < MAX_FAMILY_HISTORY_SIBLING_CARDS;
}

function normalizeSiblingCard(
  raw: unknown,
  options: { preserveWhitespace?: boolean } = {},
): FamilyHistorySiblingCard | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Partial<FamilyHistorySiblingCard>;
  const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : createEntryId();
  const entries = normalizeRelativeEntries(source.entries, options);
  const detail = source.detail;
  const hasDetail =
    detail != null && (detail.sex != null || detail.order != null);
  if (!hasDetail && entries.length === 0) return null;
  return {
    id,
    ...(hasDetail ? { detail: { ...detail } } : {}),
    entries,
  };
}

function migrateLegacySiblings(
  input: FamilyHistoryStructured,
  options: { preserveWhitespace?: boolean; keepEmptyCards?: boolean } = {},
): FamilyHistorySiblingCard[] {
  const cards: FamilyHistorySiblingCard[] = [];
  if (Array.isArray(input.siblings)) {
    for (const item of input.siblings) {
      const card = normalizeSiblingCard(item, options);
      if (card) {
        cards.push(card);
      } else if (options.keepEmptyCards && item && typeof item === "object") {
        const source = item as Partial<FamilyHistorySiblingCard>;
        const id =
          typeof source.id === "string" && source.id.trim() ? source.id.trim() : createEntryId();
        cards.push({ id, entries: normalizeRelativeEntries(source.entries, options) });
      }
    }
  }

  const legacyRelatives = input.relatives as
    | Partial<Record<FamilyHistoryRelativeKey, FamilyHistoryEntry[]>>
    | undefined;
  if (legacyRelatives && "sibling" in legacyRelatives && cards.length === 0) {
    const legacyEntries = normalizeRelativeEntries(legacyRelatives.sibling, options);
    const legacyDetail = input.relativesMeta?.sibling;
    if (legacyEntries.length > 0 || legacyDetail || options.keepEmptyCards) {
      cards.push({
        id: createEntryId(),
        ...(legacyDetail ? { detail: { ...legacyDetail } } : {}),
        entries: legacyEntries,
      });
    }
  }

  return cards;
}

export function getOtherRelativeEntries(structured: FamilyHistoryStructured): FamilyHistoryEntry[] {
  const raw = structured.otherRelativeEntries;
  return Array.isArray(raw) ? raw : [];
}

export function familyHistoryRelativeHasContent(
  entries: FamilyHistoryEntry[] | null | undefined,
): boolean {
  return (entries?.length ?? 0) > 0;
}

export function familyHistoryRelativeIsAdded(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
): boolean {
  return structured.relatives != null && relative in structured.relatives;
}

export function getFamilyHistoryRelativeEntries(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
): FamilyHistoryEntry[] {
  const raw = structured.relatives?.[relative];
  return Array.isArray(raw) ? raw : [];
}

export function familyHistoryRelativeKeysInUse(
  structured: FamilyHistoryStructured,
): FamilyHistorySingleRelativeKey[] {
  if (!structured.relatives) return [];
  return FAMILY_HISTORY_SINGLE_RELATIVE_ROWS.filter((row) => row.key in structured.relatives!).map(
    (row) => row.key,
  );
}

export function availableFamilyHistoryRelativeAddOptions(
  structured: FamilyHistoryStructured,
): typeof FAMILY_HISTORY_SINGLE_RELATIVE_ROWS {
  const inUse = new Set(familyHistoryRelativeKeysInUse(structured));
  return FAMILY_HISTORY_SINGLE_RELATIVE_ROWS.filter((row) => !inUse.has(row.key));
}

export function availableFamilyHistoryCatalogConditionsForEntries(
  entries: FamilyHistoryEntry[],
): typeof FAMILY_HISTORY_CONDITION_OPTIONS {
  const selected = new Set(
    entries
      .filter((entry) => entry.condition !== "other")
      .map((entry) => entry.condition as FamilyHistoryCondition),
  );
  return FAMILY_HISTORY_CONDITION_OPTIONS.filter((option) => !selected.has(option.value));
}

export function availableFamilyHistoryCatalogConditions(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
): typeof FAMILY_HISTORY_CONDITION_OPTIONS {
  return availableFamilyHistoryCatalogConditionsForEntries(
    getFamilyHistoryRelativeEntries(structured, relative),
  );
}

export function availableOtherRelativeCatalogConditions(
  structured: FamilyHistoryStructured,
): typeof FAMILY_HISTORY_CONDITION_OPTIONS {
  return availableFamilyHistoryCatalogConditionsForEntries(getOtherRelativeEntries(structured));
}

export function hasFamilyHistoryOtherRelativeCard(structured: FamilyHistoryStructured): boolean {
  return structured.other != null || (structured.otherRelativeEntries?.length ?? 0) > 0;
}

export function hasFamilyHistoryStructuredContent(
  structured: FamilyHistoryStructured,
): boolean {
  if (structured.none) return true;
  if (structured.other?.trim()) return true;
  if (getOtherRelativeEntries(structured).length > 0) return true;
  if (structured.notes?.trim()) return true;
  if (getFamilyHistorySiblingCards(structured).some((card) => card.entries.length > 0)) return true;
  if (getFamilyHistorySiblingCards(structured).length > 0) return true;
  if (familyHistoryRelativeKeysInUse(structured).length > 0) return true;
  for (const row of FAMILY_HISTORY_SINGLE_RELATIVE_ROWS) {
    if (familyHistoryRelativeHasContent(structured.relatives?.[row.key])) return true;
  }
  return false;
}

export function normalizeFamilyHistoryStructured(
  input: FamilyHistoryStructured,
  options: { keepEmptyRelativeCards?: boolean } = {},
): FamilyHistoryStructured {
  const keepEmptyRelativeCards = options.keepEmptyRelativeCards ?? false;
  const preserveWhitespace = keepEmptyRelativeCards;
  const next: FamilyHistoryStructured = {};

  if (input.none) {
    next.none = true;
    return next;
  }

  const relatives: NonNullable<FamilyHistoryStructured["relatives"]> = {};
  let hasRelative = false;
  for (const row of FAMILY_HISTORY_SINGLE_RELATIVE_ROWS) {
    if (!(row.key in (input.relatives ?? {}))) continue;
    const cleaned = normalizeRelativeEntries(input.relatives?.[row.key], { preserveWhitespace });
    if (cleaned.length > 0 || keepEmptyRelativeCards) {
      relatives[row.key] = cleaned;
      hasRelative = true;
    }
  }
  if (hasRelative) next.relatives = relatives;

  const siblings = migrateLegacySiblings(input, {
    preserveWhitespace,
    keepEmptyCards: keepEmptyRelativeCards,
  });
  if (siblings.length > 0) next.siblings = siblings;

  if (input.relativesMeta?.grandparent) {
    next.relativesMeta = { grandparent: { ...input.relativesMeta.grandparent } };
  } else if (input.relativesMeta && !input.relativesMeta.sibling) {
    next.relativesMeta = { ...input.relativesMeta };
  }

  if (input.other != null) {
    if (preserveWhitespace) next.other = input.other;
    else {
      const other = input.other.trim();
      if (other) next.other = other;
    }
  }

  const otherEntries = normalizeRelativeEntries(input.otherRelativeEntries, { preserveWhitespace });
  if (otherEntries.length > 0) next.otherRelativeEntries = otherEntries;
  else if (keepEmptyRelativeCards && input.otherRelativeEntries != null) {
    next.otherRelativeEntries = [];
  }

  if (preserveWhitespace) {
    if (input.notes != null && input.notes !== "") next.notes = input.notes;
  } else {
    const notes = input.notes?.trim();
    if (notes) next.notes = notes;
  }

  return next;
}

function serializeEntry(entry: FamilyHistoryEntry): string {
  const label = familyHistoryEntryLabel(entry);
  const note = entry.notes?.trim();
  return note ? `${label} (${note})` : label;
}

function serializeRelativeSection(label: string, entries: FamilyHistoryEntry[]): string {
  return `${label}: ${entries.map(serializeEntry).join(", ")}`;
}

export function serializeFamilyHistory(structured: FamilyHistoryStructured): string {
  const normalized = normalizeFamilyHistoryStructured(structured);
  if (!hasFamilyHistoryStructuredContent(normalized)) return "";

  if (normalized.none) {
    return "No significant family history";
  }

  const parts: string[] = [];
  for (const row of FAMILY_HISTORY_SINGLE_RELATIVE_ROWS) {
    const entries = normalized.relatives?.[row.key];
    if (entries?.length) {
      const label = formatFamilyHistoryRelativeLabel(row.key, normalized.relativesMeta);
      parts.push(serializeRelativeSection(label, entries));
    }
  }
  for (const card of getFamilyHistorySiblingCards(normalized)) {
    if (card.entries.length) {
      const label = formatSiblingCardLabel(card.detail);
      parts.push(serializeRelativeSection(label, card.entries));
    }
  }
  const otherEntries = getOtherRelativeEntries(normalized);
  if (otherEntries.length > 0) {
    const otherLabel = normalized.other?.trim() || "Other relative";
    parts.push(serializeRelativeSection(otherLabel, otherEntries));
  } else if (normalized.other?.trim()) {
    parts.push(`Other: ${normalized.other.trim()}`);
  }
  if (normalized.notes) {
    parts.push(normalized.notes);
  }

  return parts.join(" · ");
}

export function formatFamilyHistoryPreview(structured: FamilyHistoryStructured): string {
  const serialized = serializeFamilyHistory(structured);
  if (!serialized) return "";
  return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
}

export function familyHistoryFilledCount(structured: FamilyHistoryStructured): number {
  const normalized = normalizeFamilyHistoryStructured(structured, { keepEmptyRelativeCards: true });
  if (normalized.none) return 1;
  let count = 0;
  for (const row of FAMILY_HISTORY_SINGLE_RELATIVE_ROWS) {
    const entries = normalized.relatives?.[row.key];
    if (entries?.length) count += entries.length;
    else if (row.key in (normalized.relatives ?? {})) count += 1;
  }
  for (const card of getFamilyHistorySiblingCards(normalized)) {
    if (card.entries.length) count += card.entries.length;
    else count += 1;
  }
  if (normalized.other != null) count += 1;
  count += getOtherRelativeEntries(normalized).length;
  if (normalized.notes?.trim()) count += 1;
  return count;
}

function clearNoneFlag(structured: FamilyHistoryStructured): FamilyHistoryStructured {
  const next = { ...structured };
  delete next.none;
  return next;
}

function legacyRelatives(
  structured: FamilyHistoryStructured,
): Partial<Record<FamilyHistoryRelativeKey, FamilyHistoryEntry[]>> {
  return (structured.relatives ?? {}) as Partial<Record<FamilyHistoryRelativeKey, FamilyHistoryEntry[]>>;
}

function addCatalogCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistoryRelativeKey,
  condition: FamilyHistoryCondition,
  notes?: string,
): void {
  const relatives = legacyRelatives(structured);
  structured.relatives = relatives as FamilyHistoryStructured["relatives"];
  if (!(relative in relatives)) {
    relatives[relative] = [];
  }
  const existing = normalizeRelativeEntries(relatives[relative]);
  const index = existing.findIndex((entry) => entry.condition === condition);
  const trimmedNotes = notes?.trim();
  if (index >= 0) {
    const current = existing[index];
    existing[index] = trimmedNotes
      ? { ...current, notes: trimmedNotes }
      : { ...current, notes: undefined };
  } else {
    existing.push(
      trimmedNotes
        ? { id: createEntryId(), condition, notes: trimmedNotes }
        : { id: createEntryId(), condition },
    );
  }
  relatives[relative] = existing;
}

function addOtherCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistoryRelativeKey,
  conditionOther: string,
  notes?: string,
): void {
  const relatives = legacyRelatives(structured);
  structured.relatives = relatives as FamilyHistoryStructured["relatives"];
  if (!(relative in relatives)) {
    relatives[relative] = [];
  }
  const existing = normalizeRelativeEntries(relatives[relative]);
  const trimmedOther = conditionOther.trim();
  const trimmedNotes = notes?.trim();
  if (trimmedOther) {
    const catalogMatch = resolveCondition(trimmedOther);
    if (catalogMatch) {
      addCatalogCondition(structured, relative, catalogMatch, trimmedNotes);
      return;
    }
    const duplicate = existing.some(
      (entry) =>
        entry.condition === "other" &&
        entry.conditionOther?.trim().toLowerCase() === trimmedOther.toLowerCase(),
    );
    if (duplicate) return;
  }
  existing.push({
    id: createEntryId(),
    condition: "other",
    ...(trimmedOther ? { conditionOther: trimmedOther } : {}),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  });
  relatives[relative] = existing;
}

function parseConditionWithNote(value: string): { condition: string; notes?: string } {
  const parenMatch = value.trim().match(/^(.+?)\s*\((.+)\)\s*$/);
  if (parenMatch) {
    return { condition: parenMatch[1].trim(), notes: parenMatch[2].trim() };
  }
  return { condition: value.trim() };
}

function parseLegacyToken(token: string, structured: FamilyHistoryStructured): void {
  const trimmed = token.trim();
  if (!trimmed) return;

  if (LEGACY_NONE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    structured.none = true;
    return;
  }

  const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    const value = colonMatch[2].trim();
    const relative = resolveRelative(label);
    if (relative) {
      structured.relatives = structured.relatives ?? {};
      if (!(relative in structured.relatives)) structured.relatives[relative] = [];
      for (const part of value.split(/,\s*/)) {
        const parsed = parseConditionWithNote(part);
        const condition = resolveCondition(parsed.condition);
        if (condition) {
          addCatalogCondition(structured, relative, condition, parsed.notes);
        } else if (parsed.condition) {
          addOtherCondition(structured, relative, parsed.condition, parsed.notes);
        }
      }
      return;
    }
    if (/^other$/i.test(label)) {
      structured.other = value;
      return;
    }
  }

  const dashMatch = trimmed.match(/^(.+?)\s*[—-]\s*(.+)$/);
  if (dashMatch) {
    const relative = resolveRelative(dashMatch[1]);
    const parsed = parseConditionWithNote(dashMatch[2]);
    const condition = resolveCondition(parsed.condition);
    if (relative && condition) {
      addCatalogCondition(structured, relative, condition, parsed.notes);
      return;
    }
    if (relative && parsed.condition) {
      addOtherCondition(structured, relative, parsed.condition, parsed.notes);
      return;
    }
  }

  const bareCondition = resolveCondition(trimmed);
  if (bareCondition) return;

  structured.notes = structured.notes ? `${structured.notes} · ${trimmed}` : trimmed;
}

export function parseFamilyHistoryAsStructured(
  input: string | FamilyHistoryStructured | null | undefined,
): FamilyHistoryStructured {
  if (isStructuredInput(input)) {
    return normalizeFamilyHistoryStructured(input, { keepEmptyRelativeCards: true });
  }

  const text = (input ?? "").trim();
  if (!text) return {};

  const structured: FamilyHistoryStructured = {};
  for (const segment of text.split(/\s*·\s*/)) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;

    const colonRelative = trimmedSegment.match(/^([^:]+):\s*(.+)$/);
    if (
      colonRelative &&
      (resolveRelative(colonRelative[1]) || /^other$/i.test(colonRelative[1].trim()))
    ) {
      parseLegacyToken(trimmedSegment, structured);
      continue;
    }

    for (const token of trimmedSegment.split(/,\s*/)) {
      parseLegacyToken(token, structured);
    }
  }

  return normalizeFamilyHistoryStructured(structured);
}

export function setFamilyHistoryNone(
  structured: FamilyHistoryStructured,
  none: boolean,
): FamilyHistoryStructured {
  if (!none) {
    return normalizeFamilyHistoryStructured(clearNoneFlag(structured), {
      keepEmptyRelativeCards: true,
    });
  }
  return { none: true };
}

export function addFamilyHistoryRelative(
  structured: FamilyHistoryStructured,
  relative: FamilyHistoryRelativeKey,
): FamilyHistoryStructured {
  if (relative === "sibling") {
    return addFamilyHistorySiblingCard(structured);
  }
  const next = clearNoneFlag(structured);
  const relatives = { ...(next.relatives ?? {}) };
  if (!(relative in relatives)) {
    relatives[relative] = [];
  }
  next.relatives = relatives;
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function addFamilyHistorySiblingCard(
  structured: FamilyHistoryStructured,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  const cards = [...getFamilyHistorySiblingCards(next)];
  if (cards.length >= MAX_FAMILY_HISTORY_SIBLING_CARDS) return next;
  cards.push({ id: createEntryId(), entries: [] });
  next.siblings = cards;
  return next;
}

export function removeFamilyHistorySiblingCard(
  structured: FamilyHistoryStructured,
  cardId: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  const cards = getFamilyHistorySiblingCards(next).filter((card) => card.id !== cardId);
  if (cards.length > 0) next.siblings = cards;
  else delete next.siblings;
  return next;
}

export function setFamilyHistorySiblingDetail(
  structured: FamilyHistoryStructured,
  cardId: string,
  detail: FamilyHistorySiblingDetail,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.siblings = getFamilyHistorySiblingCards(next).map((card) =>
    card.id === cardId ? { ...card, detail } : card,
  );
  return next;
}

function mapSiblingCardEntries(
  structured: FamilyHistoryStructured,
  cardId: string,
  mapFn: (entries: FamilyHistoryEntry[]) => FamilyHistoryEntry[],
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.siblings = getFamilyHistorySiblingCards(next).map((card) =>
    card.id === cardId ? { ...card, entries: mapFn(card.entries) } : card,
  );
  return next;
}

export function addFamilyHistorySiblingCatalogCondition(
  structured: FamilyHistoryStructured,
  cardId: string,
  condition: FamilyHistoryCondition,
): FamilyHistoryStructured {
  return mapSiblingCardEntries(structured, cardId, (entries) =>
    addCatalogConditionToEntries(entries, condition),
  );
}

export function addFamilyHistorySiblingOtherCondition(
  structured: FamilyHistoryStructured,
  cardId: string,
  conditionOther = "",
): FamilyHistoryStructured {
  return mapSiblingCardEntries(structured, cardId, (entries) =>
    addOtherConditionToEntries(entries, conditionOther),
  );
}

export function removeFamilyHistorySiblingEntry(
  structured: FamilyHistoryStructured,
  cardId: string,
  entryId: string,
): FamilyHistoryStructured {
  return mapSiblingCardEntries(structured, cardId, (entries) =>
    entries.filter((entry) => entry.id !== entryId),
  );
}

export function patchFamilyHistorySiblingEntry(
  structured: FamilyHistoryStructured,
  cardId: string,
  entryId: string,
  patch: Partial<Pick<FamilyHistoryEntry, "conditionOther" | "notes">>,
): FamilyHistoryStructured {
  return mapSiblingCardEntries(structured, cardId, (entries) =>
    entries.map((entry) =>
      entry.id === entryId ? mergeFamilyHistoryEntryPatch(entry, patch) : entry,
    ),
  );
}

export function removeFamilyHistoryRelative(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  if (!next.relatives) return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
  const relatives = { ...next.relatives };
  delete relatives[relative];
  next.relatives = Object.keys(relatives).length > 0 ? relatives : undefined;
  if (next.relativesMeta?.grandparent && relative === "grandparent") {
    delete next.relativesMeta.grandparent;
    if (Object.keys(next.relativesMeta).length === 0) delete next.relativesMeta;
  }
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function setFamilyHistoryRelativeDetail(
  structured: FamilyHistoryStructured,
  relative: "grandparent",
  patch: FamilyHistoryGrandparentDetail,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  const meta: FamilyHistoryRelativesMeta = { ...(next.relativesMeta ?? {}) };
  meta.grandparent = { ...(meta.grandparent ?? {}), ...patch };
  next.relativesMeta = meta;
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function toggleFamilyHistoryRelativeDetailChip<
  T extends string,
  K extends "sex" | "order" | "side",
>(current: Record<K, T | undefined> | undefined, key: K, value: T): Record<K, T | undefined> {
  const next = { ...(current ?? {}) } as Record<K, T | undefined>;
  if (next[key] === value) delete next[key];
  else next[key] = value;
  return next;
}

export function addFamilyHistoryCatalogCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  condition: FamilyHistoryCondition,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  addCatalogCondition(next, relative, condition);
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function addFamilyHistoryOtherCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  conditionOther = "",
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  addOtherCondition(next, relative, conditionOther);
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function removeFamilyHistoryEntry(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  entryId: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  if (!next.relatives?.[relative]) {
    return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
  }
  const entries = getFamilyHistoryRelativeEntries(next, relative).filter(
    (entry) => entry.id !== entryId,
  );
  const relatives = { ...next.relatives };
  if (entries.length > 0) relatives[relative] = entries;
  else relatives[relative] = [];
  next.relatives = relatives;
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

function mergeFamilyHistoryEntryPatch(
  entry: FamilyHistoryEntry,
  patch: Partial<Pick<FamilyHistoryEntry, "conditionOther" | "notes">>,
): FamilyHistoryEntry {
  const next = { ...entry };
  if (patch.notes !== undefined) {
    next.notes = patch.notes === "" ? undefined : patch.notes;
  }
  if (entry.condition === "other" && patch.conditionOther !== undefined) {
    next.conditionOther = patch.conditionOther === "" ? undefined : patch.conditionOther;
  }
  return next;
}

export function patchFamilyHistoryEntry(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  entryId: string,
  patch: Partial<Pick<FamilyHistoryEntry, "conditionOther" | "notes">>,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  if (!next.relatives?.[relative]) {
    return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
  }
  const entries = getFamilyHistoryRelativeEntries(next, relative).map((entry) =>
    entry.id === entryId ? mergeFamilyHistoryEntryPatch(entry, patch) : entry,
  );
  next.relatives = { ...next.relatives, [relative]: entries };
  return next;
}

function addCatalogConditionToEntries(
  entries: FamilyHistoryEntry[],
  condition: FamilyHistoryCondition,
  notes?: string,
): FamilyHistoryEntry[] {
  const existing = [...entries];
  const index = existing.findIndex((entry) => entry.condition === condition);
  const trimmedNotes = notes?.trim();
  if (index >= 0) {
    const current = existing[index]!;
    existing[index] = trimmedNotes
      ? { ...current, notes: trimmedNotes }
      : { ...current, notes: undefined };
    return existing;
  }
  existing.push(
    trimmedNotes
      ? { id: createEntryId(), condition, notes: trimmedNotes }
      : { id: createEntryId(), condition },
  );
  return existing;
}

function addOtherConditionToEntries(
  entries: FamilyHistoryEntry[],
  conditionOther: string,
  notes?: string,
): FamilyHistoryEntry[] {
  const existing = [...entries];
  const trimmedOther = conditionOther.trim();
  const trimmedNotes = notes?.trim();
  if (trimmedOther) {
    const catalogMatch = resolveCondition(trimmedOther);
    if (catalogMatch) {
      return addCatalogConditionToEntries(existing, catalogMatch, trimmedNotes);
    }
    const duplicate = existing.some(
      (entry) =>
        entry.condition === "other" &&
        entry.conditionOther?.trim().toLowerCase() === trimmedOther.toLowerCase(),
    );
    if (duplicate) return existing;
  }
  existing.push({
    id: createEntryId(),
    condition: "other",
    ...(trimmedOther ? { conditionOther: trimmedOther } : {}),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  });
  return existing;
}

export function addOtherRelativeCatalogCondition(
  structured: FamilyHistoryStructured,
  condition: FamilyHistoryCondition,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.otherRelativeEntries = addCatalogConditionToEntries(
    getOtherRelativeEntries(next),
    condition,
  );
  if (next.other == null) next.other = "";
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function addOtherRelativeCustomCondition(
  structured: FamilyHistoryStructured,
  conditionOther: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.otherRelativeEntries = addOtherConditionToEntries(
    getOtherRelativeEntries(next),
    conditionOther,
  );
  if (next.other == null) next.other = "";
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function removeOtherRelativeEntry(
  structured: FamilyHistoryStructured,
  entryId: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.otherRelativeEntries = getOtherRelativeEntries(next).filter((entry) => entry.id !== entryId);
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function patchOtherRelativeEntry(
  structured: FamilyHistoryStructured,
  entryId: string,
  patch: Partial<Pick<FamilyHistoryEntry, "conditionOther" | "notes">>,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.otherRelativeEntries = getOtherRelativeEntries(next).map((entry) =>
    entry.id === entryId ? mergeFamilyHistoryEntryPatch(entry, patch) : entry,
  );
  return next;
}

export function showFamilyHistoryOtherRelativeCard(
  structured: FamilyHistoryStructured,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.other = next.other ?? "";
  next.otherRelativeEntries = next.otherRelativeEntries ?? [];
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function setFamilyHistoryOtherRelative(
  structured: FamilyHistoryStructured,
  other: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  next.other = other;
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

export function removeFamilyHistoryOtherRelative(
  structured: FamilyHistoryStructured,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  delete next.other;
  delete next.otherRelativeEntries;
  return normalizeFamilyHistoryStructured(next, { keepEmptyRelativeCards: true });
}

/** @deprecated Use removeFamilyHistoryEntry / addFamilyHistoryCatalogCondition */
export function toggleFamilyHistoryCondition(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  condition: FamilyHistoryCondition,
): FamilyHistoryStructured {
  const existing = getFamilyHistoryRelativeEntries(structured, relative);
  const match = existing.find((entry) => entry.condition === condition);
  if (match) return removeFamilyHistoryEntry(structured, relative, match.id);
  return addFamilyHistoryCatalogCondition(structured, relative, condition);
}

/** @deprecated Use patchFamilyHistoryEntry */
export function setFamilyHistoryConditionNotes(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
  condition: FamilyHistoryCondition,
  notes: string,
): FamilyHistoryStructured {
  const entry = getFamilyHistoryRelativeEntries(structured, relative).find(
    (item) => item.condition === condition,
  );
  if (!entry) return normalizeFamilyHistoryStructured(structured, { keepEmptyRelativeCards: true });
  return patchFamilyHistoryEntry(structured, relative, entry.id, { notes });
}

/** @deprecated Use setFamilyHistoryOtherRelative */
export function setFamilyHistoryOther(
  structured: FamilyHistoryStructured,
  other: string,
): FamilyHistoryStructured {
  return setFamilyHistoryOtherRelative(structured, other);
}

export function setFamilyHistoryNotes(
  structured: FamilyHistoryStructured,
  notes: string,
): FamilyHistoryStructured {
  const next = clearNoneFlag({ ...structured });
  if (notes === "") delete next.notes;
  else next.notes = notes;
  return next;
}

export function availableFamilyHistoryConditions(
  structured: FamilyHistoryStructured,
  relative: FamilyHistorySingleRelativeKey,
): typeof FAMILY_HISTORY_CONDITION_OPTIONS {
  return availableFamilyHistoryCatalogConditions(structured, relative);
}

export function familyHistoryConditionNotePlaceholder(): string {
  return FAMILY_HISTORY_CONDITION_NOTE_PLACEHOLDER;
}
