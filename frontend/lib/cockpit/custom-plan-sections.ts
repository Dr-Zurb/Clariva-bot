/**
 * Plan custom-section engine (assessment-plan-custom-sections).
 *
 * Reuses — does NOT fork — the shipped subjective custom-subsection engine
 * (`custom-subsections.ts`): same `CustomSubsection` identity, add/edit/remove/
 * serialize/seed helpers, and doctor-default template shape. Plan-specific
 * concerns:
 *   - dedicated visit column (`prescriptions.plan_custom_sections`);
 *   - per-doctor default persistence to `doctor_settings.plan_custom_sections`.
 */
import {
  CUSTOM_SUBSECTIONS_MAX,
  customSubsectionsStructureKey,
  customSubsectionsToDefaultTemplate,
  seedCustomSubsectionsFromDefault,
  serializeCustomSubsections,
  type CustomSubsection,
} from "@/lib/cockpit/custom-subsections";

export type { CustomSubsection } from "@/lib/cockpit/custom-subsections";

export const PLAN_CUSTOM_SECTIONS_MAX = CUSTOM_SUBSECTIONS_MAX;

/** Plain-text mirror for PDF/SMS/snapshot. "" when empty. */
export function serializePlanCustomSections(sections: CustomSubsection[]): string {
  return serializeCustomSubsections(sections);
}

/** Strip visit bodies; keep titles/structure for the per-doctor default template. */
export function planCustomSectionsToDefaultTemplate(
  sections: CustomSubsection[],
): CustomSubsection[] {
  return customSubsectionsToDefaultTemplate(sections);
}

/** Clone a doctor default into a fresh visit (ids preserved, empty bodies). */
export function seedPlanCustomSectionsFromDefault(
  defaults: CustomSubsection[],
): CustomSubsection[] {
  return seedCustomSubsectionsFromDefault(defaults);
}

/** Stable structural signature (titles only) for autosaving the per-doctor default. */
export function planCustomSectionsStructureKey(sections: CustomSubsection[]): string {
  return customSubsectionsStructureKey(sections);
}

/** Persist the doctor's plan custom-section default (titles/structure only). */
export async function savePlanCustomSectionsDefault(
  token: string,
  sections: CustomSubsection[],
): Promise<void> {
  const { patchDoctorSettings } = await import("@/lib/api");
  await patchDoctorSettings(token, {
    plan_custom_sections: planCustomSectionsToDefaultTemplate(sections),
  });
}
