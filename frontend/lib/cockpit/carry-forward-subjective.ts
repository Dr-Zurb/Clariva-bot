/**
 * Apply carry-forward payload via existing RxForm reducer actions (subj-07).
 */

import type { Complaint } from "@/types/prescription";
import type { RxFormAction } from "@/components/cockpit/rx/RxFormContext";
import {
  hasFamilyHistoryStructuredContent,
  normalizeFamilyHistoryStructured,
  parseFamilyHistoryAsStructured,
  type FamilyHistoryStructured,
} from "@/lib/cockpit/family-history";
import {
  hasPastSurgicalHistoryStructuredContent,
  normalizePastSurgicalHistoryStructured,
  parsePastSurgicalHistoryAsStructured,
  type PastSurgicalHistoryStructured,
} from "@/lib/cockpit/past-surgical-history";
import {
  hasSocialHistoryStructuredContent,
  normalizeSocialHistoryStructured,
  parseSocialHistoryAsStructured,
  type SocialHistoryStructured,
} from "@/lib/cockpit/social-history";

export interface SubjectiveCarryForwardSelection {
  complaints: boolean;
  familyHistory: boolean;
  socialHistory: boolean;
  pastSurgicalHistory: boolean;
}

export interface SubjectiveCarryForwardSource {
  complaints: Complaint[];
  familyHistory: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
}

export const COPY_ALL_SUBJECTIVE_SELECTION: SubjectiveCarryForwardSelection = {
  complaints: true,
  familyHistory: true,
  socialHistory: true,
  pastSurgicalHistory: true,
};

/** Clone complaint cards with fresh ids so autosave creates new rows. */
export function cloneComplaintsForCarryForward(complaints: Complaint[]): Complaint[] {
  return complaints
    .filter((c) => c.name.trim())
    .map((c) => {
      const associatedComplaints = (c.associatedComplaints ?? [])
        .filter((ch) => ch.name.trim())
        .map((ch) => ({ ...ch, id: crypto.randomUUID() }));
      return {
        ...c,
        id: crypto.randomUUID(),
        associatedComplaints:
          associatedComplaints.length > 0 ? associatedComplaints : undefined,
      };
    });
}

function clonePastSurgicalHistoryForCarryForward(
  structured: PastSurgicalHistoryStructured,
): PastSurgicalHistoryStructured {
  const normalized = normalizePastSurgicalHistoryStructured(structured);
  if (!normalized.procedures?.length) return normalized;
  return {
    ...normalized,
    procedures: normalized.procedures.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
    })),
  };
}

/** Prefer JSONB; fall back to lossless legacy TEXT hydration (SHv2-D4). */
export function resolveSocialHistoryForCarryForward(source: {
  socialHistoryStructured?: SocialHistoryStructured | null;
  socialHistory?: string | null;
}): SocialHistoryStructured | null {
  if (
    source.socialHistoryStructured &&
    hasSocialHistoryStructuredContent(source.socialHistoryStructured)
  ) {
    return normalizeSocialHistoryStructured(source.socialHistoryStructured);
  }
  if (source.socialHistory?.trim()) {
    const parsed = parseSocialHistoryAsStructured(source.socialHistory);
    if (hasSocialHistoryStructuredContent(parsed)) {
      return parsed;
    }
  }
  return null;
}

/** Prefer JSONB; fall back to legacy TEXT hydration. */
export function resolveFamilyHistoryForCarryForward(source: {
  familyHistoryStructured?: FamilyHistoryStructured | null;
  familyHistory?: string | null;
}): FamilyHistoryStructured | null {
  if (
    source.familyHistoryStructured &&
    hasFamilyHistoryStructuredContent(source.familyHistoryStructured)
  ) {
    return normalizeFamilyHistoryStructured(source.familyHistoryStructured);
  }
  if (source.familyHistory?.trim()) {
    const parsed = parseFamilyHistoryAsStructured(source.familyHistory);
    if (hasFamilyHistoryStructuredContent(parsed)) {
      return parsed;
    }
  }
  return null;
}

