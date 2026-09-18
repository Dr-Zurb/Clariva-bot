/**
 * Doctor complaint-combo service.
 *
 * Aggregates attested prescriptions.complaints into (name + stable pack) habits
 * for the chief-complaint capture-bar typeahead. Clear writes a reset timestamp
 * into doctor_settings.opd_policies (no new table). Duration / onset / scores
 * are not in the habit identity.
 */

import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from './doctor-settings-service';
import { handleSupabaseError } from '../utils/db-helpers';
import { logAuditEvent, logDataAccess } from '../utils/audit-logger';
import { InternalError, NotFoundError } from '../utils/errors';
import type { DoctorComplaintCombo } from '../types/doctor-complaint-combo';

export const COMPLAINT_COMBO_WINDOW_MONTHS = 6;
export const COMPLAINT_COMBO_RAW_ROW_CAP = 4000;
export const COMPLAINT_COMBO_LIST_CAP = 200;
export const COMPLAINT_COMBO_RESETS_KEY = 'complaint_combo_resets';

export interface ComplaintComboSourceRow {
  complaints: unknown;
  created_at: string;
  attested_at: string | null;
}

export type ComplaintComboHabitKey = Pick<
  DoctorComplaintCombo,
  | 'nameKey'
  | 'category'
  | 'severityBand'
  | 'laterality'
  | 'character'
  | 'associatedNames'
>;

function normalizeNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function complaintSeverityBand(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    if (value <= 3) return 'mild';
    if (value <= 6) return 'moderate';
    if (value <= 8) return 'severe';
    return 'very_severe';
  }
  if (typeof value !== 'string') return null;
  const band = value.trim().toLowerCase();
  if (band === 'minimal') return 'mild';
  if (band === 'mild' || band === 'moderate' || band === 'severe' || band === 'very_severe') {
    return band;
  }
  return null;
}

function associatedNameKeys(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const raw of names) {
    const key = normalizeNameKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  keys.sort();
  return keys;
}

function displayAssociatedNames(
  names: readonly string[],
  keys: readonly string[]
): string[] {
  const latest = new Map<string, string>();
  for (const raw of names) {
    const key = normalizeNameKey(raw);
    const label = raw.trim();
    if (!key || !label) continue;
    latest.set(key, label);
  }
  return keys.map((key) => latest.get(key) ?? key);
}

function collectAssociatedNames(complaint: Record<string, unknown>): string[] {
  const names: string[] = [];
  const associated = complaint.associated;
  if (Array.isArray(associated)) {
    for (const item of associated) {
      if (typeof item === 'string') names.push(item);
    }
  }
  const children = complaint.associatedComplaints;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const name = (child as { name?: unknown }).name;
      if (typeof name === 'string') names.push(name);
    }
  }
  return names;
}

export function complaintComboHabitSignature(habit: ComplaintComboHabitKey): string {
  return [
    normalizeNameKey(habit.nameKey),
    (habit.category ?? '').trim().toLowerCase(),
    (habit.severityBand ?? '').trim().toLowerCase(),
    (habit.laterality ?? '').trim().toLowerCase(),
    (habit.character ?? '').trim().toLowerCase(),
    associatedNameKeys(habit.associatedNames).join(','),
  ].join('|');
}

function hasPack(habit: ComplaintComboHabitKey): boolean {
  return Boolean(
    habit.severityBand ||
    habit.laterality ||
    habit.character ||
    associatedNameKeys(habit.associatedNames).length > 0
  );
}

function asComplaintRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

function habitFromComplaint(complaint: Record<string, unknown>): {
  nameKey: string;
  displayName: string;
  habit: ComplaintComboHabitKey;
} | null {
  const displayName = typeof complaint.name === 'string' ? complaint.name.trim() : '';
  const nameKey = normalizeNameKey(displayName);
  if (!nameKey) return null;
  const associated = collectAssociatedNames(complaint);
  const habit: ComplaintComboHabitKey = {
    nameKey,
    category: trimOrNull(typeof complaint.category === 'string' ? complaint.category : null),
    severityBand: complaintSeverityBand(complaint.severity ?? complaint.painScore),
    laterality: trimOrNull(typeof complaint.laterality === 'string' ? complaint.laterality : null),
    character: trimOrNull(typeof complaint.character === 'string' ? complaint.character : null),
    associatedNames: displayAssociatedNames(associated, associatedNameKeys(associated)),
  };
  if (!hasPack(habit)) return null;
  return { nameKey, displayName, habit };
}

