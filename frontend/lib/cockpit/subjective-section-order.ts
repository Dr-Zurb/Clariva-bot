import { HISTORY_FIELD_DEFS, type HistoryFieldKey } from "@/lib/cockpit/history-field-chips";
import type { CustomSubsection } from "@/types/prescription";

/** Fixed top-level subjective section ids (not derived from history field defs). */
export const CORE_SUBJECTIVE_SECTION_IDS = [
  "chief_complaints",
  "patient_background",
  "allergies",
  "past_surgical",
  "free_text_notes",
  "custom_subsections",
] as const;

export type CoreSubjectiveSectionId = (typeof CORE_SUBJECTIVE_SECTION_IDS)[number];

/** History-card section ids derived from `HISTORY_FIELD_DEFS` field keys. */
export type HistoryDerivedSectionId =
  | "family_history"
  | "social_history"
  | "past_surgical";

export type StaticSubjectiveSectionId = CoreSubjectiveSectionId | HistoryDerivedSectionId;

export const CUSTOM_BLOCK_SECTION_PREFIX = "custom_block:" as const;

/** Per-visit custom block ids embedded in the subjective section order. */
export type CustomBlockSectionId = `${typeof CUSTOM_BLOCK_SECTION_PREFIX}${string}`;

export type SubjectiveSectionId = StaticSubjectiveSectionId | CustomBlockSectionId;

const CUSTOM_BLOCK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HISTORY_FIELD_KEY_TO_SECTION_ID: Record<HistoryFieldKey, HistoryDerivedSectionId> = {
  familyHistory: "family_history",
  socialHistory: "social_history",
  pastSurgicalHistory: "past_surgical",
};

/** Map a history field key to its subjective section id (snake_case). */
export function historyFieldKeyToSectionId(fieldKey: HistoryFieldKey): SubjectiveSectionId {
  return HISTORY_FIELD_KEY_TO_SECTION_ID[fieldKey];
}

/** Section ids for each entry in `HISTORY_FIELD_DEFS`, in definition order. */
export const HISTORY_FIELD_SECTION_IDS: StaticSubjectiveSectionId[] = HISTORY_FIELD_DEFS.map(
  (def) => historyFieldKeyToSectionId(def.fieldKey),
);

/**
 * Canonical default render order — reproduces the pre-P8 hardcoded layout.
 * Conditional sections (`patient_background`, `allergies`, `past_surgical`) are
 * filtered to mountable ids at render time. Custom blocks expand at the
 * `custom_subsections` slot.
 */
export const DEFAULT_SECTION_ORDER: StaticSubjectiveSectionId[] = [
  "chief_complaints",
  "patient_background",
  "allergies",
  "past_surgical",
  ...HISTORY_FIELD_SECTION_IDS,
  "free_text_notes",
  "custom_subsections",
];

/** Human-readable labels for static reorder grips and a11y. */
export const SUBJECTIVE_SECTION_LABELS: Record<StaticSubjectiveSectionId, string> = {
  chief_complaints: "Chief complaints",
  patient_background: "Patient background",
  allergies: "Allergies",
  past_surgical: "Past surgical history",
  family_history: "Family history",
  social_history: "Social / personal history",
  free_text_notes: "Free-text notes",
  custom_subsections: "Custom sections",
};

export function isCustomBlockSectionId(id: string): id is CustomBlockSectionId {
  if (!id.startsWith(CUSTOM_BLOCK_SECTION_PREFIX)) return false;
  return CUSTOM_BLOCK_UUID_RE.test(id.slice(CUSTOM_BLOCK_SECTION_PREFIX.length));
}

export function isStaticSubjectiveSectionId(id: SubjectiveSectionId): id is StaticSubjectiveSectionId {
  return !isCustomBlockSectionId(id);
}

export function toCustomBlockSectionId(blockId: string): CustomBlockSectionId {
  return `${CUSTOM_BLOCK_SECTION_PREFIX}${blockId}`;
}

