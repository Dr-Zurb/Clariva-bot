/** Fixed top-level objective section ids (not custom blocks). */
export const CORE_OBJECTIVE_SECTION_IDS = [
  "vitals",
  "exam",
  "test_results",
  "legacy_exam",
  "legacy_vitals",
] as const;

export type CoreObjectiveSectionId = (typeof CORE_OBJECTIVE_SECTION_IDS)[number];

/**
 * Reserved for P5 — not in the registry until point-of-care / media sections land:
 * `point_of_care`, `media`
 */
export type StaticObjectiveSectionId = CoreObjectiveSectionId;

export const CUSTOM_BLOCK_SECTION_PREFIX = "custom_block:" as const;

/** Per-visit custom block ids embedded in the objective section order. */
export type CustomBlockSectionId = `${typeof CUSTOM_BLOCK_SECTION_PREFIX}${string}`;

export type ObjectiveSectionId = StaticObjectiveSectionId | CustomBlockSectionId;

const CUSTOM_BLOCK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canonical default render order — reproduces the pre-P3 hardcoded layout in
 * `ObjectiveSection.tsx` (Vitals → exam → test results → legacy exam → legacy vitals).
 */
export const DEFAULT_OBJECTIVE_SECTION_ORDER: StaticObjectiveSectionId[] = [
  "vitals",
  "exam",
  "test_results",
  "legacy_exam",
  "legacy_vitals",
];

/** Human-readable labels for static reorder grips and a11y (obj-11). */
export const OBJECTIVE_SECTION_LABELS: Record<StaticObjectiveSectionId, string> = {
  vitals: "Vitals",
  exam: "Examination",
  test_results: "Test results",
  legacy_exam: "Free-text exam (legacy)",
  legacy_vitals: "Legacy free-text vitals",
};

export function isCustomBlockSectionId(id: string): id is CustomBlockSectionId {
  if (!id.startsWith(CUSTOM_BLOCK_SECTION_PREFIX)) return false;
  return CUSTOM_BLOCK_UUID_RE.test(id.slice(CUSTOM_BLOCK_SECTION_PREFIX.length));
}

export function isStaticObjectiveSectionId(id: ObjectiveSectionId): id is StaticObjectiveSectionId {
  return !isCustomBlockSectionId(id);
}

export function toCustomBlockSectionId(blockId: string): CustomBlockSectionId {
  return `${CUSTOM_BLOCK_SECTION_PREFIX}${blockId}`;
}

export function customBlockIdFromSectionId(sectionId: string): string | null {
  if (!isCustomBlockSectionId(sectionId)) return null;
  return sectionId.slice(CUSTOM_BLOCK_SECTION_PREFIX.length);
}

export function resolveObjectiveSectionLabel(sectionId: ObjectiveSectionId): string {
  if (isCustomBlockSectionId(sectionId)) return "Custom section";
  return OBJECTIVE_SECTION_LABELS[sectionId];
}

/** Mountable static section ids for the current objective tab context. */
export function resolveAvailableSectionIds(
  customBlockIds: readonly string[] = [],
): ObjectiveSectionId[] {
  return [...CORE_OBJECTIVE_SECTION_IDS, ...customBlockIds.map(toCustomBlockSectionId)];
}

