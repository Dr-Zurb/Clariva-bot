/**
 * Client-side linked-template counts for custom-section delete guard (subj-41).
 *
 * Reads the doctor's own `doctor_rx_templates` via existing list endpoints —
 * no new API surface.
 */

import { listRxTemplates } from "@/lib/api";
import {
  templateCustomBlockSourceSectionId,
  templateSubjective,
} from "@/lib/cockpit/apply-subjective-template";
import type { DoctorRxTemplate } from "@/types/rx-template";

export interface LinkedCustomSectionTemplateCounts {
  customBlockTemplates: DoctorRxTemplate[];
  subjectiveFullTemplates: DoctorRxTemplate[];
  customBlockCount: number;
  subjectiveFullCount: number;
}

/** Whether a `subjective_full` template embeds a custom section with the given id. */
export function subjectiveFullTemplateEmbedsSectionId(
  template: DoctorRxTemplate,
  sectionId: string,
): boolean {
  return (templateSubjective(template).customSubsections ?? []).some(
    (section) => section.id === sectionId,
  );
}

/** Pure count helper — used by tests and the delete dialog loader. */
export function countLinkedCustomSectionTemplates(
  sectionId: string,
  customBlockTemplates: readonly DoctorRxTemplate[],
  subjectiveFullTemplates: readonly DoctorRxTemplate[],
): LinkedCustomSectionTemplateCounts {
  const customBlock = customBlockTemplates.filter(
    (template) => templateCustomBlockSourceSectionId(template) === sectionId,
  );
  const subjectiveFull = subjectiveFullTemplates.filter((template) =>
    subjectiveFullTemplateEmbedsSectionId(template, sectionId),
  );

  return {
    customBlockTemplates: [...customBlock],
    subjectiveFullTemplates: [...subjectiveFull],
    customBlockCount: customBlock.length,
    subjectiveFullCount: subjectiveFull.length,
  };
}

/** Fetch linked-template counts for a section id (dialog-only). */
export async function fetchLinkedCustomSectionTemplates(
  token: string,
  sectionId: string,
): Promise<LinkedCustomSectionTemplateCounts> {
  const [customBlockRes, subjectiveFullRes] = await Promise.all([
    listRxTemplates(token, "custom_block"),
    listRxTemplates(token, "subjective_full"),
  ]);

  return countLinkedCustomSectionTemplates(
    sectionId,
    customBlockRes.data.templates,
    subjectiveFullRes.data.templates,
  );
}
