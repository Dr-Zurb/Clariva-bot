/**
 * Doctor medicine-combo service.
 *
 * Aggregates attested prescription_medicines into (typed name + sig) habits
 * for the capture-bar typeahead. Clear writes a reset timestamp into
 * doctor_settings.opd_policies (no new table). Instructions are not in the sig.
 */

import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from './doctor-settings-service';
import { handleSupabaseError } from '../utils/db-helpers';
import { logAuditEvent, logDataAccess } from '../utils/audit-logger';
import { InternalError, NotFoundError } from '../utils/errors';
import type { DoctorMedicineCombo } from '../types/doctor-medicine-combo';

/** Look back this many months of attested Rx. */
export const MEDICINE_COMBO_WINDOW_MONTHS = 6;

/** Raw line-item cap before in-process aggregation. */
export const MEDICINE_COMBO_RAW_ROW_CAP = 4000;

/** Max aggregated combos returned to the client. */
export const MEDICINE_COMBO_LIST_CAP = 200;

/** Stored on doctor_settings.opd_policies — per-habit count reset. */
export const MEDICINE_COMBO_RESETS_KEY = 'medicine_combo_resets';

const DOSE_SCHEDULE_RE = /^\d+(?:-\d+){1,3}$/;

export interface MedicineComboSourceRow {
  medicine_name: string | null;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  drug_master_id: string | null;
  frequency_code: string | null;
  duration_value: number | null;
  duration_unit: string | null;
  route_code: string | null;
  dose_qty: number | string | null;
  dose_unit: string | null;
  form: string | null;
  food_timing: string | null;
  prescriptions:
    | {
        doctor_id: string;
        created_at: string;
        attested_at: string | null;
      }
    | {
        doctor_id: string;
        created_at: string;
        attested_at: string | null;
      }[]
    | null;
}

/** Fields that identify a habit for clear / reset. */
export type MedicineComboHabitKey = Pick<
  DoctorMedicineCombo,
  | 'nameKey'
  | 'dosage'
  | 'doseQty'
  | 'doseUnit'
  | 'frequencyCode'
  | 'frequency'
  | 'durationValue'
  | 'durationUnit'
  | 'duration'
  | 'foodTiming'
  | 'routeCode'
  | 'form'
>;

function normalizeNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

function extractDoseSchedule(frequency: string | null | undefined): string {
  const trimmed = (frequency ?? '').trim().replace(/[–]/g, '-');
  return DOSE_SCHEDULE_RE.test(trimmed) ? trimmed : '';
}

function asQty(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function frequencySigPart(frequencyCode: string | null, frequency: string | null): string {
  const schedule = extractDoseSchedule(frequency);
  if (schedule) return `sched:${schedule}`;
  if (frequencyCode) return `code:${frequencyCode}`;
  return `text:${(frequency ?? '').trim().toLowerCase()}`;
}

function durationSigPart(
  durationValue: number | null,
  durationUnit: string | null,
  duration: string | null
): string {
  if (durationUnit) return `${durationValue ?? ''}:${durationUnit}`;
  return `text:${(duration ?? '').trim().toLowerCase()}`;
}

function hasSig(row: MedicineComboSourceRow): boolean {
  const dosage = (row.dosage ?? '').trim();
  const duration = (row.duration ?? '').trim();
  return Boolean(
    asQty(row.dose_qty) != null ||
    dosage ||
    row.frequency_code ||
    extractDoseSchedule(row.frequency) ||
    (row.frequency ?? '').trim() ||
    row.duration_unit ||
    duration ||
    row.food_timing ||
    row.route_code
  );
}

function embedPrescription(row: MedicineComboSourceRow): {
  created_at: string;
  attested_at: string | null;
} | null {
  const embed = row.prescriptions;
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

export function medicineComboHabitSignature(habit: MedicineComboHabitKey): string {
  return [
    normalizeNameKey(habit.nameKey),
    (habit.dosage ?? '').trim().toLowerCase(),
    asQty(habit.doseQty) ?? '',
    (habit.doseUnit ?? '').trim().toLowerCase(),
    frequencySigPart(habit.frequencyCode, habit.frequency),
    durationSigPart(habit.durationValue, habit.durationUnit, habit.duration),
    (habit.foodTiming ?? '').trim().toLowerCase(),
    (habit.routeCode ?? '').trim().toLowerCase(),
    (habit.form ?? '').trim().toLowerCase(),
  ].join('|');
}

function comboSignature(nameKey: string, row: MedicineComboSourceRow): string {
  return medicineComboHabitSignature({
    nameKey,
    dosage: (row.dosage ?? '').trim(),
    doseQty: asQty(row.dose_qty),
    doseUnit: row.dose_unit,
    frequencyCode: row.frequency_code,
    frequency: (row.frequency ?? '').trim(),
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    duration: (row.duration ?? '').trim(),
    foodTiming: row.food_timing,
    routeCode: row.route_code,
    form: row.form,
  });
}

function laterIso(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function parseMedicineComboResets(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, iso] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key || typeof iso !== 'string') continue;
    if (!Number.isFinite(Date.parse(iso))) continue;
    out[key] = iso;
  }
  return out;
}

function pruneMedicineComboResets(
  resets: Record<string, string>,
  now = new Date()
): Record<string, string> {
  const floor = Date.parse(windowStartIso(now));
  const kept: Record<string, string> = {};
  for (const [sig, iso] of Object.entries(resets)) {
    if (Date.parse(iso) >= floor) kept[sig] = iso;
  }
  return kept;
}

/**
 * Group raw line items into ranked (name + sig) habits.
 * Uses after `resets[sig]` are ignored so a clear starts the count over.
 */