export function customBlockIdFromSectionId(sectionId: string): string | null {
  if (!isCustomBlockSectionId(sectionId)) return null;
  return sectionId.slice(CUSTOM_BLOCK_SECTION_PREFIX.length);
}

export function sectionDisplayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled section";
}

export function resolveSubjectiveSectionLabel(
  sectionId: SubjectiveSectionId,
  customSubsections: readonly CustomSubsection[],
): string {
  if (isCustomBlockSectionId(sectionId)) {
    const blockId = customBlockIdFromSectionId(sectionId);
    const block = customSubsections.find((s) => s.id === blockId);
    return block ? sectionDisplayTitle(block.title) : "Custom section";
  }
  return SUBJECTIVE_SECTION_LABELS[sectionId];
}

/** Mountable static section ids for the current chart mode (linked vs fallback). */
export function resolveStaticSectionIds(linkedChart: boolean): StaticSubjectiveSectionId[] {
  const ids: StaticSubjectiveSectionId[] = ["chief_complaints"];

  if (linkedChart) {
    ids.push("patient_background", "allergies");
  } else {
    ids.push("past_surgical");
  }

  ids.push(...HISTORY_FIELD_SECTION_IDS, "free_text_notes");
  return ids;
}

/** Mountable ids including flattened custom blocks (excludes legacy `custom_subsections`). */
export function resolveAvailableSectionIds(
  linkedChart: boolean,
  customBlockIds: readonly string[] = [],
): SubjectiveSectionId[] {
  return [
    ...resolveStaticSectionIds(linkedChart),
    ...customBlockIds.map(toCustomBlockSectionId),
  ];
}

/** @deprecated Use `resolveStaticSectionIds` — kept for tests migrating off the bucket id. */
export function resolveAvailableSectionIdsLegacy(linkedChart: boolean): SubjectiveSectionId[] {
  return [...resolveStaticSectionIds(linkedChart), "custom_subsections"];
}

/** Replace legacy bucket marker with live custom block ids. */
export function expandLegacyCustomSubsectionsMarker(
  stored: readonly string[],
  customBlockIds: readonly string[],
): SubjectiveSectionId[] {
  const result: SubjectiveSectionId[] = [];
  for (const id of stored) {
    if (id === "custom_subsections") {
      result.push(...customBlockIds.map(toCustomBlockSectionId));
    } else {
      result.push(id as SubjectiveSectionId);
    }
  }
  return result;
}

/** Index in the render plan where the empty custom-section chrome should appear. */
export function resolveCustomEmptyChromeIndex(order: readonly SubjectiveSectionId[]): number {
  const freeTextIdx = order.indexOf("free_text_notes");
  if (freeTextIdx >= 0) return freeTextIdx + 1;
  return order.length;
}

export function insertCustomBlockIntoOrder(
  order: readonly SubjectiveSectionId[],
  blockId: string,
): SubjectiveSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  if (order.includes(sectionId)) return [...order];

  const insertAt = resolveCustomEmptyChromeIndex(order);
  const next = [...order];
  next.splice(insertAt, 0, sectionId);
  return next;
}

export function removeCustomBlockFromOrder(
  order: readonly SubjectiveSectionId[],
  blockId: string,
): SubjectiveSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  return order.filter((id) => id !== sectionId);
}

export function syncCustomBlockIdsInOrder(
  order: readonly SubjectiveSectionId[],
  customBlockIds: readonly string[],
  linkedChart: boolean,
): SubjectiveSectionId[] {
  const available = resolveAvailableSectionIds(linkedChart, customBlockIds);
  const blockIdSet = new Set(customBlockIds);
  const withoutStale = order.filter(
    (id) => !isCustomBlockSectionId(id) || blockIdSet.has(customBlockIdFromSectionId(id)!),
  );

  let next = normalizeSectionOrder(withoutStale, available);
  for (const blockId of customBlockIds) {
    const sectionId = toCustomBlockSectionId(blockId);
    if (!next.includes(sectionId)) {
      next = insertCustomBlockIntoOrder(next, blockId);
    }
  }
  return next;
}

