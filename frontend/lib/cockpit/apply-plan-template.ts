/**
 * Save / apply helpers for Plan section + whole-tab templates.
 * Form-state only — scoped payloads live in `doctor_rx_templates.plan_json`
 * (scopes: advice | follow_up | referral | clinical_notes | plan_full).
 * `plan_full` also uses `investigations` + `medicines_json`.
 */

import type {
  RxFormAction,
  RxFormFields,
  RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { EMPTY_RX_MEDICINE } from "@/components/cockpit/rx/RxFormContext";
import type { CustomSubsection } from "@/lib/cockpit/custom-subsections";
import {
  buildMedicinesFromTemplate,
  buildMedicinesTemplateSavePayload,
  medicinesNamedCount,
  medicinesScopeHasContent,
} from "@/lib/cockpit/apply-medicines-template";
import {
  buildInvestigationsTemplateSavePayload,
  investigationsOrdersCount,
  investigationsScopeHasContent,
} from "@/lib/cockpit/apply-investigations-template";
import { formatStructuredFollowUp } from "@/lib/cockpit/follow-up-format";
import type {
  CreateRxTemplatePayload,
  DoctorRxTemplate,
  RxTemplatePlan,
  RxTemplateScope,
} from "@/types/rx-template";

export type PlanTemplateScope = Extract<
  RxTemplateScope,
  "advice" | "follow_up" | "referral" | "clinical_notes" | "plan_full"
>;

export const PLAN_TEMPLATE_SCOPES: PlanTemplateScope[] = [
  "advice",
  "follow_up",
  "referral",
  "clinical_notes",
  "plan_full",
];

export const PLAN_SECTION_TEMPLATE_SCOPES: Exclude<
  PlanTemplateScope,
  "plan_full"
>[] = ["advice", "follow_up", "referral", "clinical_notes"];

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function templatePlan(template: DoctorRxTemplate): RxTemplatePlan {
  return template.plan_json ?? {};
}

export function adviceScopeHasContent(
  fields: Pick<RxFormFields, "advice">,
): boolean {
  return Boolean(fields.advice.trim());
}

export function followUpScopeHasContent(
  fields: Pick<RxFormFields, "followUp" | "followUpValue" | "followUpUnit">,
): boolean {
  return Boolean(
    fields.followUp.trim() ||
      fields.followUpValue != null ||
      fields.followUpUnit != null,
  );
}

export function referralScopeHasContent(
  fields: Pick<
    RxFormFields,
    "referral" | "referralUrgency" | "referralSpecialties" | "referralReason"
  >,
): boolean {
  return Boolean(
    fields.referral.trim() ||
      fields.referralUrgency?.trim() ||
      fields.referralReason?.trim() ||
      fields.referralSpecialties.length > 0,
  );
}

export function clinicalNotesScopeHasContent(
  fields: Pick<RxFormFields, "clinicalNotes">,
): boolean {
  return Boolean(fields.clinicalNotes.trim());
}

export function planScopeHasContent(
  scope: PlanTemplateScope,
  fields: RxFormFields,
): boolean {
  switch (scope) {
    case "advice":
      return adviceScopeHasContent(fields);
    case "follow_up":
      return followUpScopeHasContent(fields);
    case "referral":
      return referralScopeHasContent(fields);
    case "clinical_notes":
      return clinicalNotesScopeHasContent(fields);
    case "plan_full":
      return (
        investigationsScopeHasContent(fields) ||
        medicinesScopeHasContent(fields) ||
        adviceScopeHasContent(fields) ||
        followUpScopeHasContent(fields) ||
        referralScopeHasContent(fields) ||
        clinicalNotesScopeHasContent(fields)
      );
  }
}

export function templatePlanScopeHasContent(
  template: DoctorRxTemplate,
  scope: PlanTemplateScope,
): boolean {
  const plan = templatePlan(template);
  switch (scope) {
    case "advice":
      return Boolean(trimOrEmpty(plan.advice));
    case "follow_up":
      return Boolean(
        trimOrEmpty(plan.followUp) ||
          plan.followUpValue != null ||
          plan.followUpUnit != null ||
          trimOrEmpty(template.follow_up),
      );
    case "referral":
      return Boolean(
        trimOrEmpty(plan.referral) ||
          trimOrEmpty(plan.referralUrgency) ||
          trimOrEmpty(plan.referralReason) ||
          (plan.referralSpecialties ?? []).some((s) => s.trim()),
      );
    case "clinical_notes":
      return Boolean(
        trimOrEmpty(plan.clinicalNotes) || trimOrEmpty(template.clinical_notes),
      );
    case "plan_full":
      return (
        investigationsOrdersCount(template.investigations) > 0 ||
        medicinesNamedCount(template.medicines_json ?? []) > 0 ||
        templatePlanScopeHasContent(template, "advice") ||
        templatePlanScopeHasContent(template, "follow_up") ||
        templatePlanScopeHasContent(template, "referral") ||
        templatePlanScopeHasContent(template, "clinical_notes")
      );
  }
}

function buildAdvicePlan(fields: Pick<RxFormFields, "advice">): RxTemplatePlan {
  return { advice: fields.advice.trim() || null };
}

function buildFollowUpPlan(
  fields: Pick<RxFormFields, "followUp" | "followUpValue" | "followUpUnit">,
): RxTemplatePlan {
  return {
    followUp: fields.followUp.trim() || null,
    followUpValue: fields.followUpValue,
    followUpUnit: fields.followUpUnit,
  };
}

function buildReferralPlan(
  fields: Pick<
    RxFormFields,
    "referral" | "referralUrgency" | "referralSpecialties" | "referralReason"
  >,
): RxTemplatePlan {
  return {
    referral: fields.referral.trim() || null,
    referralUrgency: fields.referralUrgency?.trim() || null,
    referralSpecialties: fields.referralSpecialties
      .map((s) => s.trim())
      .filter(Boolean),
    referralReason: fields.referralReason?.trim() || null,
  };
}

function buildClinicalNotesPlan(
  fields: Pick<RxFormFields, "clinicalNotes">,
): RxTemplatePlan {
  return { clinicalNotes: fields.clinicalNotes.trim() || null };
}

function buildFullPlan(fields: RxFormFields): RxTemplatePlan {
  return {
    ...buildAdvicePlan(fields),
    ...buildFollowUpPlan(fields),
    ...buildReferralPlan(fields),
    ...buildClinicalNotesPlan(fields),
  };
}

export function buildPlanTemplateSavePayload(
  scope: PlanTemplateScope,
  fields: RxFormFields,
): Omit<CreateRxTemplatePayload, "name"> {
  switch (scope) {
    case "advice":
      return { scope, plan: buildAdvicePlan(fields), medicines: [] };
    case "follow_up": {
      const plan = buildFollowUpPlan(fields);
      return {
        scope,
        plan,
        followUp: plan.followUp ?? null,
        medicines: [],
      };
    }
    case "referral":
      return { scope, plan: buildReferralPlan(fields), medicines: [] };
    case "clinical_notes": {
      const plan = buildClinicalNotesPlan(fields);
      return {
        scope,
        plan,
        clinicalNotes: plan.clinicalNotes ?? null,
        medicines: [],
      };
    }
    case "plan_full": {
      const inv = buildInvestigationsTemplateSavePayload(fields);
      const meds = buildMedicinesTemplateSavePayload(fields);
      const plan = buildFullPlan(fields);
      return {
        scope,
        plan,
        investigations: inv.investigations ?? null,
        medicines: meds.medicines ?? [],
        followUp: plan.followUp ?? null,
        clinicalNotes: plan.clinicalNotes ?? null,
      };
    }
  }
}

export function defaultPlanSaveName(
  scope: PlanTemplateScope,
  fields: RxFormFields,
): string {
  switch (scope) {
    case "advice": {
      const t = fields.advice.trim();
      if (!t) return "Advice";
      return t.length > 40 ? `${t.slice(0, 37)}…` : t;
    }
    case "follow_up": {
      const label = formatStructuredFollowUp(
        fields.followUpValue,
        fields.followUpUnit,
      );
      if (label) return label.length > 40 ? `${label.slice(0, 37)}…` : label;
      const notes = fields.followUp.trim();
      if (notes) return notes.length > 40 ? `${notes.slice(0, 37)}…` : notes;
      return "Follow-up";
    }
    case "referral": {
      const specs = fields.referralSpecialties.filter((s) => s.trim());
      if (specs.length === 1) {
        const label = specs[0]!.trim();
        return label.length > 40 ? `${label.slice(0, 37)}…` : label;
      }
      if (specs.length > 1) return `Referral (${specs.length})`;
      return "Referral";
    }
    case "clinical_notes": {
      const t = fields.clinicalNotes.trim();
      if (!t) return "Clinical notes";
      return t.length > 40 ? `${t.slice(0, 37)}…` : t;
    }
    case "plan_full":
      return "Plan";
  }
}

function setFieldAction<K extends keyof RxFormFields>(
  key: K,
  value: RxFormFields[K],
): RxFormAction {
  return { type: "SET_FIELD", key, value };
}

/** Apply actions for a Plan scope (excludes medicines — caller applies those). */
export function buildPlanTemplateApplyActions(
  scope: PlanTemplateScope,
  template: DoctorRxTemplate,
): RxFormAction[] {
  const plan = templatePlan(template);
  const actions: RxFormAction[] = [];

  const applyAdvice = () => {
    if (plan.advice !== undefined) {
      actions.push(setFieldAction("advice", plan.advice ?? ""));
    }
  };
  const applyFollowUp = () => {
    if (
      plan.followUp !== undefined ||
      plan.followUpValue !== undefined ||
      plan.followUpUnit !== undefined ||
      template.follow_up
    ) {
      actions.push(
        setFieldAction(
          "followUp",
          plan.followUp ?? template.follow_up ?? "",
        ),
      );
      if (plan.followUpValue !== undefined) {
        actions.push(setFieldAction("followUpValue", plan.followUpValue));
      }
      if (plan.followUpUnit !== undefined) {
        actions.push(setFieldAction("followUpUnit", plan.followUpUnit));
      }
    }
  };
  const applyReferral = () => {
    if (
      plan.referral !== undefined ||
      plan.referralUrgency !== undefined ||
      plan.referralReason !== undefined ||
      plan.referralSpecialties !== undefined
    ) {
      if (plan.referral !== undefined) {
        actions.push(setFieldAction("referral", plan.referral ?? ""));
      }
      if (plan.referralUrgency !== undefined) {
        actions.push(
          setFieldAction("referralUrgency", plan.referralUrgency ?? null),
        );
      }
      if (plan.referralSpecialties !== undefined) {
        actions.push(
          setFieldAction(
            "referralSpecialties",
            (plan.referralSpecialties ?? []).map((s) => s.trim()).filter(Boolean),
          ),
        );
      }
      if (plan.referralReason !== undefined) {
        actions.push(
          setFieldAction("referralReason", plan.referralReason ?? null),
        );
      }
    }
  };
  const applyClinicalNotes = () => {
    if (plan.clinicalNotes !== undefined || template.clinical_notes) {
      actions.push(
        setFieldAction(
          "clinicalNotes",
          plan.clinicalNotes ?? template.clinical_notes ?? "",
        ),
      );
    }
  };
  const applyInvestigations = () => {
    actions.push(
      setFieldAction(
        "investigationsOrders",
        (template.investigations ?? "").trim(),
      ),
    );
  };

  switch (scope) {
    case "advice":
      applyAdvice();
      break;
    case "follow_up":
      applyFollowUp();
      break;
    case "referral":
      applyReferral();
      break;
    case "clinical_notes":
      applyClinicalNotes();
      break;
    case "plan_full":
      applyInvestigations();
      applyAdvice();
      applyFollowUp();
      applyReferral();
      applyClinicalNotes();
      break;
  }

  return actions;
}

/** Medicines list for `plan_full` apply (caller regenerates instance ids). */
export function buildPlanFullMedicinesFromTemplate(
  template: DoctorRxTemplate,
): RxMedicine[] {
  return buildMedicinesFromTemplate(template);
}

export const SAVE_EMPTY_MESSAGES: Record<PlanTemplateScope, string> = {
  advice: "Add advice before saving a template.",
  follow_up: "Add follow-up before saving a template.",
  referral: "Add referral details before saving a template.",
  clinical_notes: "Add clinical notes before saving a template.",
  plan_full: "Add plan content before saving a template.",
};

export const SAVE_PROMPT_LABELS: Record<PlanTemplateScope, string> = {
  advice: "Save current advice as template",
  follow_up: "Save current follow-up as template",
  referral: "Save current referral as template",
  clinical_notes: "Save current clinical notes as template",
  plan_full: "Save current plan as template",
};

function planCustomSectionHasVisitBody(section: CustomSubsection): boolean {
  if (section.body?.trim()) return true;
  return (section.children ?? []).some((child) => Boolean(child.body?.trim()));
}

export function rxFormHasClearablePlanContent(fields: RxFormFields): boolean {
  if (planScopeHasContent("plan_full", fields)) return true;
  // assessment-plan-custom-sections: clear-all also wipes custom visit bodies.
  return fields.planCustomSections.some(planCustomSectionHasVisitBody);
}

/** Strip visit bodies; keep custom section titles / child titles (mirrors subjective). */
function clearPlanCustomSectionVisitBodies(
  sections: readonly CustomSubsection[],
): CustomSubsection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    body: null,
    children: (section.children ?? []).map((child) => ({
      id: child.id,
      title: child.title,
      body: null,
    })),
  }));
}