/** Prefer JSONB; fall back to legacy TEXT hydration. */
export function resolvePastSurgicalHistoryForCarryForward(source: {
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
  pastSurgicalHistory?: string | null;
}): PastSurgicalHistoryStructured | null {
  if (
    source.pastSurgicalHistoryStructured &&
    hasPastSurgicalHistoryStructuredContent(source.pastSurgicalHistoryStructured)
  ) {
    return clonePastSurgicalHistoryForCarryForward(source.pastSurgicalHistoryStructured);
  }
  if (source.pastSurgicalHistory?.trim()) {
    const parsed = parsePastSurgicalHistoryAsStructured(source.pastSurgicalHistory);
    if (hasPastSurgicalHistoryStructuredContent(parsed)) {
      return clonePastSurgicalHistoryForCarryForward(parsed);
    }
  }
  return null;
}

export function buildSocialHistoryCarryForwardAction(
  source: Pick<SubjectiveCarryForwardSource, "socialHistory" | "socialHistoryStructured">,
): RxFormAction | null {
  const structured = resolveSocialHistoryForCarryForward(source);
  if (!structured) return null;
  return { type: "SET_SOCIAL_HISTORY_STRUCTURED", structured };
}

export function buildFamilyHistoryCarryForwardAction(
  source: Pick<SubjectiveCarryForwardSource, "familyHistory" | "familyHistoryStructured">,
): RxFormAction | null {
  const structured = resolveFamilyHistoryForCarryForward(source);
  if (!structured) return null;
  return { type: "SET_FAMILY_HISTORY_STRUCTURED", structured };
}

export function buildPastSurgicalHistoryCarryForwardAction(
  source: Pick<
    SubjectiveCarryForwardSource,
    "pastSurgicalHistory" | "pastSurgicalHistoryStructured"
  >,
): RxFormAction | null {
  const structured = resolvePastSurgicalHistoryForCarryForward(source);
  if (!structured) return null;
  return { type: "SET_PAST_SURGICAL_HISTORY_STRUCTURED", structured };
}

export function buildSubjectiveCarryForwardActions(
  source: SubjectiveCarryForwardSource,
  selection: SubjectiveCarryForwardSelection,
): RxFormAction[] {
  const actions: RxFormAction[] = [];

  if (selection.complaints) {
    actions.push({
      type: "SET_COMPLAINTS",
      complaints: cloneComplaintsForCarryForward(source.complaints),
    });
  }
  if (selection.familyHistory) {
    const familyAction = buildFamilyHistoryCarryForwardAction(source);
    if (familyAction) actions.push(familyAction);
  }
  if (selection.socialHistory) {
    const socialAction = buildSocialHistoryCarryForwardAction(source);
    if (socialAction) actions.push(socialAction);
  }
  if (selection.pastSurgicalHistory) {
    const surgicalAction = buildPastSurgicalHistoryCarryForwardAction(source);
    if (surgicalAction) actions.push(surgicalAction);
  }

  return actions;
}

export function mapLastSubjectiveApiToSource(data: {
  complaints: Complaint[];
  familyHistory: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
}): SubjectiveCarryForwardSource {
  return {
    complaints: data.complaints ?? [],
    familyHistory: data.familyHistory,
    familyHistoryStructured: data.familyHistoryStructured ?? null,
    socialHistory: data.socialHistory,
    socialHistoryStructured: data.socialHistoryStructured ?? null,
    pastSurgicalHistory: data.pastSurgicalHistory,
    pastSurgicalHistoryStructured: data.pastSurgicalHistoryStructured ?? null,
  };
}

export function subjectiveCarryForwardHasFamilyHistory(
  source: Pick<SubjectiveCarryForwardSource, "familyHistory" | "familyHistoryStructured">,
): boolean {
  return resolveFamilyHistoryForCarryForward(source) != null;
}

export function subjectiveCarryForwardHasPastSurgicalHistory(
  source: Pick<
    SubjectiveCarryForwardSource,
    "pastSurgicalHistory" | "pastSurgicalHistoryStructured"
  >,
): boolean {
  return resolvePastSurgicalHistoryForCarryForward(source) != null;
}
