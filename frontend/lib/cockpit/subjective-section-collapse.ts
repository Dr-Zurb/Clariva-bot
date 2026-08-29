import {
  isCustomBlockSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

/** Per-doctor collapse overrides keyed by section id (true = open). */
export type SubjectiveSectionCollapseMap = Record<string, boolean>;

/**
 * Resolve effective open/closed state for each mountable section by layering
 * stored overrides over the caller-supplied defaults (subj-29 / P9-D2).
 * An explicit stored value always wins; absent key ⇒ default.
 */
export function resolveSectionOpenState(
  stored: Readonly<SubjectiveSectionCollapseMap>,
  defaultsById: Readonly<Record<SubjectiveSectionId, boolean>>,
): Record<SubjectiveSectionId, boolean> {
  const resolved: Record<SubjectiveSectionId, boolean> = {};

  for (const id of Object.keys(defaultsById) as SubjectiveSectionId[]) {
    const defaultOpen = defaultsById[id]!;
    resolved[id] = Object.prototype.hasOwnProperty.call(stored, id)
      ? stored[id]!
      : defaultOpen;
  }

  return resolved;
}

/**
 * Compute the minimal override map to persist — only sections toggled away
 * from their default, excluding per-visit `custom_block:*` ids (P9-D4).
 */
export function collapseOverridesToPersist(
  currentOpenById: Readonly<SubjectiveSectionCollapseMap>,
  defaultsById: Readonly<Record<SubjectiveSectionId, boolean>>,
): SubjectiveSectionCollapseMap {
  const overrides: SubjectiveSectionCollapseMap = {};

  for (const id of Object.keys(defaultsById) as SubjectiveSectionId[]) {
    if (isCustomBlockSectionId(id)) continue;
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
  overrides: Readonly<SubjectiveSectionCollapseMap>,
): string {
  const stable: SubjectiveSectionCollapseMap = {};
  for (const key of Object.keys(overrides).sort()) {
    stable[key] = overrides[key]!;
  }
  return JSON.stringify(stable);
}

/** Load the doctor's stored collapse overrides (empty = use canonical defaults). */
export async function fetchSubjectiveSectionCollapsed(
  token: string,
): Promise<SubjectiveSectionCollapseMap> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.subjective_section_collapsed ?? {};
}

/** Persist the doctor's collapse overrides (subj-28 transport; subj-30 wires UI). */
export async function saveSubjectiveSectionCollapsed(
  token: string,
  overrides: SubjectiveSectionCollapseMap,
): Promise<SubjectiveSectionCollapseMap> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { subjective_section_collapsed: overrides });
  return res.data.settings.subjective_section_collapsed ?? {};
}
