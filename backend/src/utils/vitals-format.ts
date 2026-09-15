/**
 * Compact vitals line for the prescription PDF.
 * Only fields that are present are printed; empty → null (section omitted).
 */

export interface VitalsForOutput {
  vitalsBpSystolic?: number | null;
  vitalsBpDiastolic?: number | null;
  vitalsHr?: number | null;
  vitalsTempC?: number | null;
  vitalsSpo2?: number | null;
  vitalsWtKg?: number | null;
  vitalsHtCm?: number | null;
  vitalsRr?: number | null;
  vitalsPainScore?: number | null;
  vitalsGlucoseMgDl?: number | null;
  vitalsGcsTotal?: number | null;
  vitalsBpPosture?: string | null;
  vitalsBpLimb?: string | null;
  note?: string | null;
}

const POSTURE_LABEL: Record<string, string> = {
  sitting: 'sitting',
  standing: 'standing',
  supine: 'supine',
};

const LIMB_LABEL: Record<string, string> = {
  left_arm: 'L arm',
  right_arm: 'R arm',
  left_leg: 'L leg',
  right_leg: 'R leg',
};

function formatBp(v: VitalsForOutput): string | null {
  if (v.vitalsBpSystolic == null || v.vitalsBpDiastolic == null) return null;
  const extras: string[] = [];
  const posture = v.vitalsBpPosture ? POSTURE_LABEL[v.vitalsBpPosture] : null;
  const limb = v.vitalsBpLimb ? LIMB_LABEL[v.vitalsBpLimb] : null;
  if (posture) extras.push(posture);
  if (limb) extras.push(limb);
  const core = `BP ${v.vitalsBpSystolic}/${v.vitalsBpDiastolic}`;
  return extras.length > 0 ? `${core} (${extras.join(', ')})` : core;
}

function formatNumber(value: number | null | undefined, suffix: string): string | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${value}${suffix}`;
}

export function formatVitalsForOutput(v: VitalsForOutput | null | undefined): string | null {
  if (!v) return null;
  const parts = [
    formatBp(v),
    formatNumber(v.vitalsHr, ' bpm') ? `HR ${v.vitalsHr}` : null,
    formatNumber(v.vitalsTempC, '') ? `Temp ${v.vitalsTempC} °C` : null,
    formatNumber(v.vitalsSpo2, '') ? `SpO₂ ${v.vitalsSpo2}%` : null,
    formatNumber(v.vitalsWtKg, '') ? `Wt ${v.vitalsWtKg} kg` : null,
    formatNumber(v.vitalsHtCm, '') ? `Ht ${v.vitalsHtCm} cm` : null,
    formatNumber(v.vitalsRr, '') ? `RR ${v.vitalsRr}` : null,
    formatNumber(v.vitalsPainScore, '') ? `Pain ${v.vitalsPainScore}/10` : null,
    formatNumber(v.vitalsGlucoseMgDl, '') ? `Glucose ${v.vitalsGlucoseMgDl} mg/dL` : null,
    formatNumber(v.vitalsGcsTotal, '') ? `GCS ${v.vitalsGcsTotal}` : null,
  ].filter((p): p is string => Boolean(p));
  const note = v.note?.trim();
  if (note) {
    if (parts.length === 0) return note;
    return `${parts.join(' · ')} — ${note}`;
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