/**
 * Merge stored doctor default with the live registry.
 * Empty/absent stored order falls back to the canonical default layout.
 */
export function resolveInitialSectionOrder(
  stored: readonly string[],
  linkedChart: boolean,
  customBlockIds: readonly string[] = [],
): SubjectiveSectionId[] {
  const available = resolveAvailableSectionIds(linkedChart, customBlockIds);
  const expanded = expandLegacyCustomSubsectionsMarker(stored, customBlockIds);
  return syncCustomBlockIdsInOrder(
    normalizeSectionOrder(expanded, available),
    customBlockIds,
    linkedChart,
  );
}

function dedupeAvailableIds(available: readonly SubjectiveSectionId[]): SubjectiveSectionId[] {
  const seen = new Set<SubjectiveSectionId>();
  const result: SubjectiveSectionId[] = [];
  for (const id of available) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function dedupeStoredIds(
  stored: readonly SubjectiveSectionId[],
  availableSet: ReadonlySet<SubjectiveSectionId>,
): SubjectiveSectionId[] {
  const seen = new Set<SubjectiveSectionId>();
  const result: SubjectiveSectionId[] = [];
  for (const id of stored) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function defaultIndex(id: SubjectiveSectionId): number {
  if (isCustomBlockSectionId(id)) {
    return DEFAULT_SECTION_ORDER.indexOf("custom_subsections");
  }
  const idx = DEFAULT_SECTION_ORDER.indexOf(id);
  return idx === -1 ? DEFAULT_SECTION_ORDER.length : idx;
}

/**
 * Merge a stored section order with the live registry.
 * - Drops unknown / unavailable ids.
 * - Inserts newly-available ids at their canonical `DEFAULT_SECTION_ORDER` slot.
 * - Preserves doctor-chosen relative order for known stored ids.
 */
export function normalizeSectionOrder(
  stored: readonly SubjectiveSectionId[],
  available: readonly SubjectiveSectionId[],
): SubjectiveSectionId[] {
  const availableIds = dedupeAvailableIds(available);
  const availableSet = new Set<SubjectiveSectionId>(availableIds);
  const canonicalOrder = availableIds.filter((id) => isStaticSubjectiveSectionId(id));

  if (canonicalOrder.length === 0 && availableIds.length === 0) return [];

  const storedKnown = dedupeStoredIds(stored, availableSet);
  if (storedKnown.length === 0) {
    return availableIds.filter(
      (id) => isCustomBlockSectionId(id) || canonicalOrder.includes(id as StaticSubjectiveSectionId),
    );
  }

  const order = [...storedKnown];

  for (const id of availableIds) {
    if (!availableSet.has(id) || order.includes(id)) continue;
    if (isCustomBlockSectionId(id)) continue;

    const idIdx = defaultIndex(id);
    let insertAt = 0;
    for (let i = 0; i < order.length; i += 1) {
      if (defaultIndex(order[i]!) < idIdx) {
        insertAt = i + 1;
      }
    }
    order.splice(insertAt, 0, id);
  }

  return order;
}

/** Load the doctor's stored section order (empty = use canonical default). */
export async function fetchSubjectiveSectionOrder(
  token: string,
): Promise<SubjectiveSectionId[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.subjective_section_order ?? [];
}

/** Persist the doctor's section order default (subj-24 transport; subj-26 wires UI). */
export async function saveSubjectiveSectionOrder(
  token: string,
  order: SubjectiveSectionId[],
): Promise<SubjectiveSectionId[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const persisted = order.filter((id) => id !== "custom_subsections");
  const res = await patchDoctorSettings(token, { subjective_section_order: persisted });
  return res.data.settings.subjective_section_order ?? [];
}
