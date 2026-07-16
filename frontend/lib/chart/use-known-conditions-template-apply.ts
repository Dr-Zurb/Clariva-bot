/**
 * Chart-backed Known conditions template snapshot + apply (Assessment).
 * Additive create with name dedupe — mirrors PMH template apply.
 */

import { useCallback } from "react";
import type {
  DoctorRxTemplate,
  RxTemplateKnownCondition,
} from "@/types/rx-template";
import type {
  CreatePatientConditionPayload,
  PatientChronicCondition,
} from "@/types/patient-chart";
import {
  formatApplySummary,
  type ApplyRowResult,
  type TemplateApplySummary,
} from "@/lib/chart/use-pmh-template-apply";

export { formatApplySummary };
export type { ApplyRowResult, TemplateApplySummary };

const norm = (value: string): string => value.trim().toLowerCase();

/** Snapshot active chart conditions into the template JSON shape. */
export function snapshotKnownConditions(
  conditions: readonly PatientChronicCondition[],
): RxTemplateKnownCondition[] {
  return conditions
    .filter((c) => c.condition?.trim())
    .map((c) => ({
      condition: c.condition.trim(),
      status: (c.status ?? "active") === "resolved" ? "resolved" : "active",
      ...(c.note ? { note: c.note } : {}),
      ...(c.code ? { code: c.code } : {}),
      ...(c.code_title ? { codeTitle: c.code_title } : {}),
    }));
}

export function knownConditionsHasContent(
  conditions: readonly PatientChronicCondition[] | null | undefined,
): boolean {
  return (conditions ?? []).some((c) => c.condition?.trim());
}

export function knownConditionsTemplateHasContent(
  template: DoctorRxTemplate,
): boolean {
  return (template.assessment_json?.knownConditions ?? []).some((c) =>
    c.condition?.trim(),
  );
}

export function planKnownConditionsApply(
  template: DoctorRxTemplate,
  existing: ReadonlyArray<{ condition: string }>,
): { conditions: RxTemplateKnownCondition[]; skipped: number } {
  const existingKeys = new Set(existing.map((c) => norm(c.condition)));
  const conditions: RxTemplateKnownCondition[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const c of template.assessment_json?.knownConditions ?? []) {
    const key = norm(c.condition ?? "");
    if (!key || existingKeys.has(key) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    conditions.push(c);
  }

  return { conditions, skipped };
}

export function knownConditionToCreatePayload(
  c: RxTemplateKnownCondition,
): CreatePatientConditionPayload {
  return {
    condition: c.condition.trim(),
    status: c.status ?? "active",
    note: c.note ?? null,
    code: c.code ?? null,
    codeTitle: c.codeTitle ?? null,
  };
}

export interface UseKnownConditionsTemplateApplyParams {
  getExisting: () => ReadonlyArray<{ condition: string }>;
  createCondition: (c: RxTemplateKnownCondition) => Promise<ApplyRowResult>;
  reload: () => Promise<unknown>;
  onSummary?: (summary: TemplateApplySummary) => void;
}

export function useKnownConditionsTemplateApply(
  params: UseKnownConditionsTemplateApplyParams,
) {
  const { getExisting, createCondition, reload, onSummary } = params;
  return useCallback(
    async (template: DoctorRxTemplate) => {
      const plan = planKnownConditionsApply(template, getExisting());
      let created = 0;
      let skipped = plan.skipped;
      let failed = 0;

      for (const condition of plan.conditions) {
        const result = await createCondition(condition);
        if (result === "created") created += 1;
        else if (result === "duplicate") skipped += 1;
        else failed += 1;
      }

      if (failed > 0) await reload();
      onSummary?.({ created, skipped, failed });
    },
    [getExisting, createCondition, reload, onSummary],
  );
}