function dedupeAvailableIds(available: readonly ObjectiveSectionId[]): ObjectiveSectionId[] {
  const seen = new Set<ObjectiveSectionId>();
  const result: ObjectiveSectionId[] = [];
  for (const id of available) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function dedupeStoredIds(
  stored: readonly ObjectiveSectionId[],
  availableSet: ReadonlySet<ObjectiveSectionId>,
): ObjectiveSectionId[] {
  const seen = new Set<ObjectiveSectionId>();
  const result: ObjectiveSectionId[] = [];
  for (const id of stored) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function defaultIndex(id: ObjectiveSectionId): number {
  if (isCustomBlockSectionId(id)) {
    return DEFAULT_OBJECTIVE_SECTION_ORDER.length;
  }
  const idx = DEFAULT_OBJECTIVE_SECTION_ORDER.indexOf(id);
  return idx === -1 ? DEFAULT_OBJECTIVE_SECTION_ORDER.length : idx;
}

/**
 * Merge a stored section order with the live registry.
 * - Drops unknown / unavailable ids.
 * - Inserts newly-available ids at their canonical `DEFAULT_OBJECTIVE_SECTION_ORDER` slot.
 * - Preserves doctor-chosen relative order for known stored ids.
 */
export function normalizeSectionOrder(
  stored: readonly ObjectiveSectionId[],
  available: readonly ObjectiveSectionId[],
): ObjectiveSectionId[] {
  const availableIds = dedupeAvailableIds(available);
  const availableSet = new Set<ObjectiveSectionId>(availableIds);
  const canonicalOrder = availableIds.filter((id) => isStaticObjectiveSectionId(id));

  if (canonicalOrder.length === 0 && availableIds.length === 0) return [];

  const storedKnown = dedupeStoredIds(stored, availableSet);
  if (storedKnown.length === 0) {
    return availableIds.filter(
      (id) => isCustomBlockSectionId(id) || canonicalOrder.includes(id as StaticObjectiveSectionId),
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

/**
 * Where a freshly-added custom block lands in the order: right after the
 * primary `test_results` content, ahead of the legacy fallbacks. Falls back to
 * the end of the order when `test_results` is absent.
 */
export function resolveCustomEmptyChromeIndex(order: readonly ObjectiveSectionId[]): number {
  const testResultsIdx = order.indexOf("test_results");
  if (testResultsIdx >= 0) return testResultsIdx + 1;
  return order.length;
}

export function insertCustomBlockIntoOrder(
  order: readonly ObjectiveSectionId[],
  blockId: string,
): ObjectiveSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  if (order.includes(sectionId)) return [...order];

  const insertAt = resolveCustomEmptyChromeIndex(order);
  const next = [...order];
  next.splice(insertAt, 0, sectionId);
  return next;
}

export function removeCustomBlockFromOrder(
  order: readonly ObjectiveSectionId[],
  blockId: string,
): ObjectiveSectionId[] {
  const sectionId = toCustomBlockSectionId(blockId);
  return order.filter((id) => id !== sectionId);
}

/** Drop stale custom-block ids and append any newly-minted ones (P10-D4: never persisted to hidden). */
export function syncCustomBlockIdsInOrder(
  order: readonly ObjectiveSectionId[],
  customBlockIds: readonly string[],
): ObjectiveSectionId[] {
  const available = resolveAvailableSectionIds(customBlockIds);
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
 * Resolve the render order, merging a stored doctor default with the live
 * registry. Static sections normalise first (custom_block ids in the stored
 * default are dropped — they re-mint per visit, §3.3); current custom blocks
 * are then inserted at their chrome slot (after `test_results`).
 */
export function resolveInitialSectionOrder(
  stored: readonly string[],
  customBlockIds: readonly string[] = [],
): ObjectiveSectionId[] {
  const normalized = normalizeSectionOrder(
    stored as ObjectiveSectionId[],
    resolveAvailableSectionIds(),
  );
  return syncCustomBlockIdsInOrder(normalized, customBlockIds);
}

export type SectionDropIntent = "before" | "after";

export const OBJECTIVE_SECTION_DRAG_MIME = "application/x-objective-section-id";

export function readObjectiveSectionDragId(
  dataTransfer: DataTransfer | null,
): ObjectiveSectionId | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(OBJECTIVE_SECTION_DRAG_MIME);
  return raw ? (raw as ObjectiveSectionId) : null;
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
  order: readonly ObjectiveSectionId[],
  fromIndex: number,
  direction: "up" | "down",
): ObjectiveSectionId[] {
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
  order: readonly ObjectiveSectionId[],
  fromIndex: number,
  targetIndex: number,
  intent: SectionDropIntent,
): ObjectiveSectionId[] {
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    targetIndex < 0 ||
    targetIndex >= order.length
  ) {
    return [...order];
  }

  // Insert relative to the target; account for the gap left by the removed item.
  let insertAt = intent === "before" ? targetIndex : targetIndex + 1;
  if (fromIndex < insertAt) insertAt -= 1;
  if (insertAt === fromIndex) return [...order];

  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(insertAt, 0, item!);
  return next;
}

/** Load the doctor's stored section order (empty = use canonical default). */
export async function fetchObjectiveSectionOrder(
  token: string,
): Promise<ObjectiveSectionId[]> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.objective_section_order ?? []) as ObjectiveSectionId[];
}

/** Persist the doctor's section order default (obj-10 transport; obj-11 wires UI). */
export async function saveObjectiveSectionOrder(
  token: string,
  order: ObjectiveSectionId[],
): Promise<ObjectiveSectionId[]> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { objective_section_order: order });
  return (res.data.settings.objective_section_order ?? []) as ObjectiveSectionId[];
}
