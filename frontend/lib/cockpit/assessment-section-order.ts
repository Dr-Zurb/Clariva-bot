import type { CustomSubsection } from "@/types/prescription";
import {
  customBlockIdFromSectionId,
  isCustomBlockSectionId,
  toCustomBlockSectionId,
  type CustomBlockSectionId,
} from "@/lib/cockpit/subjective-section-order";

export {
  customBlockIdFromSectionId,
  isCustomBlockSectionId,
  toCustomBlockSectionId,
} from "@/lib/cockpit/subjective-section-order";

/** Fixed top-level Assessment section ids (static registry). */
export const CORE_ASSESSMENT_SECTION_IDS = [
  "diagnoses",
  "known_conditions",
  "assessment_notes",
] as const;

export type StaticAssessmentSectionId = (typeof CORE_ASSESSMENT_SECTION_IDS)[number];

/**
 * assessment-plan-custom-sections: custom blocks ride in the order using the
 * shared `custom_block:${uuid}` convention (reuse subjective helpers).
 */
export type AssessmentSectionId = StaticAssessmentSectionId | CustomBlockSectionId;

/**
 * Canonical default render order — Diagnoses → Known conditions → Notes.
 * Custom blocks expand after the last static section (`assessment_notes`).
 * PDF/output order stays hardcoded separately and is unaffected by this.
 */
export const DEFAULT_ASSESSMENT_SECTION_ORDER: StaticAssessmentSectionId[] = [
  ...CORE_ASSESSMENT_SECTION_IDS,
];

/** Human-readable labels for reorder grips, manage menu, and a11y. */
export const ASSESSMENT_SECTION_LABELS: Record<StaticAssessmentSectionId, string> = {
  diagnoses: "Diagnoses",
  known_conditions: "Known conditions",
  assessment_notes: "Additional notes (private)",
};

const ASSESSMENT_SECTION_ID_SET = new Set<string>(CORE_ASSESSMENT_SECTION_IDS);

export function isStaticAssessmentSectionId(
  id: string,
): id is StaticAssessmentSectionId {
  return ASSESSMENT_SECTION_ID_SET.has(id);
}

export function isAssessmentSectionId(id: string): id is AssessmentSectionId {
  return ASSESSMENT_SECTION_ID_SET.has(id) || isCustomBlockSectionId(id);
}

function sectionDisplayTitle(title: string): string {
  return title.trim() || "Untitled section";
}

/** Label for a static id, or the live custom-block title when applicable. */
export function resolveAssessmentSectionLabel(
  sectionId: AssessmentSectionId,
  customSections: readonly CustomSubsection[] = [],
): string {
  if (isCustomBlockSectionId(sectionId)) {
    const blockId = customBlockIdFromSectionId(sectionId);
    const block = customSections.find((s) => s.id === blockId);
    return block ? sectionDisplayTitle(block.title) : "Custom section";
  }
  return ASSESSMENT_SECTION_LABELS[sectionId];
}

/** Mountable static section ids + flattened custom blocks for the Assessment tab. */
export function resolveAvailableSectionIds(
  customBlockIds: readonly string[] = [],
): AssessmentSectionId[] {
  return [
    ...CORE_ASSESSMENT_SECTION_IDS,
    ...customBlockIds.map(toCustomBlockSectionId),
  ];
}

