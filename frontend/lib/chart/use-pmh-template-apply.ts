/**
 * usePmhTemplateApply (subj-17) — server-backed "past medical history" template apply.
 *
 * Apply is **additive only** (P6-D3): for each templated condition/medication we
 * create a chart row unless a same-name row already exists (case-insensitive,
 * trimmed dedup). Per-row failures are non-fatal — successes are kept, a count is
 * surfaced, and we resync from the server so the UI reflects the true state.
 *
 * The hook does not own chart state; it drives the section's existing optimistic
 * single-row creators (which already reuse the stable-key machinery), so applied
 * rows render exactly like manually-added ones.
 */

import { useCallback } from "react";
import type {
  DoctorRxTemplate,
  RxTemplatePmh,
  RxTemplatePmhCondition,
  RxTemplatePmhMedication,
} from "@/types/rx-template";
import type {
  CreatePatientMedicationPayload,
  MedicalBackgroundGrouped,
  PatientMedication,
} from "@/types/patient-chart";

/** Outcome of a single create-on-apply attempt. */
export type ApplyRowResult = "created" | "duplicate" | "error";

export interface TemplateApplySummary {
  created: number;
  /** Rows skipped because a same-name row already existed (deduped). */
  skipped: number;
  /** Rows whose create failed — kept successes, surfaced to the doctor. */
  failed: number;
}

const norm = (value: string): string => value.trim().toLowerCase();

/**
 * Render a counts-only summary (no PHI) for the section notice. Returns null
 * when nothing happened and nothing was deduped.
 */
