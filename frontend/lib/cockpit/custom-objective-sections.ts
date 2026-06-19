/**
 * Objective custom-section engine (obj-13).
 *
 * Reuses — does NOT fork — the shipped subjective custom-subsection engine
 * (`custom-subsections.ts`): same `CustomSubsection` identity (`custom_block:<uuid>`),
 * the same add/edit/remove/serialize/seed helpers, and the same doctor-default
 * template shape. The only objective-specific concerns live here:
 *   - derived-text contract (OBJ-D2): custom content reaches the PDF/SMS/snapshot
 *     ONLY through the derived `examination_findings` text — never a new column;
 *   - per-doctor default persistence to `doctor_settings.objective_custom_sections`.
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

export const OBJECTIVE_CUSTOM_SECTIONS_MAX = CUSTOM_SUBSECTIONS_MAX;

/** Plain-text mirror folded into `examination_findings` on save (OBJ-D2). "" when empty. */
export function serializeObjectiveCustomSections(sections: CustomSubsection[]): string {
  return serializeCustomSubsections(sections);
}

/** Strip visit bodies; keep titles/structure for the per-doctor default template. */
export function objectiveCustomSectionsToDefaultTemplate(
  sections: CustomSubsection[],
): CustomSubsection[] {
  return customSubsectionsToDefaultTemplate(sections);
}

/** Clone a doctor default into a fresh visit (ids preserved, empty bodies). */
export function seedObjectiveCustomSectionsFromDefault(
  defaults: CustomSubsection[],
): CustomSubsection[] {
  return seedCustomSubsectionsFromDefault(defaults);
}

/** Stable structural signature (titles only) for autosaving the per-doctor default. */
export function objectiveCustomSectionsStructureKey(sections: CustomSubsection[]): string {
  return customSubsectionsStructureKey(sections);
}

/** Persist the doctor's objective custom-section default (titles/structure only). */
export async function saveObjectiveCustomSectionsDefault(
  token: string,
  sections: CustomSubsection[],
): Promise<void> {
  const { patchDoctorSettings } = await import("@/lib/api");
  await patchDoctorSettings(token, {
    objective_custom_sections: objectiveCustomSectionsToDefaultTemplate(sections),
  });
}