/**
 * Reducer actions that empty Plan form fields (investigations, medicines,
 * advice, follow-up, referral, clinical notes, custom section visit bodies).
 * Does not touch handout attachments (shell-owned) nor custom section titles.
 */
export function buildPlanClearAllActions(fields: RxFormFields): RxFormAction[] {
  const actions: RxFormAction[] = [
    { type: "SET_FIELD", key: "investigationsOrders", value: "" },
    { type: "SET_MEDICINES", medicines: [{ ...EMPTY_RX_MEDICINE }] },
    { type: "SET_FIELD", key: "advice", value: "" },
    { type: "SET_FIELD", key: "followUp", value: "" },
    { type: "SET_FIELD", key: "followUpValue", value: null },
    { type: "SET_FIELD", key: "followUpUnit", value: null },
    { type: "SET_FIELD", key: "referral", value: "" },
    { type: "SET_FIELD", key: "referralUrgency", value: null },
    { type: "SET_FIELD", key: "referralSpecialties", value: [] },
    { type: "SET_FIELD", key: "referralReason", value: null },
    { type: "SET_FIELD", key: "clinicalNotes", value: "" },
  ];
  if (fields.planCustomSections.length > 0) {
    actions.push({
      type: "SET_PLAN_CUSTOM_SECTIONS",
      sections: clearPlanCustomSectionVisitBodies(fields.planCustomSections),
    });
  }
  return actions;
}
