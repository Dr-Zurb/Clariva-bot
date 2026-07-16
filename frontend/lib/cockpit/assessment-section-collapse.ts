import { isAssessmentSectionId } from "@/lib/cockpit/assessment-section-order";

/** Per-doctor collapse overrides keyed by section id (true = open). */
export type AssessmentSectionCollapseMap = Record<string, boolean>;

/**
 * Resolve effective open/closed state for each mountable section by layering
 * stored overrides over the caller-supplied defaults.
 */
export function resolveSectionOpenState(
  stored: Readonly<AssessmentSectionCollapseMap>,
  defaultsById: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const resolved: Record<string, boolean> = {};

  for (const id of Object.keys(defaultsById)) {
    const defaultOpen = defaultsById[id]!;
    resolved[id] = Object.prototype.hasOwnProperty.call(stored, id)
      ? stored[id]!
      : defaultOpen;
  }

  return resolved;
}

/**
 * Compute the minimal override map to persist — only sections toggled away
 * from their default.
 */
export function collapseOverridesToPersist(
  currentOpenById: Readonly<AssessmentSectionCollapseMap>,
  defaultsById: Readonly<Record<string, boolean>>,
): AssessmentSectionCollapseMap {
  const overrides: AssessmentSectionCollapseMap = {};

  for (const id of Object.keys(defaultsById)) {
    if (!isAssessmentSectionId(id)) continue;
    if (!Object.prototype.hasOwnProperty.call(currentOpenById, id)) continue;

    const currentOpen = currentOpenById[id]!;
    const defaultOpen = defaultsById[id]!;
    if (currentOpen !== defaultOpen) {
      overrides[id] = currentOpen;
    }
  }

  return overrides;
}

/** Stable JSON key for debounce guards (sorted keys). */
export function serializeCollapseOverrides(
  overrides: Readonly<AssessmentSectionCollapseMap>,
): string {
  const stable: AssessmentSectionCollapseMap = {};
  for (const key of Object.keys(overrides).sort()) {
    stable[key] = overrides[key]!;
  }
  return JSON.stringify(stable);
}

/** Load the doctor's stored collapse overrides (empty = use canonical defaults). */
export async function fetchAssessmentSectionCollapsed(
  token: string,
): Promise<AssessmentSectionCollapseMap> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.assessment_section_collapsed ?? {};
}

/** Persist the doctor's collapse overrides. */
export async function saveAssessmentSectionCollapsed(
  token: string,
  overrides: AssessmentSectionCollapseMap,
): Promise<AssessmentSectionCollapseMap> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, {
    assessment_section_collapsed: overrides,
  });
  return res.data.settings.assessment_section_collapsed ?? {};
}
