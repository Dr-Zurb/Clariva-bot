import {
  CORE_PLAN_SECTION_IDS,
  PLAN_SECTION_LABELS,
  type PlanSectionId,
} from "@/lib/cockpit/plan-section-order";

/** Per-doctor hidden section ids. Empty stored set ⇒ factory lean default. */
export type PlanSectionHiddenSet = PlanSectionId[];

/** Visible at factory default. Advice / referral / private notes stay addable. */
export const CORE_PLAN_DEFAULT_VISIBLE_IDS = [
  "investigations",
  "medications",
  "follow_up",
] as const;

const CORE_VISIBLE_SET = new Set<string>(CORE_PLAN_DEFAULT_VISIBLE_IDS);

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

export interface DefaultPlanLayout {
  defaultHidden: PlanSectionId[];
}

/** Factory default: investigations + medications + follow-up on; the rest addable. */
export function resolveDefaultPlanLayout(): DefaultPlanLayout {
  return {
    defaultHidden: CORE_PLAN_SECTION_IDS.filter((id) => !CORE_VISIBLE_SET.has(id)),
  };
}

/**
 * Layer the doctor override over the factory default. Stored set wins wholesale
 * when present; otherwise the lean default applies (vitals / V3-D3 analogue).
 */
export function resolveEffectivePlanHidden({
  storedHidden,
}: {
  storedHidden: readonly string[];
}): { hidden: PlanSectionId[] } {
  const seed = resolveDefaultPlanLayout();
  const source = storedHidden.length > 0 ? storedHidden : seed.defaultHidden;
  const seen = new Set<PlanSectionId>();
  const hidden: PlanSectionId[] = [];

  for (const id of source) {
    if (!isKnownStaticSectionId(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    hidden.push(id);
  }

  return { hidden };
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

/** Load the doctor's stored hidden set (empty = factory lean default). */
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
