/**
 * Apply / save subjective-only Rx templates (subj-08).
 */

import type { RxFormAction, RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import {
  buildSubjectiveCarryForwardActions,
  cloneComplaintsForCarryForward,
  COPY_ALL_SUBJECTIVE_SELECTION,
} from "@/lib/cockpit/carry-forward-subjective";
import {
  hasCustomSubsectionsContent,
  sanitizeCustomSubsectionForStorage,
  serializeCustomSubsectionsForPayload,
  type CustomSubsection,
} from "@/lib/cockpit/custom-subsections";
import { pmhTemplateHasContent } from "@/lib/chart/use-pmh-template-apply";
import type {
  DoctorRxTemplate,
  RxTemplatePmh,
  RxTemplateScope,
  RxTemplateSubjective,
} from "@/types/rx-template";
import type { Complaint } from "@/types/prescription";
import type { CreateRxTemplatePayload } from "@/types/rx-template";
import type { SubjectiveCarryForwardSelection } from "@/lib/cockpit/carry-forward-subjective";
import {
  hasFamilyHistoryStructuredContent,
  normalizeFamilyHistoryStructured,
  serializeFamilyHistory,
} from "@/lib/cockpit/family-history";
import {
  hasPastSurgicalHistoryStructuredContent,
  normalizePastSurgicalHistoryStructured,
  serializePastSurgicalHistory,
} from "@/lib/cockpit/past-surgical-history";
import {
  hasSocialHistoryStructuredContent,
  normalizeSocialHistoryStructured,
  serializeSocialHistory,
} from "@/lib/cockpit/social-history";

/** Form-state subsection scopes wired in subj-16 (excludes server-backed PMH/allergies). */
export type FormStateTemplateScope = Extract<
  RxTemplateScope,
  "chief_complaints" | "past_surgical" | "family_history" | "social_history"
>;

export const FORM_STATE_TEMPLATE_SCOPES: FormStateTemplateScope[] = [
  "chief_complaints",
  "past_surgical",
  "family_history",
  "social_history",
];

function scopeToCarryForwardSelection(
  scope: FormStateTemplateScope,
): SubjectiveCarryForwardSelection {
  return {
    complaints: scope === "chief_complaints",
    familyHistory: scope === "family_history",
    socialHistory: scope === "social_history",
    pastSurgicalHistory: scope === "past_surgical",
  };
}

export function scopeHasContent(scope: FormStateTemplateScope, fields: RxFormFields): boolean {
  switch (scope) {
    case "chief_complaints":
      return fields.complaints.some((c) => c.name.trim());
    case "family_history":
      return (
        hasFamilyHistoryStructuredContent(fields.familyHistoryStructured) ||
        Boolean(fields.familyHistory.trim())
      );
    case "social_history":
      return (
        hasSocialHistoryStructuredContent(fields.socialHistoryStructured) ||
        Boolean(fields.socialHistory.trim())
      );
    case "past_surgical":
      return (
        hasPastSurgicalHistoryStructuredContent(fields.pastSurgicalHistoryStructured) ||
        Boolean(fields.pastSurgicalHistory.trim())
      );
  }
}

export function buildScopedTemplateSavePayload(
  scope: FormStateTemplateScope,
  fields: RxFormFields,
): Pick<CreateRxTemplatePayload, "subjective" | "medicines" | "scope"> {
  const full = buildSubjectiveTemplateSavePayload(fields);
  const subj = full.subjective ?? {};

  switch (scope) {
    case "chief_complaints":
      return {
        scope,
        medicines: [],
        subjective: { complaints: subj.complaints },
      };
    case "family_history":
      return {
        scope,
        medicines: [],
        subjective: {
          familyHistory: subj.familyHistory,
          familyHistoryStructured: subj.familyHistoryStructured,
        },
      };
    case "social_history":
      return {
        scope,
        medicines: [],
        subjective: {
          socialHistory: subj.socialHistory,
          socialHistoryStructured: subj.socialHistoryStructured,
        },
      };
    case "past_surgical":
      return {
        scope,
        medicines: [],
        subjective: {
          pastSurgicalHistory: subj.pastSurgicalHistory,
          pastSurgicalHistoryStructured: subj.pastSurgicalHistoryStructured,
        },
      };
  }
}

/** Build reducer actions for a single scoped template apply (subj-16). */
export function buildScopedTemplateApplyActions(
  scope: FormStateTemplateScope,
  template: DoctorRxTemplate,
): RxFormAction[] {
  const subj = templateSubjective(template);
  return buildSubjectiveCarryForwardActions(
    {
      complaints: cloneComplaintsForCarryForward(subj.complaints ?? []),
      familyHistory: subj.familyHistory ?? null,
      familyHistoryStructured: subj.familyHistoryStructured ?? null,
      socialHistory: subj.socialHistory ?? null,
      socialHistoryStructured: subj.socialHistoryStructured ?? null,
      pastSurgicalHistory: subj.pastSurgicalHistory ?? null,
      pastSurgicalHistoryStructured: subj.pastSurgicalHistoryStructured ?? null,
    },
    scopeToCarryForwardSelection(scope),
  );
}

export function templateSubjective(template: DoctorRxTemplate): RxTemplateSubjective {
  return template.subjective_json ?? {};
}

export function templateHasSubjectiveContent(template: DoctorRxTemplate): boolean {
  // PMH is part of the whole-subjective bundle (subj-18). Allergies intentionally
  // excluded — extend here if that changes.
  if (pmhTemplateHasContent(template.pmh_json)) return true;

  const subj = templateSubjective(template);
  if ((subj.complaints ?? []).some((c) => c.name?.trim())) return true;
  if (
    subj.familyHistoryStructured &&
    hasFamilyHistoryStructuredContent(subj.familyHistoryStructured)
  ) {
    return true;
  }
  if (subj.familyHistory?.trim()) return true;
  if (
    subj.socialHistoryStructured &&
    hasSocialHistoryStructuredContent(subj.socialHistoryStructured)
  ) {
    return true;
  }
  if (subj.socialHistory?.trim()) return true;
  if (
    subj.pastSurgicalHistoryStructured &&
    hasPastSurgicalHistoryStructuredContent(subj.pastSurgicalHistoryStructured)
  ) {
    return true;
  }
  if (subj.pastSurgicalHistory?.trim()) return true;
  if (hasCustomSubsectionsContent(subj.customSubsections ?? [])) return true;
  return false;
}

export function rxFormHasSubjectiveContent(fields: RxFormFields): boolean {
  if (fields.complaints.some((c) => c.name.trim())) return true;
  if (hasFamilyHistoryStructuredContent(fields.familyHistoryStructured)) return true;
  if (fields.familyHistory.trim()) return true;
  if (hasSocialHistoryStructuredContent(fields.socialHistoryStructured)) return true;
  if (fields.socialHistory.trim()) return true;
  if (hasPastSurgicalHistoryStructuredContent(fields.pastSurgicalHistoryStructured)) return true;
  if (fields.pastSurgicalHistory.trim()) return true;
  if (hasCustomSubsectionsContent(fields.customSubsections)) return true;
  return false;
}

/** Whole-subjective save guard — form-state fields and/or a PMH snapshot (subj-18). */
export function fullSubjectiveHasContent(
  fields: RxFormFields,
  pmh?: RxTemplatePmh | null,
): boolean {
  return rxFormHasSubjectiveContent(fields) || pmhTemplateHasContent(pmh);
}

export function buildSubjectiveTemplateSavePayload(
  fields: RxFormFields,
  pmh?: RxTemplatePmh | null,
): Pick<CreateRxTemplatePayload, "subjective" | "medicines" | "scope" | "pmh"> {
  const complaints: Complaint[] = fields.complaints
    .filter((c) => c.name.trim())
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      onset: c.onset,
      duration: c.duration,
      location: c.location,
      character: c.character,
      radiation: c.radiation,
      severity: c.severity,
      timing: c.timing,
      aggravating: c.aggravating,
      relieving: c.relieving,
      associated: c.associated,
      associatedComplaints: (c.associatedComplaints ?? [])
        .filter((ch) => ch.name.trim())
        .map((ch) => ({
          id: ch.id,
          name: ch.name.trim(),
          onset: ch.onset,
          duration: ch.duration,
          location: ch.location,
          character: ch.character,
          radiation: ch.radiation,
          severity: ch.severity,
          timing: ch.timing,
          aggravating: ch.aggravating,
          relieving: ch.relieving,
          associated: ch.associated,
          notes: ch.notes,
          category: ch.category,
        })),
      notes: c.notes,
      category: c.category,
    }));

  const familyStructured = normalizeFamilyHistoryStructured(fields.familyHistoryStructured);
  const socialStructured = normalizeSocialHistoryStructured(fields.socialHistoryStructured);
  const pastSurgicalStructured = normalizePastSurgicalHistoryStructured(
    fields.pastSurgicalHistoryStructured,
  );

  const payload: Pick<CreateRxTemplatePayload, "subjective" | "medicines" | "scope" | "pmh"> = {
    scope: "subjective_full",
    subjective: {
      complaints,
      familyHistory: hasFamilyHistoryStructuredContent(familyStructured)
        ? serializeFamilyHistory(familyStructured)
        : fields.familyHistory.trim() || null,
      familyHistoryStructured: hasFamilyHistoryStructuredContent(familyStructured)
        ? familyStructured
        : null,
      socialHistory: hasSocialHistoryStructuredContent(socialStructured)
        ? serializeSocialHistory(socialStructured)
        : fields.socialHistory.trim() || null,
      socialHistoryStructured: hasSocialHistoryStructuredContent(socialStructured)
        ? socialStructured
        : null,
      pastSurgicalHistory: hasPastSurgicalHistoryStructuredContent(pastSurgicalStructured)
        ? serializePastSurgicalHistory(pastSurgicalStructured)
        : fields.pastSurgicalHistory.trim() || null,
      pastSurgicalHistoryStructured: hasPastSurgicalHistoryStructuredContent(pastSurgicalStructured)
        ? pastSurgicalStructured
        : null,
    },
    medicines: [],
  };

  const customSnapshots = serializeCustomSubsectionsForPayload(fields.customSubsections);
  if (customSnapshots.length > 0) {
    payload.subjective!.customSubsections = customSnapshots;
  }

  if (pmhTemplateHasContent(pmh)) {
    payload.pmh = pmh ?? undefined;
  }

  return payload;
}

