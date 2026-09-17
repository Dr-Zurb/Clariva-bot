/**
 * Suggest recurring exact medicine packs as template candidates.
 *
 * Groups attested Rx (≥2 named+sig lines) by unordered habit-set.
 * Dismiss / seen keys live on doctor_settings.opd_policies (no new table).
 */

import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from './doctor-settings-service';
import { handleSupabaseError } from '../utils/db-helpers';
import { logAuditEvent, logDataAccess } from '../utils/audit-logger';
import { InternalError, NotFoundError } from '../utils/errors';
import {
  MEDICINE_COMBO_RAW_ROW_CAP,
  MEDICINE_COMBO_WINDOW_MONTHS,
  medicineComboHabitSignature,
  parseMedicineComboResets,
  type MedicineComboHabitKey,
  type MedicineComboSourceRow,
} from './doctor-medicine-combo-service';
import type {
  DoctorMedicinePackLine,
  DoctorMedicinePackSuggestion,
} from '../types/doctor-medicine-pack-suggestion';
import type { RxTemplateMedicine } from '../types/rx-template';

export const MEDICINE_PACK_MIN_MEDS = 2;
export const MEDICINE_PACK_MIN_USES = 5;
export const MEDICINE_PACK_SUGGESTION_CAP = 5;
export const MEDICINE_PACK_DISMISSALS_KEY = 'medicine_pack_dismissals';
export const MEDICINE_PACK_SEEN_KEYS = 'medicine_pack_suggestion_seen';

const DOSE_SCHEDULE_RE = /^\d+(?:-\d+){1,3}$/;

export type MedicinePackSourceRow = MedicineComboSourceRow & {
  prescriptions:
    | {
        id?: string;
        doctor_id: string;
        created_at: string;
        attested_at: string | null;
      }
    | {
        id?: string;
        doctor_id: string;
        created_at: string;
        attested_at: string | null;
      }[]
    | null;
};

export type MedicinePackHabitLine = MedicineComboHabitKey &
  Pick<DoctorMedicinePackLine, 'medicineName' | 'route' | 'drugMasterId'>;

export interface MedicinePackSuggestionList {
  suggestions: DoctorMedicinePackSuggestion[];
  unseenCount: number;
}

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

function embedPrescription(row: MedicinePackSourceRow): {
  id?: string;
  created_at: string;
  attested_at: string | null;
} | null {
  const embed = row.prescriptions;
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

function windowStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - MEDICINE_COMBO_WINDOW_MONTHS);
  return start.toISOString();
}

function pruneIsoMap(resets: Record<string, string>, now = new Date()): Record<string, string> {
  const floor = Date.parse(windowStartIso(now));
  const kept: Record<string, string> = {};
  for (const [sig, iso] of Object.entries(resets)) {
    if (Date.parse(iso) >= floor) kept[sig] = iso;
  }
  return kept;
}

function parseSeenKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((key): key is string => typeof key === 'string' && key.length > 0);
}

export function habitKeyFromPackLine(line: MedicineComboHabitKey): MedicineComboHabitKey {
  return {
    nameKey: normalizeNameKey(line.nameKey),
    dosage: (line.dosage ?? '').trim(),
    doseQty: asQty(line.doseQty),
    doseUnit: line.doseUnit ?? null,
    frequencyCode: line.frequencyCode ?? null,
    frequency: (line.frequency ?? '').trim(),
    durationValue: line.durationValue ?? null,
    durationUnit: line.durationUnit ?? null,
    duration: (line.duration ?? '').trim(),
    foodTiming: line.foodTiming ?? null,
    routeCode: line.routeCode ?? null,
    form: line.form ?? null,
  };
}

export function medicinePackSignature(habits: readonly MedicineComboHabitKey[]): string {
  return habits
    .map((habit) => medicineComboHabitSignature(habitKeyFromPackLine(habit)))
    .filter((sig) => sig.length > 0)
    .sort()
    .join('||');
}

function lineFromSourceRow(row: MedicineComboSourceRow): MedicinePackHabitLine | null {
  const nameKey = normalizeNameKey(row.medicine_name);
  if (!nameKey || !hasSig(row)) return null;
  return {
    medicineName: (row.medicine_name ?? '').trim() || nameKey,
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
  };
}