function laterIso(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function parseComplaintComboResets(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, iso] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key || typeof iso !== 'string') continue;
    if (!Number.isFinite(Date.parse(iso))) continue;
    out[key] = iso;
  }
  return out;
}

function pruneComplaintComboResets(
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

export function aggregateDoctorComplaintCombos(
  rows: ComplaintComboSourceRow[],
  resets: Record<string, string> = {}
): DoctorComplaintCombo[] {
  const buckets = new Map<string, DoctorComplaintCombo>();

  for (const row of rows) {
    if (!row.attested_at) continue;
    const usedAt = row.created_at;
    for (const complaint of asComplaintRecords(row.complaints)) {
      const parsed = habitFromComplaint(complaint);
      if (!parsed) continue;
      const sig = complaintComboHabitSignature(parsed.habit);
      const resetAt = resets[sig];
      if (resetAt && Date.parse(usedAt) <= Date.parse(resetAt)) continue;

      const existing = buckets.get(sig);
      if (!existing) {
        buckets.set(sig, {
          complaintName: parsed.displayName,
          nameKey: parsed.nameKey,
          category: parsed.habit.category,
          severityBand: parsed.habit.severityBand,
          laterality: parsed.habit.laterality,
          character: parsed.habit.character,
          associatedNames: parsed.habit.associatedNames,
          useCount: 1,
          lastUsedAt: usedAt,
        });
        continue;
      }

      existing.useCount += 1;
      if (Date.parse(usedAt) >= Date.parse(existing.lastUsedAt)) {
        existing.lastUsedAt = usedAt;
        existing.complaintName = parsed.displayName;
        existing.category = parsed.habit.category;
        existing.severityBand = parsed.habit.severityBand;
        existing.laterality = parsed.habit.laterality;
        existing.character = parsed.habit.character;
        existing.associatedNames = parsed.habit.associatedNames;
      } else {
        existing.lastUsedAt = laterIso(existing.lastUsedAt, usedAt);
      }
    }
  }

  return [...buckets.values()]
    .sort((a, b) => {
      if (a.useCount !== b.useCount) return b.useCount - a.useCount;
      return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
    })
    .slice(0, COMPLAINT_COMBO_LIST_CAP);
}

function windowStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - COMPLAINT_COMBO_WINDOW_MONTHS);
  return start.toISOString();
}

async function loadComplaintComboResets(doctorId: string): Promise<Record<string, string>> {
  const settings = await getDoctorSettings(doctorId);
  const raw = settings?.opd_policies?.[COMPLAINT_COMBO_RESETS_KEY];
  return parseComplaintComboResets(raw);
}

export async function listMyComplaintCombos(
  correlationId: string,
  doctorId: string
): Promise<DoctorComplaintCombo[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('prescriptions')
    .select('complaints, created_at, attested_at')
    .eq('doctor_id', doctorId)
    .not('attested_at', 'is', null)
    .gte('created_at', windowStartIso())
    .order('created_at', { ascending: false })
    .limit(COMPLAINT_COMBO_RAW_ROW_CAP);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, doctorId, 'doctor_complaint_combos', undefined);

  const resets = await loadComplaintComboResets(doctorId);
  return aggregateDoctorComplaintCombos(
    (data ?? []) as unknown as ComplaintComboSourceRow[],
    resets
  );
}

export async function clearMyComplaintCombo(
  correlationId: string,
  doctorId: string,
  habit: ComplaintComboHabitKey
): Promise<{ cleared: true }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const settings = await getDoctorSettings(doctorId);
  if (!settings) {
    throw new NotFoundError('Doctor settings not found');
  }

  const sig = complaintComboHabitSignature(habit);
  const policies = { ...(settings.opd_policies ?? {}) };
  const resets = pruneComplaintComboResets(
    parseComplaintComboResets(policies[COMPLAINT_COMBO_RESETS_KEY])
  );
  resets[sig] = new Date().toISOString();
  policies[COMPLAINT_COMBO_RESETS_KEY] = resets;

  const { error } = await admin
    .from('doctor_settings')
    .update({ opd_policies: policies })
    .eq('doctor_id', doctorId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logAuditEvent({
    correlationId,
    action: 'doctor_complaint_combo_clear',
    resourceType: 'doctor_settings',
    status: 'success',
    metadata: { cleared: true },
  });

  return { cleared: true };
}
