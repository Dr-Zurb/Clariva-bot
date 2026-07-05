/**
 * Scope-aware labels and row summaries for <TemplatePicker> (subj-18 UI polish).
 */

import {
  subjectiveComplaintCount,
  templateCustomBlockSourceSectionId,
  templateHasSubjectiveContent,
  templateSubjective,
} from "@/lib/cockpit/apply-subjective-template";
import {
  templateObjective,
  templateObjectiveCustomBlockSourceSectionId,
  templateObjectiveScopeHasContent,
} from "@/lib/cockpit/apply-objective-template";
import { resolveExamSystem } from "@/lib/cockpit/exam-schema";
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
  // obj-16: objective scopes. Substrate-only labels; the objective picker's
  // scoped row summaries + content filtering land in obj-17.
  objective_full: {
    title: "Objective templates",
    hint: "Vitals, exam findings & results",
  },
  vitals: {
    title: "Vitals templates",
    hint: "Vital sign presets",
  },
  exam_systemic: {
    title: "Systemic exam templates",
  },
  exam_general: {
    title: "General exam templates",
  },
  exam_cvs: {
    title: "Cardiovascular exam templates",
  },
  exam_resp: {
    title: "Respiratory exam templates",
  },
  exam_abd: {
    title: "Abdominal exam templates",
  },
  exam_cns: {
    title: "Neurological exam templates",
  },
  objective_custom_block: {
    title: "Custom section templates",
    hint: "Doctor-defined Objective sections",
  },
  // obj-23: result scopes — structured POC / patient-brought result-row presets.
  test_results: {
    title: "Patient-brought result templates",
    hint: "Structured report-row presets",
  },
  point_of_care: {
    title: "Point-of-care result templates",
    hint: "In-clinic POC result-row presets",
  },
};

/** obj-23: result rows carried by a template's `objective_json`, by source. */
function templateResultRowCount(
  template: DoctorRxTemplate,
  source: "patient_report" | "in_clinic_poc",
): number {
  return (templateObjective(template).testResultsJson ?? []).filter(
    (row) => row?.source === source && typeof row?.name === "string" && row.name.trim(),
  ).length;
}

/** obj-23: whether a result row's text fields match a search query. */
function resultRowMatchesQuery(
  row: { name?: string | null; value?: string | null; unit?: string | null; notes?: string | null } | null | undefined,
  q: string,
): boolean {
  if (!row) return false;
  return [row.name, row.value, row.unit, row.notes].some((t) =>
    t?.toLowerCase().includes(q),
  );
}

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
    case "vitals":
    case "exam_systemic":
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
    case "test_results":
    case "point_of_care":
    case "objective_custom_block":
    case "objective_full":
      return templateObjectiveScopeHasContent(template, scope);
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
    case "vitals":
      return templateObjectiveScopeHasContent(template, scope) ? "Vitals" : "Empty template";
    case "exam_systemic": {
      const count = (templateObjective(template).examinationJson ?? []).length;
      return count > 0 ? plural(count, "system", "systems") : "Empty template";
    }
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
      return templateObjectiveScopeHasContent(template, scope)
        ? resolveExamSystem(
            scope === "exam_general"
              ? "general"
              : scope === "exam_cvs"
                ? "cvs"
                : scope === "exam_resp"
                  ? "resp"
                  : scope === "exam_abd"
                    ? "abd"
                    : "cns",
          ).label
        : "Empty template";
    case "test_results": {
      const count = templateResultRowCount(template, "patient_report");
      return count > 0 ? plural(count, "result", "results") : "Empty template";
    }
    case "point_of_care": {
      const count = templateResultRowCount(template, "in_clinic_poc");
      return count > 0 ? plural(count, "POC result", "POC results") : "Empty template";
    }
    case "objective_custom_block": {
      const count = (templateObjective(template).customSections ?? []).filter((s) =>
        hasCustomSubsectionsContent([s]),
      ).length;
      return count > 0 ? plural(count, "section") : "Empty template";
    }
    case "objective_full": {
      const parts: string[] = [];
      const objective = templateObjective(template);
      if (templateObjectiveScopeHasContent(template, "vitals")) parts.push("vitals");
      const examCount = (objective.examinationJson ?? []).length;
      if (examCount > 0) parts.push(plural(examCount, "exam system", "exam systems"));
      if (objective.testResults?.trim()) parts.push("test results");
      const resultRowCount =
        templateResultRowCount(template, "patient_report") +
        templateResultRowCount(template, "in_clinic_poc");
      if (resultRowCount > 0) parts.push(plural(resultRowCount, "result row", "result rows"));
      const customCount = (objective.customSections ?? []).filter((s) =>
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
    case "test_results":
    case "point_of_care": {
      const source = scope === "test_results" ? "patient_report" : "in_clinic_poc";
      for (const row of templateObjective(template).testResultsJson ?? []) {
        if (row?.source !== source) continue;
        if (resultRowMatchesQuery(row, q)) return true;
      }
      return false;
    }
    case "vitals":
    case "exam_systemic":
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
    case "objective_full": {
      const objective = templateObjective(template);
      for (const finding of objective.examinationJson ?? []) {
        if (finding.systemId?.toLowerCase().includes(q)) return true;
        for (const chip of finding.findings ?? []) {
          if (chip.toLowerCase().includes(q)) return true;
        }
        if (finding.notes?.toLowerCase().includes(q)) return true;
      }
      if (objective.testResults?.toLowerCase().includes(q)) return true;
      if (scope === "objective_full") {
        for (const row of objective.testResultsJson ?? []) {
          if (resultRowMatchesQuery(row, q)) return true;
        }
        for (const s of objective.customSections ?? []) {
          if (s.title?.toLowerCase().includes(q)) return true;
          if (s.body?.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    }
    case "objective_custom_block":
      for (const s of templateObjective(template).customSections ?? []) {
        if (s.title?.toLowerCase().includes(q)) return true;
        if (s.body?.toLowerCase().includes(q)) return true;
        for (const c of s.children ?? []) {
          if (c.title?.toLowerCase().includes(q)) return true;
          if (c.body?.toLowerCase().includes(q)) return true;
        }
      }
      return false;
  }
}

export function sortObjectiveCustomBlockTemplatesForSection(
  templates: DoctorRxTemplate[],
  sectionId: string | undefined,
): DoctorRxTemplate[] {
  if (!sectionId) return templates;
  return [...templates].sort((a, b) => {
    const aOwn = templateObjectiveCustomBlockSourceSectionId(a) === sectionId;
    const bOwn = templateObjectiveCustomBlockSourceSectionId(b) === sectionId;
    if (aOwn && !bOwn) return -1;
    if (!aOwn && bOwn) return 1;
    return 0;
  });
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