function dedupeAvailableIds(available: readonly AssessmentSectionId[]): AssessmentSectionId[] {
  const seen = new Set<AssessmentSectionId>();
  const result: AssessmentSectionId[] = [];
  for (const id of available) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function dedupeStoredIds(
  stored: readonly AssessmentSectionId[],
  availableSet: ReadonlySet<AssessmentSectionId>,
): AssessmentSectionId[] {
  const seen = new Set<AssessmentSectionId>();
  const result: AssessmentSectionId[] = [];
  for (const id of stored) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function defaultIndex(id: AssessmentSectionId): number {
  if (isCustomBlockSectionId(id)) return DEFAULT_ASSESSMENT_SECTION_ORDER.length;
  const idx = DEFAULT_ASSESSMENT_SECTION_ORDER.indexOf(id);
  return idx === -1 ? DEFAULT_ASSESSMENT_SECTION_ORDER.length : idx;
}

/**
 * Merge a stored section order with the live registry.
 * - Drops unknown / unavailable ids.
 * - Inserts newly-available STATIC ids at their canonical slot.
 * - Custom blocks are synced separately (see `syncCustomBlockIdsInOrder`).
 * - Preserves doctor-chosen relative order for known stored ids.
 */
export function normalizeSectionOrder(
  stored: readonly AssessmentSectionId[],
  available: readonly AssessmentSectionId[] = CORE_ASSESSMENT_SECTION_IDS,
): AssessmentSectionId[] {
  const availableIds = dedupeAvailableIds(available);
  const availableSet = new Set<AssessmentSectionId>(availableIds);

  if (availableIds.length === 0) return [];

  const storedKnown = dedupeStoredIds(stored, availableSet);
  if (storedKnown.length === 0) return [...availableIds];

  const order = [...storedKnown];

  for (const id of availableIds) {
    if (order.includes(id)) continue;
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

/** Index where a new custom block should be inserted (after the last static). */
export function resolveCustomBlockInsertIndex(
  order: readonly AssessmentSectionId[],
): number {
  const notesIdx = order.indexOf("assessment_notes");
  if (notesIdx >= 0) return notesIdx + 1;
  return order.length;
}

export function insertCustomBlockIntoOrder(
  order: readonly AssessmentSectionId[],
  blockId: string,
): AssessmentSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  if (order.includes(sectionId)) return [...order];
  const insertAt = resolveCustomBlockInsertIndex(order);
  const next = [...order];
  next.splice(insertAt, 0, sectionId);
  return next;
}

export function removeCustomBlockFromOrder(
  order: readonly AssessmentSectionId[],
  blockId: string,
): AssessmentSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  return order.filter((id) => id !== sectionId);
}

/** Drop stale custom-block ids and append newly-added ones (preserve order). */
export function syncCustomBlockIdsInOrder(
  order: readonly AssessmentSectionId[],
  customBlockIds: readonly string[],
): AssessmentSectionId[] {
  const available = resolveAvailableSectionIds(customBlockIds);
  const blockIdSet = new Set(customBlockIds);
  const withoutStale = order.filter(
    (id) =>
      !isCustomBlockSectionId(id) || blockIdSet.has(customBlockIdFromSectionId(id)!),
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

/** Resolve the render order from a stored doctor default + live custom blocks. */
export function resolveInitialSectionOrder(
  stored: readonly string[],
  customBlockIds: readonly string[] = [],
): AssessmentSectionId[] {
  const known = stored.filter(isAssessmentSectionId);
  return syncCustomBlockIdsInOrder(
    normalizeSectionOrder(known, resolveAvailableSectionIds(customBlockIds)),
    customBlockIds,
  );
}

export type SectionDropIntent = "before" | "after";

export const ASSESSMENT_SECTION_DRAG_MIME = "application/x-assessment-section-id";

export function readAssessmentSectionDragId(
  dataTransfer: DataTransfer | null,
): AssessmentSectionId | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(ASSESSMENT_SECTION_DRAG_MIME);
  return raw && isAssessmentSectionId(raw) ? raw : null;
}

/** Before/after split at the vertical midpoint of the hovered row. */
export function resolveSectionDropIntent(
  clientY: number,
  rect: Pick<DOMRect, "top" | "height">,
): SectionDropIntent {
  const height = Math.max(rect.height, 1);
  if (!Number.isFinite(clientY)) return "before";
  return clientY - rect.top <= height / 2 ? "before" : "after";
}

/** Move one slot up/down; no-op at bounds. */
export function moveSectionInOrder(
  order: readonly AssessmentSectionId[],
  fromIndex: number,
  direction: "up" | "down",
): AssessmentSectionId[] {
  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= order.length || fromIndex === toIndex) {
    return [...order];
  }
  const next = [...order];
  [next[fromIndex], next[toIndex]] = [next[toIndex]!, next[fromIndex]!];
  return next;
}

/** Reorder by source index onto a target row with before/after intent. */
export function reorderSectionInOrder(
  order: readonly AssessmentSectionId[],
  fromIndex: number,
  targetIndex: number,
  intent: SectionDropIntent,
): AssessmentSectionId[] {
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    targetIndex < 0 ||
    targetIndex >= order.length
  ) {
    return [...order];
  }

  let insertAt = intent === "before" ? targetIndex : targetIndex + 1;
  if (fromIndex < insertAt) insertAt -= 1;
  if (insertAt === fromIndex) return [...order];

  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(insertAt, 0, item!);
  return next;
}

/** Load the doctor's stored section order (empty = use canonical default). */
export async function fetchAssessmentSectionOrder(
  token: string,
): Promise<AssessmentSectionId[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.assessment_section_order ?? []) as AssessmentSectionId[];
}

/** Persist the doctor's section order default. */
export async function saveAssessmentSectionOrder(
  token: string,
  order: AssessmentSectionId[],
): Promise<AssessmentSectionId[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { assessment_section_order: order });
  return (res.data.settings.assessment_section_order ?? []) as AssessmentSectionId[];
}