export function habitKeyFromTemplateMedicine(
  medicine: RxTemplateMedicine
): MedicineComboHabitKey | null {
  const nameKey = normalizeNameKey(medicine.medicineName);
  if (!nameKey) return null;
  return habitKeyFromPackLine({
    nameKey,
    dosage: medicine.dosage ?? '',
    doseQty: medicine.doseQty ?? null,
    doseUnit: medicine.doseUnit ?? null,
    frequencyCode: medicine.frequencyCode ?? null,
    frequency: medicine.frequency ?? '',
    durationValue: medicine.durationValue ?? null,
    durationUnit: medicine.durationUnit ?? null,
    duration: medicine.duration ?? '',
    foodTiming: medicine.foodTiming ?? null,
    routeCode: medicine.routeCode ?? null,
    form: medicine.form ?? null,
  });
}

export function savedMedicinePackKeys(
  templates: ReadonlyArray<{ medicines_json?: RxTemplateMedicine[] | null }>
): Set<string> {
  const keys = new Set<string>();
  for (const template of templates) {
    const habits = (template.medicines_json ?? [])
      .map((row) => habitKeyFromTemplateMedicine(row))
      .filter((row): row is MedicineComboHabitKey => row != null);
    if (habits.length < MEDICINE_PACK_MIN_MEDS) continue;
    keys.add(medicinePackSignature(habits));
  }
  return keys;
}

function toPackLine(line: MedicinePackHabitLine): DoctorMedicinePackLine {
  return {
    medicineName: line.medicineName,
    nameKey: line.nameKey,
    dosage: line.dosage,
    doseQty: line.doseQty,
    doseUnit: line.doseUnit,
    frequencyCode: line.frequencyCode,
    frequency: line.frequency,
    durationValue: line.durationValue,
    durationUnit: line.durationUnit,
    duration: line.duration,
    foodTiming: line.foodTiming,
    routeCode: line.routeCode,
    route: line.route,
    form: line.form,
    drugMasterId: line.drugMasterId,
  };
}

export function countUnseenPackSuggestions(
  suggestions: readonly DoctorMedicinePackSuggestion[],
  seenKeys: readonly string[]
): number {
  const seen = new Set(seenKeys);
  return suggestions.filter((row) => !seen.has(medicinePackSignature(row.medicines))).length;
}

/**
 * Rank exact attested packs. Uses after a dismiss timestamp are ignored.
 */
export function aggregateMedicinePackSuggestions(
  rows: MedicinePackSourceRow[],
  options: {
    dismissals?: Record<string, string>;
    savedPackKeys?: Iterable<string>;
    minUses?: number;
    cap?: number;
  } = {}
): DoctorMedicinePackSuggestion[] {
  const dismissals = options.dismissals ?? {};
  const saved = new Set(options.savedPackKeys ?? []);
  const minUses = options.minUses ?? MEDICINE_PACK_MIN_USES;
  const cap = options.cap ?? MEDICINE_PACK_SUGGESTION_CAP;

  const byRx = new Map<string, { usedAt: string; lines: Map<string, MedicinePackHabitLine> }>();

  for (const row of rows) {
    const rx = embedPrescription(row);
    if (!rx?.attested_at || !rx.id) continue;
    const line = lineFromSourceRow(row);
    if (!line) continue;

    const sig = medicineComboHabitSignature(line);
    const existing = byRx.get(rx.id);
    if (!existing) {
      byRx.set(rx.id, {
        usedAt: rx.created_at,
        lines: new Map([[sig, line]]),
      });
      continue;
    }
    existing.lines.set(sig, line);
    if (Date.parse(rx.created_at) > Date.parse(existing.usedAt)) {
      existing.usedAt = rx.created_at;
    }
  }

  const buckets = new Map<
    string,
    { useCount: number; lastUsedAt: string; medicines: MedicinePackHabitLine[] }
  >();

  for (const pack of byRx.values()) {
    if (pack.lines.size < MEDICINE_PACK_MIN_MEDS) continue;
    const medicines = [...pack.lines.values()].sort((a, b) =>
      a.nameKey.localeCompare(b.nameKey)
    );
    const packKey = medicinePackSignature(medicines);
    const dismissedAt = dismissals[packKey];
    if (dismissedAt && Date.parse(pack.usedAt) <= Date.parse(dismissedAt)) continue;
    if (saved.has(packKey)) continue;

    const existing = buckets.get(packKey);
    if (!existing) {
      buckets.set(packKey, {
        useCount: 1,
        lastUsedAt: pack.usedAt,
        medicines,
      });
      continue;
    }
    existing.useCount += 1;
    if (Date.parse(pack.usedAt) >= Date.parse(existing.lastUsedAt)) {
      existing.lastUsedAt = pack.usedAt;
      existing.medicines = medicines;
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.useCount >= minUses)
    .sort((a, b) => {
      if (a.useCount !== b.useCount) return b.useCount - a.useCount;
      return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
    })
    .slice(0, cap)
    .map((bucket) => ({
      medicines: bucket.medicines.map(toPackLine),
      useCount: bucket.useCount,
      lastUsedAt: bucket.lastUsedAt,
    }));
}

async function loadPackPolicyState(doctorId: string): Promise<{
  settings: Awaited<ReturnType<typeof getDoctorSettings>>;
  dismissals: Record<string, string>;
  seenKeys: string[];
}> {
  const settings = await getDoctorSettings(doctorId);
  const policies = settings?.opd_policies ?? {};
  return {
    settings,
    dismissals: parseMedicineComboResets(policies[MEDICINE_PACK_DISMISSALS_KEY]),
    seenKeys: parseSeenKeys(policies[MEDICINE_PACK_SEEN_KEYS]),
  };
}

async function loadAttestedMedicineRows(
  correlationId: string,
  doctorId: string
): Promise<MedicinePackSourceRow[]> {
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
        'prescriptions!inner(id, doctor_id, created_at, attested_at)',
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

  return (data ?? []) as unknown as MedicinePackSourceRow[];
}

async function loadSavedPackKeys(correlationId: string, doctorId: string): Promise<Set<string>> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('doctor_rx_templates')
    .select('medicines_json')
    .eq('doctor_id', doctorId)
    .eq('scope', 'medicines')
    .is('archived_at', null);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return savedMedicinePackKeys(
    (data ?? []) as Array<{ medicines_json?: RxTemplateMedicine[] | null }>
  );
}

