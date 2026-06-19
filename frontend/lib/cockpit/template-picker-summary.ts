/**
 * Scope-aware labels and row summaries for <TemplatePicker> (subj-18 UI polish).
 */

import {
  subjectiveComplaintCount,
  templateCustomBlockSourceSectionId,
  templateHasSubjectiveContent,
  templateSubjective,
} from "@/lib/cockpit/apply-subjective-template";
import { hasCustomSubsectionsContent } from "@/lib/cockpit/custom-subsections";
import { hasFamilyHistoryStructuredContent } from "@/lib/cockpit/family-history";
import { hasPastSurgicalHistoryStructuredContent } from "@/lib/cockpit/past-surgical-history";
import { hasSocialHistoryStructuredContent } from "@/lib/cockpit/social-history";
import { pmhTemplateHasContent } from "@/lib/chart/use-pmh-template-apply";
import type { CustomSubsection } from "@/types/prescription";
import type { DoctorRxTemplate, RxTemplateScope } from "@/types/rx-template";

export const SCOPE_PICKER_LABELS: Record<
  RxTemplateScope,
  { title: string; hint?: string }
> = {
  subjective_full: {
    title: "Subjective templates",
    hint: "Complaints, histories & medical background",
  },
  chief_complaints: {
    title: "Complaint templates",
    hint: "Chief complaint cards",
  },
  past_medical: {
    title: "Medical history templates",
    hint: "Conditions & medications",
  },
  past_surgical: {
    title: "Past surgical templates",
    hint: "Procedures & surgical history",
  },
  family_history: {
    title: "Family history templates",
  },
  social_history: {
    title: "Social history templates",
    hint: "Personal & social history",
  },
  allergies: {
    title: "Allergy templates",
  },
  custom_block: {
    title: "Custom section templates",
    hint: "Doctor-defined Subjective sections",
  },
};

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function allergiesTemplateHasContent(template: DoctorRxTemplate): boolean {
  return (template.allergies_json?.allergies ?? []).some((a) => a.allergen?.trim());
}

/** Custom subsections carried by a template's `subjective_json` (subj-39). */
function templateCustomSubsections(template: DoctorRxTemplate): CustomSubsection[] {
  return templateSubjective(template).customSubsections ?? [];
}

/** Whether a scoped template row has apply-able content for its scope. */
export function templateHasScopedContent(
  template: DoctorRxTemplate,
  scope: RxTemplateScope,
): boolean {
  switch (scope) {
    case "past_medical":
      return pmhTemplateHasContent(template.pmh_json);
    case "allergies":
      return allergiesTemplateHasContent(template);
    case "chief_complaints":
      return subjectiveComplaintCount(template) > 0;
    case "family_history": {
      const subj = templateSubjective(template);
      return (
        (subj.familyHistoryStructured &&
          hasFamilyHistoryStructuredContent(subj.familyHistoryStructured)) ||
        Boolean(subj.familyHistory?.trim())
      );
    }
    case "social_history": {
      const subj = templateSubjective(template);
      return (
        (subj.socialHistoryStructured &&
          hasSocialHistoryStructuredContent(subj.socialHistoryStructured)) ||
        Boolean(subj.socialHistory?.trim())
      );
    }
    case "past_surgical": {
      const subj = templateSubjective(template);
      return (
        (subj.pastSurgicalHistoryStructured &&
          hasPastSurgicalHistoryStructuredContent(subj.pastSurgicalHistoryStructured)) ||
        Boolean(subj.pastSurgicalHistory?.trim())
      );
    }
    case "custom_block":
      return hasCustomSubsectionsContent(templateCustomSubsections(template));
    case "subjective_full":
      return templateHasSubjectiveContent(template);
  }
}

