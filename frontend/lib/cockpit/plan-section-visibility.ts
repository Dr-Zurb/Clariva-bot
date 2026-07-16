import {
  PLAN_SECTION_LABELS,
  type PlanSectionId,
} from "@/lib/cockpit/plan-section-order";

/** Per-doctor hidden section ids (delta set — absent ⇒ visible). */
export type PlanSectionHiddenSet = PlanSectionId[];

const STATIC_SECTION_ID_SET = new Set<string>(Object.keys(PLAN_SECTION_LABELS));

function isKnownStaticSectionId(id: string): id is PlanSectionId {
  return STATIC_SECTION_ID_SET.has(id);
}

function toMountableSet(
  mountableIds: readonly PlanSectionId[],
): ReadonlySet<PlanSectionId> {
  return new Set(mountableIds);
}

function toHiddenSet(hiddenIds: readonly string[]): ReadonlySet<string> {
  return new Set(hiddenIds);
}

/**
 * Resolve the visible render plan by filtering mountable hidden ids out of
 * `order`.
 */
export function resolveVisibleSections(
  order: readonly PlanSectionId[],
  hiddenIds: readonly string[],
  mountableIds: readonly PlanSectionId[],
): PlanSectionId[] {
  const hidden = toHiddenSet(hiddenIds);
  const mountable = toMountableSet(mountableIds);

  return order.filter((id) => {
    if (!hidden.has(id)) return true;
    if (!mountable.has(id)) return true;
    return false;
  });
}

/** Whether a section should show as hidden in the manage-sections menu. */
export function isSectionHidden(
  id: PlanSectionId,
  hiddenIds: readonly string[],
  mountableIds: readonly PlanSectionId[],
): boolean {
  if (!toMountableSet(mountableIds).has(id)) return false;
  return toHiddenSet(hiddenIds).has(id);
}

/**
 * Compute the minimal hidden set to persist — static Plan ids only, deduped.
 */
export function hiddenOverridesToPersist(
  hiddenIds: readonly string[],
  _mountableIds: readonly PlanSectionId[],
): PlanSectionHiddenSet {
  const seen = new Set<PlanSectionId>();
  const result: PlanSectionHiddenSet = [];

  for (const id of hiddenIds) {
    if (typeof id !== "string") continue;
    if (!isKnownStaticSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/** Stable JSON key for debounce guards. */
export function serializeHiddenIds(hiddenIds: readonly string[]): string {
  return JSON.stringify(hiddenOverridesToPersist(hiddenIds, []));
}

/** Load the doctor's stored hidden set. */
export async function fetchPlanSectionHidden(
  token: string,
): Promise<PlanSectionHiddenSet> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.plan_section_hidden ?? []) as PlanSectionHiddenSet;
}

/** Persist the doctor's hidden set. */
export async function savePlanSectionHidden(
  token: string,
  hiddenIds: PlanSectionHiddenSet,
): Promise<PlanSectionHiddenSet> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { plan_section_hidden: hiddenIds });
  return (res.data.settings.plan_section_hidden ?? []) as PlanSectionHiddenSet;
}