async function buildSuggestionList(
  correlationId: string,
  doctorId: string
): Promise<MedicinePackSuggestionList & { settings: Awaited<ReturnType<typeof getDoctorSettings>> }> {
  const [rows, savedPackKeys, policy] = await Promise.all([
    loadAttestedMedicineRows(correlationId, doctorId),
    loadSavedPackKeys(correlationId, doctorId),
    loadPackPolicyState(doctorId),
  ]);

  const suggestions = aggregateMedicinePackSuggestions(rows, {
    dismissals: policy.dismissals,
    savedPackKeys,
  });

  return {
    suggestions,
    unseenCount: countUnseenPackSuggestions(suggestions, policy.seenKeys),
    settings: policy.settings,
  };
}

export async function listMyMedicinePackSuggestions(
  correlationId: string,
  doctorId: string
): Promise<MedicinePackSuggestionList> {
  const result = await buildSuggestionList(correlationId, doctorId);
  await logDataAccess(correlationId, doctorId, 'doctor_medicine_pack_suggestions', undefined);
  return {
    suggestions: result.suggestions,
    unseenCount: result.unseenCount,
  };
}

async function writeOpdPolicies(
  correlationId: string,
  doctorId: string,
  policies: Record<string, unknown>
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await admin
    .from('doctor_settings')
    .update({ opd_policies: policies })
    .eq('doctor_id', doctorId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

export async function dismissMyMedicinePackSuggestion(
  correlationId: string,
  doctorId: string,
  medicines: MedicineComboHabitKey[]
): Promise<{ dismissed: true }> {
  const settings = await getDoctorSettings(doctorId);
  if (!settings) {
    throw new NotFoundError('Doctor settings not found');
  }

  const packKey = medicinePackSignature(medicines);
  const policies = { ...(settings.opd_policies ?? {}) };
  const dismissals = pruneIsoMap(
    parseMedicineComboResets(policies[MEDICINE_PACK_DISMISSALS_KEY])
  );
  dismissals[packKey] = new Date().toISOString();
  policies[MEDICINE_PACK_DISMISSALS_KEY] = dismissals;

  await writeOpdPolicies(correlationId, doctorId, policies);
  await logAuditEvent({
    correlationId,
    action: 'doctor_medicine_pack_suggestion_dismiss',
    resourceType: 'doctor_settings',
    status: 'success',
    metadata: { dismissed: true },
  });

  return { dismissed: true };
}

export async function markMyMedicinePackSuggestionsSeen(
  correlationId: string,
  doctorId: string
): Promise<{ seen: true }> {
  const listed = await buildSuggestionList(correlationId, doctorId);
  if (!listed.settings) {
    throw new NotFoundError('Doctor settings not found');
  }

  const policies = { ...(listed.settings.opd_policies ?? {}) };
  policies[MEDICINE_PACK_SEEN_KEYS] = listed.suggestions.map((row) =>
    medicinePackSignature(row.medicines)
  );

  await writeOpdPolicies(correlationId, doctorId, policies);
  await logAuditEvent({
    correlationId,
    action: 'doctor_medicine_pack_suggestion_seen',
    resourceType: 'doctor_settings',
    status: 'success',
    metadata: { seen: true },
  });

  return { seen: true };
}
