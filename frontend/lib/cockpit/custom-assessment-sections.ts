/**
 * Assessment custom-section engine (assessment-plan-custom-sections).
 *
 * Reuses — does NOT fork — the shipped subjective custom-subsection engine
 * (`custom-subsections.ts`): same `CustomSubsection` identity, add/edit/remove/
 * serialize/seed helpers, and doctor-default template shape. Assessment-specific
 * concerns:
 *   - dedicated visit column (`prescriptions.assessment_custom_sections`);
 *   - per-doctor default persistence to `doctor_settings.assessment_custom_sections`.
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

export const ASSESSMENT_CUSTOM_SECTIONS_MAX = CUSTOM_SUBSECTIONS_MAX;

/** Plain-text mirror for PDF/SMS/snapshot. "" when empty. */
export function serializeAssessmentCustomSections(sections: CustomSubsection[]): string {
  return serializeCustomSubsections(sections);
}

/** Strip visit bodies; keep titles/structure for the per-doctor default template. */
export function assessmentCustomSectionsToDefaultTemplate(
  sections: CustomSubsection[],
): CustomSubsection[] {
  return customSubsectionsToDefaultTemplate(sections);
}

/** Clone a doctor default into a fresh visit (ids preserved, empty bodies). */
export function seedAssessmentCustomSectionsFromDefault(
  defaults: CustomSubsection[],
): CustomSubsection[] {
  return seedCustomSubsectionsFromDefault(defaults);
}

/** Stable structural signature (titles only) for autosaving the per-doctor default. */
export function assessmentCustomSectionsStructureKey(sections: CustomSubsection[]): string {
  return customSubsectionsStructureKey(sections);
}

/** Persist the doctor's assessment custom-section default (titles/structure only). */
export async function saveAssessmentCustomSectionsDefault(
  token: string,
  sections: CustomSubsection[],
): Promise<void> {
  const { patchDoctorSettings } = await import("@/lib/api");
  await patchDoctorSettings(token, {
    assessment_custom_sections: assessmentCustomSectionsToDefaultTemplate(sections),
  });
}