export function aggregateDoctorMedicineCombos(
  rows: MedicineComboSourceRow[],
  resets: Record<string, string> = {}
): DoctorMedicineCombo[] {
  const buckets = new Map<string, DoctorMedicineCombo & { _hasMaster: boolean }>();

  for (const row of rows) {
    const rx = embedPrescription(row);
    if (!rx?.attested_at) continue;

    const nameKey = normalizeNameKey(row.medicine_name);
    if (!nameKey || !hasSig(row)) continue;

    const usedAt = rx.created_at;
    const sig = comboSignature(nameKey, row);
    const resetAt = resets[sig];
    if (resetAt && Date.parse(usedAt) <= Date.parse(resetAt)) continue;

    const existing = buckets.get(sig);
    const displayName = (row.medicine_name ?? '').trim() || nameKey;
    const hasMaster = row.drug_master_id != null;

    if (!existing) {
      buckets.set(sig, {
        medicineName: displayName,
        nameKey,
        dosage: (row.dosage ?? '').trim(),
        doseQty: asQty(row.dose_qty),
        doseUnit: row.dose_unit,
        frequencyCode: row.frequency_code,
        frequency: (row.frequency ?? '').trim(),
        durationValue: row.duration_value,
        durationUnit: row.duration_unit,
        duration: (row.duration ?? '').trim(),
        foodTiming: row.food_timing,
        routeCode: row.route_code,
        route: (row.route ?? '').trim(),
        form: row.form,
        drugMasterId: row.drug_master_id,
        useCount: 1,
        lastUsedAt: usedAt,
        _hasMaster: hasMaster,
      });
      continue;
    }

    existing.useCount += 1;
    if (Date.parse(usedAt) >= Date.parse(existing.lastUsedAt)) {
      existing.lastUsedAt = usedAt;
      existing.medicineName = displayName;
      existing.dosage = (row.dosage ?? '').trim();
      existing.doseQty = asQty(row.dose_qty);
      existing.doseUnit = row.dose_unit;
      existing.frequencyCode = row.frequency_code;
      existing.frequency = (row.frequency ?? '').trim();
      existing.durationValue = row.duration_value;
      existing.durationUnit = row.duration_unit;
      existing.duration = (row.duration ?? '').trim();
      existing.foodTiming = row.food_timing;
      existing.routeCode = row.route_code;
      existing.route = (row.route ?? '').trim();
      existing.form = row.form;
    } else {
      existing.lastUsedAt = laterIso(existing.lastUsedAt, usedAt);
    }
    if (hasMaster && !existing._hasMaster) {
      existing.drugMasterId = row.drug_master_id;
      existing._hasMaster = true;
    }
  }

  return [...buckets.values()]
    .map(({ _hasMaster: _ignored, ...combo }) => combo)
    .sort((a, b) => {
      if (a.useCount !== b.useCount) return b.useCount - a.useCount;
      return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
    })
    .slice(0, MEDICINE_COMBO_LIST_CAP);
}

function windowStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - MEDICINE_COMBO_WINDOW_MONTHS);
  return start.toISOString();
}

async function loadMedicineComboResets(doctorId: string): Promise<Record<string, string>> {
  const settings = await getDoctorSettings(doctorId);
  const raw = settings?.opd_policies?.[MEDICINE_COMBO_RESETS_KEY];
  return parseMedicineComboResets(raw);
}

/**
 * Ranked medicine+sig habits for the calling doctor.
 */
export async function listMyMedicineCombos(
  correlationId: string,
  doctorId: string
): Promise<DoctorMedicineCombo[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('prescription_medicines')
    .select(
      [
        'medicine_name',
        'dosage',
        'route',
        'frequency',
        'duration',
        'drug_master_id',
        'frequency_code',
        'duration_value',
        'duration_unit',
        'route_code',
        'dose_qty',
        'dose_unit',
        'form',
        'food_timing',
        'prescriptions!inner(doctor_id, created_at, attested_at)',
      ].join(', ')
    )
    .eq('prescriptions.doctor_id', doctorId)
    .not('prescriptions.attested_at', 'is', null)
    .gte('prescriptions.created_at', windowStartIso())
    .order('created_at', { foreignTable: 'prescriptions', ascending: false })
    .limit(MEDICINE_COMBO_RAW_ROW_CAP);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, doctorId, 'doctor_medicine_combos', undefined);

  const resets = await loadMedicineComboResets(doctorId);
  return aggregateDoctorMedicineCombos(
    (data ?? []) as unknown as MedicineComboSourceRow[],
    resets
  );
}

/**
 * Forget historical uses of one habit. Later attested uses of the same
 * line start the count again and can become Most frequent.
 */
export async function clearMyMedicineCombo(
  correlationId: string,
  doctorId: string,
  habit: MedicineComboHabitKey
): Promise<{ cleared: true }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const settings = await getDoctorSettings(doctorId);
  if (!settings) {
    throw new NotFoundError('Doctor settings not found');
  }

  const sig = medicineComboHabitSignature(habit);
  const policies = { ...(settings.opd_policies ?? {}) };
  const resets = pruneMedicineComboResets(
    parseMedicineComboResets(policies[MEDICINE_COMBO_RESETS_KEY])
  );
  resets[sig] = new Date().toISOString();
  policies[MEDICINE_COMBO_RESETS_KEY] = resets;

  const { error } = await admin
    .from('doctor_settings')
    .update({ opd_policies: policies })
    .eq('doctor_id', doctorId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logAuditEvent({
    correlationId,
    action: 'doctor_medicine_combo_clear',
    resourceType: 'doctor_settings',
    status: 'success',
    metadata: { cleared: true },
  });

  return { cleared: true };
}
