/**
 * useAllergyTemplateApply (subj-17) — server-backed "allergies" template apply.
 *
 * Mirrors usePmhTemplateApply: additive-only create-on-apply, deduped by allergen
 * (case-insensitive, trimmed), partial-failure-tolerant, driving the section's
 * existing optimistic allergen creator so applied rows don't flicker/remount.
 */

import { useCallback } from "react";
import type {
  DoctorRxTemplate,
  RxTemplateAllergies,
  RxTemplateAllergyEntry,
} from "@/types/rx-template";
import type { PatientAllergy } from "@/types/patient-chart";
import type { ApplyRowResult, TemplateApplySummary } from "@/lib/chart/use-pmh-template-apply";

const norm = (value: string): string => value.trim().toLowerCase();

/** Snapshot the patient's current allergy chart slice into the template JSON shape. */
export function snapshotAllergies(rows: PatientAllergy[]): RxTemplateAllergies {
  return {
    allergies: rows
      .filter((r) => r.allergen.trim())
      .map((r) => ({
        allergen: r.allergen.trim(),
        severity: r.severity,
        ...(r.reaction ? { reaction: r.reaction } : {}),
      })),
  };
}

/** True when there is any allergy row worth saving as a template. */
export function allergiesHaveContent(rows: PatientAllergy[] | null): boolean {
  return !!rows && rows.some((r) => r.allergen.trim());
}

export interface AllergyApplyPlan {
  allergies: RxTemplateAllergyEntry[];
  skipped: number;
}

/** Decide which templated allergies to create (deduped by allergen). */
export function planAllergyApply(
  template: DoctorRxTemplate,
  existing: { allergen: string }[],
): AllergyApplyPlan {
  const existingSet = new Set(existing.map((a) => norm(a.allergen)));
  const allergies: RxTemplateAllergyEntry[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const entry of template.allergies_json?.allergies ?? []) {
    const key = norm(entry.allergen ?? "");
    if (!key || existingSet.has(key) || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    allergies.push(entry);
  }
  return { allergies, skipped };
}

export interface UseAllergyTemplateApplyParams {
  /** Snapshot of the allergen list to dedup against — read fresh at apply time. */
  getExisting: () => { allergen: string }[];
  /** Optimistic single-allergy create; returns per-row outcome. */
  createAllergy: (entry: RxTemplateAllergyEntry) => Promise<ApplyRowResult>;
  /** Resync from the server (called only after a partial failure). */
  reload: () => Promise<unknown>;
  onSummary?: (summary: TemplateApplySummary) => void;
}

/** Returns an `apply(template)` callback wired to the section's optimistic creator. */
export function useAllergyTemplateApply(params: UseAllergyTemplateApplyParams) {
  const { getExisting, createAllergy, reload, onSummary } = params;
  return useCallback(
    async (template: DoctorRxTemplate) => {
      const plan = planAllergyApply(template, getExisting());
      let created = 0;
      let skipped = plan.skipped;
      let failed = 0;

      for (const entry of plan.allergies) {
        const result = await createAllergy(entry);
        if (result === "created") created += 1;
        else if (result === "duplicate") skipped += 1;
        else failed += 1;
      }

      if (failed > 0) await reload();
      onSummary?.({ created, skipped, failed });
    },
    [getExisting, createAllergy, reload, onSummary],
  );
}
