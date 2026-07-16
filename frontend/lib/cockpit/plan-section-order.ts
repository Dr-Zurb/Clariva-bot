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

/** Fixed top-level Plan section ids (static registry). */
export const CORE_PLAN_SECTION_IDS = [
  "investigations",
  "medications",
  "follow_up",
  "advice",
  "referral",
  "clinical_notes",
] as const;

export type StaticPlanSectionId = (typeof CORE_PLAN_SECTION_IDS)[number];

/**
 * assessment-plan-custom-sections: custom blocks ride in the order using the
 * shared `custom_block:${uuid}` convention (reuse subjective helpers).
 */
export type PlanSectionId = StaticPlanSectionId | CustomBlockSectionId;

/**
 * Canonical default render order — matches shipped Plan L1 order
 * (Investigations → Medications → Follow-up → Advice → Referral → Notes).
 * Custom blocks expand after the last static section (`clinical_notes`).
 * PDF order stays hardcoded separately and is unaffected by this.
 */
export const DEFAULT_PLAN_SECTION_ORDER: StaticPlanSectionId[] = [...CORE_PLAN_SECTION_IDS];

/** Human-readable labels for reorder grips, manage menu, and a11y. */
export const PLAN_SECTION_LABELS: Record<StaticPlanSectionId, string> = {
  investigations: "Investigations / orders",
  medications: "Medications",
  follow_up: "Follow-up",
  advice: "Advice & education",
  referral: "Referral",
  clinical_notes: "Clinical notes (private)",
};

const PLAN_SECTION_ID_SET = new Set<string>(CORE_PLAN_SECTION_IDS);

export function isStaticPlanSectionId(id: string): id is StaticPlanSectionId {
  return PLAN_SECTION_ID_SET.has(id);
}

export function isPlanSectionId(id: string): id is PlanSectionId {
  return PLAN_SECTION_ID_SET.has(id) || isCustomBlockSectionId(id);
}

function sectionDisplayTitle(title: string): string {
  return title.trim() || "Untitled section";
}

/** Label for a static id, or the live custom-block title when applicable. */
export function resolvePlanSectionLabel(
  sectionId: PlanSectionId,
  customSections: readonly CustomSubsection[] = [],
): string {
  if (isCustomBlockSectionId(sectionId)) {
    const blockId = customBlockIdFromSectionId(sectionId);
    const block = customSections.find((s) => s.id === blockId);
    return block ? sectionDisplayTitle(block.title) : "Custom section";
  }
  return PLAN_SECTION_LABELS[sectionId];
}

/** Mountable static section ids + flattened custom blocks for the Plan tab. */
export function resolveAvailableSectionIds(
  customBlockIds: readonly string[] = [],
): PlanSectionId[] {
  return [...CORE_PLAN_SECTION_IDS, ...customBlockIds.map(toCustomBlockSectionId)];
}

function dedupeAvailableIds(available: readonly PlanSectionId[]): PlanSectionId[] {
  const seen = new Set<PlanSectionId>();
  const result: PlanSectionId[] = [];
  for (const id of available) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function dedupeStoredIds(
  stored: readonly PlanSectionId[],
  availableSet: ReadonlySet<PlanSectionId>,
): PlanSectionId[] {
  const seen = new Set<PlanSectionId>();
  const result: PlanSectionId[] = [];
  for (const id of stored) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function defaultIndex(id: PlanSectionId): number {
  if (isCustomBlockSectionId(id)) return DEFAULT_PLAN_SECTION_ORDER.length;
  const idx = DEFAULT_PLAN_SECTION_ORDER.indexOf(id);
  return idx === -1 ? DEFAULT_PLAN_SECTION_ORDER.length : idx;
}

/**
 * Merge a stored section order with the live registry.
 * - Drops unknown / unavailable ids.
 * - Inserts newly-available STATIC ids at their canonical slot.
 * - Custom blocks are synced separately (see `syncCustomBlockIdsInOrder`).
 * - Preserves doctor-chosen relative order for known stored ids.
 */
export function normalizeSectionOrder(
  stored: readonly PlanSectionId[],
  available: readonly PlanSectionId[] = CORE_PLAN_SECTION_IDS,
): PlanSectionId[] {
  const availableIds = dedupeAvailableIds(available);
  const availableSet = new Set<PlanSectionId>(availableIds);

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
  order: readonly PlanSectionId[],
): number {
  const notesIdx = order.indexOf("clinical_notes");
  if (notesIdx >= 0) return notesIdx + 1;
  return order.length;
}

export function insertCustomBlockIntoOrder(
  order: readonly PlanSectionId[],
  blockId: string,
): PlanSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  if (order.includes(sectionId)) return [...order];
  const insertAt = resolveCustomBlockInsertIndex(order);
  const next = [...order];
  next.splice(insertAt, 0, sectionId);
  return next;
}

export function removeCustomBlockFromOrder(
  order: readonly PlanSectionId[],
  blockId: string,
): PlanSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  return order.filter((id) => id !== sectionId);
}

/** Drop stale custom-block ids and append newly-added ones (preserve order). */
export function syncCustomBlockIdsInOrder(
  order: readonly PlanSectionId[],
  customBlockIds: readonly string[],
): PlanSectionId[] {
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
): PlanSectionId[] {
  const known = stored.filter(isPlanSectionId);
  return syncCustomBlockIdsInOrder(
    normalizeSectionOrder(known, resolveAvailableSectionIds(customBlockIds)),
    customBlockIds,
  );
}

export type SectionDropIntent = "before" | "after";

export const PLAN_SECTION_DRAG_MIME = "application/x-plan-section-id";

export function readPlanSectionDragId(
  dataTransfer: DataTransfer | null,
): PlanSectionId | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(PLAN_SECTION_DRAG_MIME);
  return raw && isPlanSectionId(raw) ? raw : null;
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
  order: readonly PlanSectionId[],
  fromIndex: number,
  direction: "up" | "down",
): PlanSectionId[] {
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
  order: readonly PlanSectionId[],
  fromIndex: number,
  targetIndex: number,
  intent: SectionDropIntent,
): PlanSectionId[] {
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
export async function fetchPlanSectionOrder(
  token: string,
): Promise<PlanSectionId[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.plan_section_order ?? []) as PlanSectionId[];
}

/** Persist the doctor's section order default. */
export async function savePlanSectionOrder(
  token: string,
  order: PlanSectionId[],
): Promise<PlanSectionId[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { plan_section_order: order });
  return (res.data.settings.plan_section_order ?? []) as PlanSectionId[];
}