/** Build reducer actions for subjective-only template apply. */
export function buildSubjectiveTemplateApplyActions(
  template: DoctorRxTemplate,
  fields?: RxFormFields,
): RxFormAction[] {
  const subj = templateSubjective(template);
  const actions = buildSubjectiveCarryForwardActions(
    {
      complaints: cloneComplaintsForCarryForward(subj.complaints ?? []),
      familyHistory: subj.familyHistory ?? null,
      familyHistoryStructured: subj.familyHistoryStructured ?? null,
      socialHistory: subj.socialHistory ?? null,
      socialHistoryStructured: subj.socialHistoryStructured ?? null,
      pastSurgicalHistory: subj.pastSurgicalHistory ?? null,
      pastSurgicalHistoryStructured: subj.pastSurgicalHistoryStructured ?? null,
    },
    COPY_ALL_SUBJECTIVE_SELECTION,
  );

  if (fields) {
    actions.push(...buildFullTemplateCustomSubsectionsApplyActions(subj.customSubsections, fields));
  }

  return actions;
}

/**
 * Merge template custom sections into live form state by stable id (subj-41).
 * Overwrites body/children (+ title) for existing ids; appends absent ones.
 */
export function buildFullTemplateCustomSubsectionsApplyActions(
  templateSections: CustomSubsection[] | undefined,
  fields: RxFormFields,
): RxFormAction[] {
  if (!templateSections?.length) return [];

  const actions: RxFormAction[] = [];
  let working = [...fields.customSubsections];

  for (const raw of templateSections) {
    if (!raw || typeof raw.id !== "string" || !raw.id.trim()) continue;
    if (typeof raw.title !== "string" || !raw.title.trim()) continue;

    const section = sanitizeCustomSubsectionForStorage({
      id: raw.id,
      title: raw.title,
      body: raw.body ?? null,
      children: (raw.children ?? []).map((child) => ({
        id: child.id,
        title: child.title ?? "",
        body: child.body ?? null,
      })),
    });

    const index = working.findIndex((existing) => existing.id === section.id);
    if (index >= 0) {
      actions.push({
        type: "UPDATE_CUSTOM_SUBSECTION",
        index,
        patch: {
          title: section.title,
          body: section.body,
          children: section.children,
        },
      });
      working[index] = { ...working[index]!, ...section };
    } else {
      actions.push({ type: "ADD_CUSTOM_SUBSECTION", section });
      working.push(section);
    }
  }

  return actions;
}

