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
import {
  investigationsOrdersCount,
  templateInvestigationsHasContent,
} from "@/lib/cockpit/apply-investigations-template";
import {
  medicinesNamedCount,
  templateMedicinesHasContent,
} from "@/lib/cockpit/apply-medicines-template";
import { templatePlanScopeHasContent } from "@/lib/cockpit/apply-plan-template";
import { templateAssessmentScopeHasContent } from "@/lib/cockpit/apply-assessment-template";
import { normalizeDiagnoses } from "@/lib/cockpit/diagnoses";
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
  patient_background: {
    title: "Patient background templates",
    hint: "Past medical + past surgical presets",
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
  free_text_notes: {
    title: "Additional notes templates",
    hint: "Free-text history notes presets",
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
  exam_additional_notes: {
    title: "Exam additional notes templates",
    hint: "Free-text examination notes presets",
  },
  objective_notes: {
    title: "Objective notes templates",
    hint: "Objective tab notes presets",
  },
  objective_custom_block: {
    title: "Custom section templates",
    hint: "Doctor-defined Objective sections",
  },
  // obj-23 / rpt-01: Reports templates — all structured result rows (any source).
  // Legacy `point_of_care` templates are remapped into this picker on read.
  test_results: {
    title: "Reports templates",
    hint: "Structured result-row presets (incl. former POC templates)",
  },
  point_of_care: {
    title: "Point-of-care result templates",
    hint: "In-clinic POC result-row presets",
  },
  investigations_orders: {
    title: "Investigations templates",
    hint: "Order list presets",
  },
  medicines: {
    title: "Medicines templates",
    hint: "Medicine list presets",
  },
  advice: {
    title: "Advice templates",
    hint: "Advice & education presets",
  },
  follow_up: {
    title: "Follow-up templates",
    hint: "Follow-up interval & notes presets",
  },
  referral: {
    title: "Referral templates",
    hint: "Referral specialty & notes presets",
  },
  clinical_notes: {
    title: "Clinical notes templates",
    hint: "Private clinical notes presets",
  },
  plan_full: {
    title: "Plan templates",
    hint: "Full plan tab presets",
  },
  diagnoses: {
    title: "Diagnoses templates",
    hint: "Structured diagnosis-row presets",
  },
  known_conditions: {
    title: "Known conditions templates",
    hint: "Chart known-condition presets",
  },
  assessment_notes: {
    title: "Assessment notes templates",
    hint: "Private assessment notes presets",
  },
  assessment_full: {
    title: "Assessment templates",
    hint: "Full assessment tab presets",
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
    case "patient_background": {
      const subj = templateSubjective(template);
      const hasPsh =
        (subj.pastSurgicalHistoryStructured &&
          hasPastSurgicalHistoryStructuredContent(subj.pastSurgicalHistoryStructured)) ||
        Boolean(subj.pastSurgicalHistory?.trim());
      return pmhTemplateHasContent(template.pmh_json) || hasPsh;
    }
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
    case "free_text_notes":
      return Boolean(template.hopi?.trim());
    case "subjective_full":
      return templateHasSubjectiveContent(template);
    case "vitals":
    case "exam_systemic":
    case "exam_general":
    case "exam_cvs":
    case "exam_resp":
    case "exam_abd":
    case "exam_cns":
    case "exam_additional_notes":
    case "objective_notes":
    case "objective_custom_block":
    case "objective_full":
      return templateObjectiveScopeHasContent(template, scope);
    case "test_results":
      // rpt-01 remap-on-read: POC-scoped templates also count as Reports content.
      return (
        templateObjectiveScopeHasContent(template, "test_results") ||
        (template.scope === "point_of_care" &&
          templateObjectiveScopeHasContent(template, "point_of_care"))
      );
    case "point_of_care":
      return templateObjectiveScopeHasContent(template, scope);
    case "investigations_orders":
      return templateInvestigationsHasContent(template);
    case "medicines":
      return templateMedicinesHasContent(template);
    case "advice":
    case "follow_up":
    case "referral":
    case "clinical_notes":
    case "plan_full":
      return templatePlanScopeHasContent(template, scope);
    case "diagnoses":
    case "known_conditions":
    case "assessment_notes":
    case "assessment_full":
      return templateAssessmentScopeHasContent(template, scope);
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
    case "patient_background": {
      const parts: string[] = [];
      const condCount = (template.pmh_json?.conditions ?? []).filter((c) =>
        c.condition?.trim(),
      ).length;
      const medCount = (template.pmh_json?.medications ?? []).filter((m) =>
        m.drugName?.trim(),
      ).length;
      if (condCount > 0) parts.push(plural(condCount, "condition"));
      if (medCount > 0) parts.push(plural(medCount, "medication", "medications"));
      if (templateHasScopedContent(template, "past_surgical")) {
        parts.push("surgical history");
      }
      return parts.length > 0 ? parts.join(" · ") : "Empty template";
    }
    case "free_text_notes":
      return templateHasScopedContent(template, scope) ? "Additional notes" : "Empty template";
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
    case "exam_additional_notes":
    case "objective_notes":
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
                    : scope === "exam_cns"
                      ? "cns"
                      : scope === "exam_additional_notes"
                        ? "additional_notes"
                        : "objective_notes",
          ).label
        : "Empty template";
    case "test_results": {
      // rpt-01: all structured rows; remapped POC templates counted too.
      const count =
        templateResultRowCount(template, "patient_report") +
        templateResultRowCount(template, "in_clinic_poc");
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
    case "investigations_orders": {
      const count = investigationsOrdersCount(template.investigations);
      return count > 0 ? plural(count, "order") : "Empty template";
    }
    case "medicines": {
      const count = medicinesNamedCount(template.medicines_json ?? []);
      return count > 0 ? plural(count, "medicine") : "Empty template";
    }
    case "advice":
      return templatePlanScopeHasContent(template, scope)
        ? "Advice"
        : "Empty template";
    case "follow_up":
      return templatePlanScopeHasContent(template, scope)
        ? "Follow-up"
        : "Empty template";
    case "referral": {
      const specs = (template.plan_json?.referralSpecialties ?? []).filter((s) =>
        s.trim(),
      );
      if (specs.length > 0) return plural(specs.length, "specialty", "specialties");
      return templatePlanScopeHasContent(template, scope)
        ? "Referral"
        : "Empty template";
    }
    case "clinical_notes":
      return templatePlanScopeHasContent(template, scope)
        ? "Clinical notes"
        : "Empty template";
    case "plan_full": {
      const parts: string[] = [];
      const invCount = investigationsOrdersCount(template.investigations);
      if (invCount > 0) parts.push(plural(invCount, "order"));
      const medCount = medicinesNamedCount(template.medicines_json ?? []);
      if (medCount > 0) parts.push(plural(medCount, "medicine"));
      if (templatePlanScopeHasContent(template, "advice")) parts.push("advice");
      if (templatePlanScopeHasContent(template, "follow_up")) parts.push("follow-up");
      if (templatePlanScopeHasContent(template, "referral")) parts.push("referral");
      if (templatePlanScopeHasContent(template, "clinical_notes")) {
        parts.push("clinical notes");
      }
      return parts.length > 0 ? parts.join(" · ") : "Empty template";
    }
    case "diagnoses": {
      const count = normalizeDiagnoses(template.assessment_json?.diagnoses).length;
      return count > 0 ? plural(count, "diagnosis", "diagnoses") : "Empty template";
    }
    case "known_conditions": {
      const count = (template.assessment_json?.knownConditions ?? []).filter((c) =>
        c.condition?.trim(),
      ).length;
      return count > 0 ? plural(count, "condition") : "Empty template";
    }
    case "assessment_notes":
      return templateAssessmentScopeHasContent(template, scope)
        ? "Assessment notes"
        : "Empty template";
    case "assessment_full": {
      const parts: string[] = [];
      const dxCount = normalizeDiagnoses(template.assessment_json?.diagnoses).length;
      if (dxCount > 0) parts.push(plural(dxCount, "diagnosis", "diagnoses"));
      const kcCount = (template.assessment_json?.knownConditions ?? []).filter((c) =>
        c.condition?.trim(),
      ).length;
      if (kcCount > 0) parts.push(plural(kcCount, "condition"));
      if (templateAssessmentScopeHasContent(template, "assessment_notes")) {
        parts.push("notes");
      }
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
    case "patient_background": {
      for (const c of template.pmh_json?.conditions ?? []) {
        if (c.condition?.toLowerCase().includes(q)) return true;
      }
      for (const m of template.pmh_json?.medications ?? []) {
        if (m.drugName?.toLowerCase().includes(q)) return true;
      }
      const subj = templateSubjective(template);
      return Boolean(subj.pastSurgicalHistory?.toLowerCase().includes(q));
    }
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
    case "free_text_notes":
      return (template.hopi ?? "").toLowerCase().includes(q);
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
    case "test_results": {
      // rpt-01: search across any source (incl. remapped POC presets).
      for (const row of templateObjective(template).testResultsJson ?? []) {
        if (resultRowMatchesQuery(row, q)) return true;
      }
      return false;
    }
    case "point_of_care": {
      for (const row of templateObjective(template).testResultsJson ?? []) {
        if (row?.source !== "in_clinic_poc") continue;
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
    case "exam_additional_notes":
    case "objective_notes":
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
    case "investigations_orders":
      return (template.investigations ?? "").toLowerCase().includes(q);
    case "medicines":
      for (const m of template.medicines_json ?? []) {
        if (m.medicineName?.toLowerCase().includes(q)) return true;
        if (m.dosage?.toLowerCase().includes(q)) return true;
        if (m.instructions?.toLowerCase().includes(q)) return true;
      }
      return false;
    case "advice":
      return (template.plan_json?.advice ?? "").toLowerCase().includes(q);
    case "follow_up":
      return (
        (template.plan_json?.followUp ?? "").toLowerCase().includes(q) ||
        (template.follow_up ?? "").toLowerCase().includes(q)
      );
    case "referral": {
      const plan = template.plan_json ?? {};
      if ((plan.referral ?? "").toLowerCase().includes(q)) return true;
      if ((plan.referralUrgency ?? "").toLowerCase().includes(q)) return true;
      if ((plan.referralReason ?? "").toLowerCase().includes(q)) return true;
      for (const s of plan.referralSpecialties ?? []) {
        if (s.toLowerCase().includes(q)) return true;
      }
      return false;
    }
    case "clinical_notes":
      return (
        (template.plan_json?.clinicalNotes ?? "").toLowerCase().includes(q) ||
        (template.clinical_notes ?? "").toLowerCase().includes(q)
      );
    case "plan_full": {
      if ((template.investigations ?? "").toLowerCase().includes(q)) return true;
      for (const m of template.medicines_json ?? []) {
        if (m.medicineName?.toLowerCase().includes(q)) return true;
      }
      const plan = template.plan_json ?? {};
      return [
        plan.advice,
        plan.followUp,
        plan.referral,
        plan.referralUrgency,
        plan.referralReason,
        plan.clinicalNotes,
        ...(plan.referralSpecialties ?? []),
      ].some((t) => (t ?? "").toLowerCase().includes(q));
    }
    case "diagnoses":
      return normalizeDiagnoses(template.assessment_json?.diagnoses).some((d) =>
        d.label.toLowerCase().includes(q),
      );
    case "known_conditions":
      return (template.assessment_json?.knownConditions ?? []).some((c) =>
        [c.condition, c.note, c.code, c.codeTitle].some((t) =>
          (t ?? "").toLowerCase().includes(q),
        ),
      );
    case "assessment_notes":
      return (template.assessment_json?.assessmentNote ?? "")
        .toLowerCase()
        .includes(q);
    case "assessment_full": {
      if (
        normalizeDiagnoses(template.assessment_json?.diagnoses).some((d) =>
          d.label.toLowerCase().includes(q),
        )
      ) {
        return true;
      }
      if (
        (template.assessment_json?.knownConditions ?? []).some((c) =>
          [c.condition, c.note, c.code, c.codeTitle].some((t) =>
            (t ?? "").toLowerCase().includes(q),
          ),
        )
      ) {
        return true;
      }
      return (template.assessment_json?.assessmentNote ?? "")
        .toLowerCase()
        .includes(q);
    }
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
