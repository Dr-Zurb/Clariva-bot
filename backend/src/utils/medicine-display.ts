/**
 * Backend mirror of frontend/lib/medicineCodes.ts (EHR Sub-batch B2 / T3.15).
 *
 * Both surfaces (the doctor-side <PrescriptionForm> and the backend-
 * generated PDF) need the SAME label vocabulary so the patient sees
 * "Twice daily" in the PDF when the doctor picked `BID` in the form.
 *
 * We intentionally duplicate (rather than cross-package import)
 * because:
 *   - Backend has no @/ alias to frontend src.
 *   - Pulling frontend code into the backend dep tree adds React /
 *     Next.js types we don't want.
 *   - The vocabulary is small + locked (Decision T2-D4) — drift is
 *     trivial to keep in lockstep.
 *
 * **Sync rule**: when `frontend/lib/medicineCodes.ts` changes, change
 * this file too. Keep the option arrays in the same order so a quick
 * eyeball shows parity.
 */

import type {
  DurationUnit,
  FrequencyCode,
  PrescriptionMedicine,
  RouteCode,
} from '../types/prescription';

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

const FREQUENCY_LEGACY: Record<FrequencyCode, string> = {
  OD: 'Once daily',
  BID: 'Twice daily',
  TID: 'Three times daily',
  QID: 'Four times daily',
  QHS: 'At bedtime',
  PRN: 'As needed',
  STAT: 'Once (immediately)',
  CUSTOM: '',
};

export function getFrequencyLegacyLabel(code: FrequencyCode | null | undefined): string {
  if (!code) return '';
  return FREQUENCY_LEGACY[code] ?? '';
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

interface DurationUnitMeta {
  label: string;
  takesValue: boolean;
}

const DURATION_UNIT_META: Record<DurationUnit, DurationUnitMeta> = {
  days: { label: 'days', takesValue: true },
  weeks: { label: 'weeks', takesValue: true },
  months: { label: 'months', takesValue: true },
  'until-finished': { label: 'until finished', takesValue: false },
  continue: { label: 'continue', takesValue: false },
};

export function durationUnitTakesValue(unit: DurationUnit | null | undefined): boolean {
  if (!unit) return false;
  return DURATION_UNIT_META[unit]?.takesValue ?? false;
}

/**
 * Build the legacy `duration` text from structured (value, unit). Returns
 * empty string when either piece is missing. Examples:
 *   (5, 'days')           → "5 days"
 *   (1, 'weeks')          → "1 week"     (singularised)
 *   (null, 'continue')    → "Continue"
 *   (null, 'until-finished') → "Until finished"
 */
export function formatDurationLegacyLabel(
  value: number | null | undefined,
  unit: DurationUnit | null | undefined,
): string {
  if (!unit) return '';
  const meta = DURATION_UNIT_META[unit];
  if (!meta) return '';

  if (!meta.takesValue) {
    return meta.label.charAt(0).toUpperCase() + meta.label.slice(1);
  }

  if (value === null || value === undefined || value <= 0) return '';

  const singular = value === 1 ? meta.label.replace(/s$/, '') : meta.label;
  return `${value} ${singular}`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const ROUTE_LEGACY: Record<RouteCode, string> = {
  oral: 'Oral',
  IV: 'IV',
  IM: 'IM',
  SC: 'SC',
  topical: 'Topical',
  inhaled: 'Inhaled',
  rectal: 'Rectal',
  nasal: 'Nasal',
  sublingual: 'Sublingual',
  other: '',
};

export function getRouteLegacyLabel(code: RouteCode | null | undefined): string {
  if (!code) return '';
  return ROUTE_LEGACY[code] ?? '';
}

// ---------------------------------------------------------------------------
// PrescriptionMedicine → display strings
// ---------------------------------------------------------------------------

/**
 * Pick the best human-readable string for each display column on a
 * PrescriptionMedicine row. Prefers structured-derived labels when
 * the structured field is set; falls back to the legacy free-text
 * column otherwise. This is the canonical "what does the patient see
 * in the PDF" projection.
 *
 * The PDF's <MedicineTable> calls this once per row; the patient
 * share page calls it on the FE. (The FE has its own copy in
 * frontend/lib/medicineCodes.ts — keep them in sync.)
 */
export interface MedicineDisplay {
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export function projectMedicineForDisplay(med: PrescriptionMedicine): MedicineDisplay {
  // Frequency: structured wins when set + non-CUSTOM (CUSTOM means
  // doctor wanted free-text; the legacy column carries that text).
  let frequency = '';
  if (med.frequency_code && med.frequency_code !== 'CUSTOM') {
    frequency = getFrequencyLegacyLabel(med.frequency_code);
  } else if (med.frequency) {
    frequency = med.frequency;
  }

  // Duration: structured wins when both pieces are present (or unit
  // is value-less like 'continue').
  let duration = '';
  if (med.duration_unit) {
    duration = formatDurationLegacyLabel(med.duration_value, med.duration_unit);
  }
  if (!duration && med.duration) {
    duration = med.duration;
  }

  // Route: structured wins when set + non-'other'.
  let route = '';
  if (med.route_code && med.route_code !== 'other') {
    route = getRouteLegacyLabel(med.route_code);
  } else if (med.route) {
    route = med.route;
  }

  return {
    name: med.medicine_name ?? '',
    dosage: med.dosage ?? '',
    route,
    frequency,
    duration,
    instructions: med.instructions ?? '',
  };
}