export function subjectiveComplaintCount(template: DoctorRxTemplate): number {
  return (templateSubjective(template).complaints ?? []).filter((c) => c.name?.trim()).length;
}

/** Whether a single custom section has save/apply-able body or child content (subj-40). */
export function customBlockSectionHasContent(section: CustomSubsection): boolean {
  if (section.body?.trim()) return true;
  return (section.children ?? []).some((child) => child.title.trim() || child.body?.trim());
}

/** First well-formed custom section carried by a `custom_block` template (subj-40). */
export function templateCustomBlockSection(
  template: DoctorRxTemplate,
): CustomSubsection | null {
  const sections = templateSubjective(template).customSubsections ?? [];
  const titled = sections.find((section) => typeof section?.title === "string" && section.title.trim());
  return titled ?? sections[0] ?? null;
}

/** Stable id stamped on a `custom_block` template's primary section (subj-40). */
export function templateCustomBlockSourceSectionId(template: DoctorRxTemplate): string | null {
  const section = templateCustomBlockSection(template);
  return typeof section?.id === "string" && section.id.trim() ? section.id : null;
}

/**
 * Snapshot one live custom section into a `custom_block` template payload (subj-40).
 * Returns `null` when the section is missing or has no body/child content.
 */
export function buildCustomBlockTemplateSavePayload(
  sectionId: string,
  fields: RxFormFields,
): Pick<CreateRxTemplatePayload, "subjective" | "medicines" | "scope"> | null {
  const section = fields.customSubsections.find((s) => s.id === sectionId);
  if (!section || !customBlockSectionHasContent(section)) return null;

  const snapshot = sanitizeCustomSubsectionForStorage(section);
  return {
    scope: "custom_block",
    medicines: [],
    subjective: { customSubsections: [snapshot] },
  };
}

/**
 * Build reducer actions to apply a `custom_block` template onto the current header's
 * section (subj-40). Overwrites when the target id exists; creates when absent.
 * Cross-apply fills the current section's body/children without duplicating by title.
 */
export function buildCustomBlockTemplateApplyActions(
  targetSectionId: string,
  template: DoctorRxTemplate,
  fields: RxFormFields,
): RxFormAction[] {
  const source = templateCustomBlockSection(template);
  if (!source || !customBlockSectionHasContent(source)) return [];

  const body = source.body ?? null;
  const children = (source.children ?? []).map((child) => ({
    id: child.id,
    title: child.title,
    body: child.body ?? null,
  }));

  const targetIndex = fields.customSubsections.findIndex((section) => section.id === targetSectionId);
  if (targetIndex >= 0) {
    const patch: Partial<CustomSubsection> = { body, children };
    if (source.id === targetSectionId) {
      patch.title = source.title;
    }
    return [{ type: "UPDATE_CUSTOM_SUBSECTION", index: targetIndex, patch }];
  }

  return [
    {
      type: "ADD_CUSTOM_SUBSECTION",
      section: {
        id: source.id,
        title: source.title,
        body,
        children,
      },
    },
  ];
}
