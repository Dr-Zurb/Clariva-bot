import {
  ASSESSMENT_SECTION_LABELS,
  type AssessmentSectionId,
} from "@/lib/cockpit/assessment-section-order";

/** Per-doctor hidden section ids (delta set — absent ⇒ visible). */
export type AssessmentSectionHiddenSet = AssessmentSectionId[];

const STATIC_SECTION_ID_SET = new Set<string>(Object.keys(ASSESSMENT_SECTION_LABELS));

function isKnownStaticSectionId(id: string): id is AssessmentSectionId {
  return STATIC_SECTION_ID_SET.has(id);
}

function toMountableSet(
  mountableIds: readonly AssessmentSectionId[],
): ReadonlySet<AssessmentSectionId> {
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
  order: readonly AssessmentSectionId[],
  hiddenIds: readonly string[],
  mountableIds: readonly AssessmentSectionId[],
): AssessmentSectionId[] {
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
  id: AssessmentSectionId,
  hiddenIds: readonly string[],
  mountableIds: readonly AssessmentSectionId[],
): boolean {
  if (!toMountableSet(mountableIds).has(id)) return false;
  return toHiddenSet(hiddenIds).has(id);
}

/**
 * Compute the minimal hidden set to persist — static Assessment ids only, deduped.
 */
export function hiddenOverridesToPersist(
  hiddenIds: readonly string[],
  _mountableIds: readonly AssessmentSectionId[],
): AssessmentSectionHiddenSet {
  const seen = new Set<AssessmentSectionId>();
  const result: AssessmentSectionHiddenSet = [];

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
export async function fetchAssessmentSectionHidden(
  token: string,
): Promise<AssessmentSectionHiddenSet> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.assessment_section_hidden ??
    []) as AssessmentSectionHiddenSet;
}

/** Persist the doctor's hidden set. */
export async function saveAssessmentSectionHidden(
  token: string,
  hiddenIds: AssessmentSectionHiddenSet,
): Promise<AssessmentSectionHiddenSet> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, {
    assessment_section_hidden: hiddenIds,
  });
  return (res.data.settings.assessment_section_hidden ??
    []) as AssessmentSectionHiddenSet;
}
