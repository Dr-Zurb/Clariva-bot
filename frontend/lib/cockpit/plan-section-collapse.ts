import { isPlanSectionId } from "@/lib/cockpit/plan-section-order";

/** Per-doctor collapse overrides keyed by section id (true = open). */
export type PlanSectionCollapseMap = Record<string, boolean>;

/**
 * Resolve effective open/closed state for each mountable section by layering
 * stored overrides over the caller-supplied defaults.
 */
export function resolveSectionOpenState(
  stored: Readonly<PlanSectionCollapseMap>,
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
  currentOpenById: Readonly<PlanSectionCollapseMap>,
  defaultsById: Readonly<Record<string, boolean>>,
): PlanSectionCollapseMap {
  const overrides: PlanSectionCollapseMap = {};

  for (const id of Object.keys(defaultsById)) {
    if (!isPlanSectionId(id)) continue;
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
  overrides: Readonly<PlanSectionCollapseMap>,
): string {
  const stable: PlanSectionCollapseMap = {};
  for (const key of Object.keys(overrides).sort()) {
    stable[key] = overrides[key]!;
  }
  return JSON.stringify(stable);
}

/** Load the doctor's stored collapse overrides (empty = use canonical defaults). */
export async function fetchPlanSectionCollapsed(
  token: string,
): Promise<PlanSectionCollapseMap> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return res.data.settings.plan_section_collapsed ?? {};
}

/** Persist the doctor's collapse overrides. */
export async function savePlanSectionCollapsed(
  token: string,
  overrides: PlanSectionCollapseMap,
): Promise<PlanSectionCollapseMap> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { plan_section_collapsed: overrides });
  return res.data.settings.plan_section_collapsed ?? {};
}