export function formatApplySummary(summary: TemplateApplySummary, noun: string): string | null {
  if (summary.created === 0 && summary.failed === 0) {
    return summary.skipped > 0 ? `All ${noun} already present` : null;
  }
  const parts = [`Added ${summary.created} ${noun}`];
  if (summary.skipped > 0) parts.push(`${summary.skipped} already present`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  return parts.join(" · ");
}

/** Deduped flat list of every medication referenced by the background graph. */
function flattenMedications(background: MedicalBackgroundGrouped): PatientMedication[] {
  const byId = new Map<string, PatientMedication>();
  for (const c of background.conditions) for (const m of c.medications) byId.set(m.id, m);
  for (const m of background.unlinkedMedications) byId.set(m.id, m);
  return Array.from(byId.values());
}

/** Snapshot the patient's current PMH chart slice into the template JSON shape. */
export function snapshotPmh(background: MedicalBackgroundGrouped): RxTemplatePmh {
  const conditions: RxTemplatePmhCondition[] = background.conditions
    .filter((c) => c.condition.trim())
    .map((c) => ({
      condition: c.condition.trim(),
      status: (c.status ?? "active") === "resolved" ? "resolved" : "active",
      ...(c.note ? { note: c.note } : {}),
    }));
  const medications: RxTemplatePmhMedication[] = flattenMedications(background)
    .filter((m) => m.drug_name.trim())
    .map((m) => {
      const strength = m.strength ?? m.dose;
      return {
        drugName: m.drug_name.trim(),
        ...(strength ? { strength } : {}),
        ...(m.frequency ? { frequency: m.frequency } : {}),
        status: m.status === "past" ? "past" : "active",
        ...(m.form ? { form: m.form } : {}),
        ...(m.note ? { note: m.note } : {}),
      };
    });
  return { conditions, medications };
}

/** True when there is any PMH chart content worth saving as a template. */
export function pmhHasContent(background: MedicalBackgroundGrouped | null): boolean {
  if (!background) return false;
  return background.conditions.length > 0 || flattenMedications(background).length > 0;
}

export interface PmhExisting {
  conditions: { condition: string }[];
  medications: { drug_name: string }[];
}

export interface PmhApplyPlan {
  conditions: RxTemplatePmhCondition[];
  medications: RxTemplatePmhMedication[];
  /** Rows dropped up-front because they duplicate an existing/earlier row. */
  skipped: number;
}

/**
 * Decide which templated rows to create. Drops rows that duplicate an existing
 * chart row (name-based, case-insensitive, trimmed) or an earlier row in the
 * same template.
 */
export function planPmhApply(template: DoctorRxTemplate, existing: PmhExisting): PmhApplyPlan {
  const existingConditions = new Set(existing.conditions.map((c) => norm(c.condition)));
  const existingMedications = new Set(existing.medications.map((m) => norm(m.drug_name)));

  const conditions: RxTemplatePmhCondition[] = [];
  const medications: RxTemplatePmhMedication[] = [];
  let skipped = 0;

  const seenConditions = new Set<string>();
  for (const c of template.pmh_json?.conditions ?? []) {
    const key = norm(c.condition ?? "");
    if (!key || existingConditions.has(key) || seenConditions.has(key)) {
      skipped += 1;
      continue;
    }
    seenConditions.add(key);
    conditions.push(c);
  }

  const seenMedications = new Set<string>();
  for (const m of template.pmh_json?.medications ?? []) {
    const key = norm(m.drugName ?? "");
    if (!key || existingMedications.has(key) || seenMedications.has(key)) {
      skipped += 1;
      continue;
    }
    seenMedications.add(key);
    medications.push(m);
  }

  return { conditions, medications, skipped };
}

/** Build a chart medication create payload from a templated medication. */
export function pmhMedToCreatePayload(
  med: RxTemplatePmhMedication,
): CreatePatientMedicationPayload {
  return {
    drugName: med.drugName.trim(),
    strength: med.strength ?? null,
    dose: med.dose ?? null,
    frequency: med.frequency ?? null,
    status: med.status ?? "active",
    form: med.form ?? null,
    note: med.note ?? null,
  };
}

export interface UsePmhTemplateApplyParams {
  /** Snapshot of the chart slice to dedup against — read fresh at apply time. */
  getExisting: () => PmhExisting;
  /** Optimistic single-condition create; returns per-row outcome. */
  createCondition: (condition: RxTemplatePmhCondition) => Promise<ApplyRowResult>;
  /** Optimistic single-medication create; returns per-row outcome. */
  createMedication: (med: RxTemplatePmhMedication) => Promise<ApplyRowResult>;
  /** Resync from the server (called only after a partial failure). */
  reload: () => Promise<unknown>;
  /** Surface a counts-only summary to the doctor. */
  onSummary?: (summary: TemplateApplySummary) => void;
}

export interface ApplyPmhTemplateOptions {
  /** Override the hook-level summary callback for this apply (subj-18 full bundle). */
  onSummary?: (summary: TemplateApplySummary) => void;
}

/** Returns an `apply(template)` callback wired to the section's optimistic creators. */
export function usePmhTemplateApply(params: UsePmhTemplateApplyParams) {
  const { getExisting, createCondition, createMedication, reload, onSummary } = params;
  return useCallback(
    async (template: DoctorRxTemplate, opts?: ApplyPmhTemplateOptions) => {
      const plan = planPmhApply(template, getExisting());
      let created = 0;
      let skipped = plan.skipped;
      let failed = 0;

      for (const condition of plan.conditions) {
        const result = await createCondition(condition);
        if (result === "created") created += 1;
        else if (result === "duplicate") skipped += 1;
        else failed += 1;
      }
      for (const med of plan.medications) {
        const result = await createMedication(med);
        if (result === "created") created += 1;
        else if (result === "duplicate") skipped += 1;
        else failed += 1;
      }

      // Partial failure is non-fatal: keep the successes, resync truth.
      if (failed > 0) await reload();
      const summary = { created, skipped, failed };
      (opts?.onSummary ?? onSummary)?.(summary);
    },
    [getExisting, createCondition, createMedication, reload, onSummary],
  );
}

/** True when a template's `pmh_json` has any recreate-able rows. */
export function pmhTemplateHasContent(pmh: RxTemplatePmh | null | undefined): boolean {
  if (!pmh) return false;
  const hasConditions = (pmh.conditions ?? []).some((c) => c.condition?.trim());
  const hasMedications = (pmh.medications ?? []).some((m) => m.drugName?.trim());
  return hasConditions || hasMedications;
}