/** One-line content summary for a template row (excludes last-used). */
export function formatTemplateSummary(
  template: DoctorRxTemplate,
  scope: RxTemplateScope,
): string {
  switch (scope) {
    case "past_medical": {
      const condCount = (template.pmh_json?.conditions ?? []).filter((c) =>
        c.condition?.trim(),
      ).length;
      const medCount = (template.pmh_json?.medications ?? []).filter((m) =>
        m.drugName?.trim(),
      ).length;
      const parts: string[] = [];
      if (condCount > 0) parts.push(plural(condCount, "condition"));
      if (medCount > 0) parts.push(plural(medCount, "medication", "medications"));
      return parts.length > 0 ? parts.join(" · ") : "Empty template";
    }
    case "allergies": {
      const count = (template.allergies_json?.allergies ?? []).filter((a) =>
        a.allergen?.trim(),
      ).length;
      return count > 0 ? plural(count, "allergy", "allergies") : "Empty template";
    }
    case "chief_complaints": {
      const count = subjectiveComplaintCount(template);
      return count > 0 ? plural(count, "complaint") : "Empty template";
    }
    case "family_history":
      return templateHasScopedContent(template, scope) ? "Family history" : "Empty template";
    case "social_history":
      return templateHasScopedContent(template, scope) ? "Social history" : "Empty template";
    case "past_surgical":
      return templateHasScopedContent(template, scope) ? "Surgical history" : "Empty template";
    case "custom_block": {
      const count = templateCustomSubsections(template).filter((s) =>
        hasCustomSubsectionsContent([s]),
      ).length;
      return count > 0 ? plural(count, "section") : "Empty template";
    }
    case "subjective_full": {
      const parts: string[] = [];
      const complaintCount = subjectiveComplaintCount(template);
      if (complaintCount > 0) parts.push(plural(complaintCount, "complaint"));
      const subj = templateSubjective(template);
      if (
        (subj.familyHistoryStructured &&
          hasFamilyHistoryStructuredContent(subj.familyHistoryStructured)) ||
        subj.familyHistory?.trim()
      ) {
        parts.push("family history");
      }
      if (
        (subj.socialHistoryStructured &&
          hasSocialHistoryStructuredContent(subj.socialHistoryStructured)) ||
        subj.socialHistory?.trim()
      ) {
        parts.push("social history");
      }
      if (
        (subj.pastSurgicalHistoryStructured &&
          hasPastSurgicalHistoryStructuredContent(subj.pastSurgicalHistoryStructured)) ||
        subj.pastSurgicalHistory?.trim()
      ) {
        parts.push("surgical history");
      }
      const condCount = (template.pmh_json?.conditions ?? []).filter((c) =>
        c.condition?.trim(),
      ).length;
      const medCount = (template.pmh_json?.medications ?? []).filter((m) =>
        m.drugName?.trim(),
      ).length;
      if (condCount > 0) parts.push(plural(condCount, "condition"));
      if (medCount > 0) parts.push(plural(medCount, "medication", "medications"));
      const customCount = templateCustomSubsections(template).filter((s) =>
        hasCustomSubsectionsContent([s]),
      ).length;
      if (customCount > 0) parts.push(plural(customCount, "custom section", "custom sections"));
      return parts.length > 0 ? parts.join(" · ") : "Empty template";
    }
  }
}

/** Scope-aware client search across template payload fields. */
export function templateMatchesSearch(
  template: DoctorRxTemplate,
  scope: RxTemplateScope,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (template.name.toLowerCase().includes(q)) return true;
  if (template.description?.toLowerCase().includes(q)) return true;

  switch (scope) {
    case "past_medical":
      for (const c of template.pmh_json?.conditions ?? []) {
        if (c.condition?.toLowerCase().includes(q)) return true;
      }
      for (const m of template.pmh_json?.medications ?? []) {
        if (m.drugName?.toLowerCase().includes(q)) return true;
      }
      return false;
    case "allergies":
      for (const a of template.allergies_json?.allergies ?? []) {
        if (a.allergen?.toLowerCase().includes(q)) return true;
      }
      return false;
    case "chief_complaints":
    case "subjective_full":
      for (const c of templateSubjective(template).complaints ?? []) {
        if (c.name?.toLowerCase().includes(q)) return true;
      }
      if (scope === "subjective_full") {
        for (const c of template.pmh_json?.conditions ?? []) {
          if (c.condition?.toLowerCase().includes(q)) return true;
        }
        for (const m of template.pmh_json?.medications ?? []) {
          if (m.drugName?.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    case "family_history":
    case "social_history":
    case "past_surgical": {
      const subj = templateSubjective(template);
      const textFields = [
        subj.familyHistory,
        subj.socialHistory,
        subj.pastSurgicalHistory,
      ];
      return textFields.some((t) => t?.toLowerCase().includes(q));
    }
    case "custom_block":
      for (const s of templateCustomSubsections(template)) {
        if (s.title?.toLowerCase().includes(q)) return true;
        if (s.body?.toLowerCase().includes(q)) return true;
        for (const c of s.children ?? []) {
          if (c.title?.toLowerCase().includes(q)) return true;
          if (c.body?.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    default:
      return false;
  }
}

/**
 * Advisory ordering for `custom_block` picker rows (subj-40): templates stamped with
 * the current section id surface first; all rows remain applicable.
 */
export function sortCustomBlockTemplatesForSection(
  templates: DoctorRxTemplate[],
  sectionId: string | undefined,
): DoctorRxTemplate[] {
  if (!sectionId) return templates;
  return [...templates].sort((a, b) => {
    const aOwn = templateCustomBlockSourceSectionId(a) === sectionId;
    const bOwn = templateCustomBlockSourceSectionId(b) === sectionId;
    if (aOwn && !bOwn) return -1;
    if (!aOwn && bOwn) return 1;
    return 0;
  });
}
