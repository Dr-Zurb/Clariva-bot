import { isCustomBlockSectionId } from "@/lib/cockpit/objective-section-order";

/** Per-doctor collapse overrides keyed by section id (true = open). */
export type ObjectiveSectionCollapseMap = Record<string, boolean>;

/**
 * Resolve effective open/closed state for each mountable section by layering
 * stored overrides over the caller-supplied defaults (obj-11 / P3-D4).
 * An explicit stored value always wins; absent key ⇒ default.
 */
export function resolveSectionOpenState(
  stored: Readonly<ObjectiveSectionCollapseMap>,
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
 * from their default, excluding per-visit `custom_block:*` ids (P3-D4).
 */
export function collapseOverridesToPersist(
  currentOpenById: Readonly<ObjectiveSectionCollapseMap>,
  defaultsById: Readonly<Record<string, boolean>>,
): ObjectiveSectionCollapseMap {
  const overrides: ObjectiveSectionCollapseMap = {};

  for (const id of Object.keys(defaultsById)) {
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
  overrides: Readonly<ObjectiveSectionCollapseMap>,
): string {
  const stable: ObjectiveSectionCollapseMap = {};
  for (const key of Object.keys(overrides).sort()) {
    stable[key] = overrides[key]!;
  }
  return JSON.stringify(stable);
}

/** Load the doctor's stored collapse overrides (empty = use canonical defaults). */
export async function fetchObjectiveSectionCollapsed(
  token: string,
): Promise<ObjectiveSectionCollapseMap> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.objective_section_collapsed ?? {};
}

/** Persist the doctor's collapse overrides (obj-10 transport; obj-11 wires UI). */
export async function saveObjectiveSectionCollapsed(
  token: string,
  overrides: ObjectiveSectionCollapseMap,
): Promise<ObjectiveSectionCollapseMap> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { objective_section_collapsed: overrides });
  return res.data.settings.objective_section_collapsed ?? {};
}
