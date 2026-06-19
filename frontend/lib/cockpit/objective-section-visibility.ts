import {
  OBJECTIVE_SECTION_LABELS,
  type ObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";

/** Per-doctor hidden section ids (delta set — absent ⇒ visible). */
export type ObjectiveSectionHiddenSet = ObjectiveSectionId[];

const STATIC_SECTION_ID_SET = new Set<string>(Object.keys(OBJECTIVE_SECTION_LABELS));

function isKnownStaticSectionId(id: string): id is ObjectiveSectionId {
  return STATIC_SECTION_ID_SET.has(id);
}

function toMountableSet(
  mountableIds: readonly ObjectiveSectionId[],
): ReadonlySet<ObjectiveSectionId> {
  return new Set(mountableIds);
}

function toHiddenSet(hiddenIds: readonly string[]): ReadonlySet<string> {
  return new Set(hiddenIds);
}

/**
 * Resolve the visible render plan by filtering mountable hidden ids out of
 * `order` (obj-12 / P10-D2, P10-D7).
 *
 * - Removes an id only when it is **both** in `hiddenIds` **and** mountable.
 * - Ids not currently mountable pass through `order` untouched even if hidden.
 */
export function resolveVisibleSections(
  order: readonly ObjectiveSectionId[],
  hiddenIds: readonly string[],
  mountableIds: readonly ObjectiveSectionId[],
): ObjectiveSectionId[] {
  const hidden = toHiddenSet(hiddenIds);
  const mountable = toMountableSet(mountableIds);

  return order.filter((id) => {
    if (!hidden.has(id)) return true;
    if (!mountable.has(id)) return true;
    return false;
  });
}

/**
 * Whether a section should show as hidden in the manage-sections menu (obj-12).
 * Non-mountable ids are never reported hidden.
 */
export function isSectionHidden(
  id: ObjectiveSectionId,
  hiddenIds: readonly string[],
  mountableIds: readonly ObjectiveSectionId[],
): boolean {
  if (!toMountableSet(mountableIds).has(id)) return false;
  return toHiddenSet(hiddenIds).has(id);
}

/**
 * Compute the minimal hidden set to persist (obj-12 / P10-D2; P10-D4).
 *
 * Keeps only static objective section ids (custom blocks are removed by
 * deletion, not hidden — obj-13). Dedupes while preserving first-occurrence
 * order. `mountableIds` is accepted for API symmetry with the subjective
 * resolver but is **not** used to strip non-mountable ids from the payload —
 * the doctor's hide intent survives a context switch.
 */
export function hiddenOverridesToPersist(
  hiddenIds: readonly string[],
  _mountableIds: readonly ObjectiveSectionId[],
): ObjectiveSectionHiddenSet {
  const seen = new Set<ObjectiveSectionId>();
  const result: ObjectiveSectionHiddenSet = [];

  for (const id of hiddenIds) {
    if (typeof id !== "string") continue;
    if (!isKnownStaticSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/** Stable JSON key for debounce guards (sorted ids). */
export function serializeHiddenIds(ids: readonly string[]): string {
  return JSON.stringify([...ids].sort());
}

/** Load the doctor's stored hidden section set (empty = nothing hidden). */
export async function fetchObjectiveSectionHidden(
  token: string,
): Promise<ObjectiveSectionHiddenSet> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.objective_section_hidden ?? []) as ObjectiveSectionHiddenSet;
}

/** Persist the doctor's hidden section set (obj-10 transport; obj-12 wires UI). */
export async function saveObjectiveSectionHidden(
  token: string,
  ids: ObjectiveSectionHiddenSet,
): Promise<ObjectiveSectionHiddenSet> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { objective_section_hidden: ids });
  return (res.data.settings.objective_section_hidden ?? []) as ObjectiveSectionHiddenSet;
}
