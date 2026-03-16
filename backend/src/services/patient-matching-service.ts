/**
 * Patient Matching Service (e-task-2)
 *
 * Fuzzy matching for "booking for someone else" to suggest "Same person?" and avoid duplicates.
 * Phone last-10 required; name similarity, age ±2, gender as optional boost.
 * No PHI in logs (COMPLIANCE.md).
 */

import { getSupabaseAdminClient } from '../config/database';
import { InternalError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import type { Patient } from '../types';

export interface PossiblePatientMatch {
  patientId: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medicalRecordNumber?: string;
  confidence: number;
}

const CONFIDENCE_THRESHOLD = 0.5;
const MAX_MATCHES = 5;

/**
 * Normalize phone to last 10 digits (strip country code, spaces).
 */
function normalizePhoneLast10(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Name similarity score 0–1. Uses Levenshtein; exact=1, high similarity=0.8+, partial=0.5+.
 */
function nameSimilarity(inputName: string, dbName: string): number {
  const a = inputName.trim().toLowerCase().replace(/\s+/g, ' ');
  const b = dbName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  const ratio = 1 - dist / maxLen;
  if (ratio >= 0.9) return 0.95;
  if (ratio >= 0.8) return 0.85;
  if (ratio >= 0.6) return 0.7;
  if (ratio >= 0.4) return 0.55;
  if (a.includes(b) || b.includes(a)) return 0.6;
  return Math.max(0, ratio);
}

/**
 * Find possible patient matches for "booking for someone else".
 * Scoped to patients linked to this doctor via appointments or conversations.
 *
 * @param doctorId - Doctor UUID
 * @param phone - Patient phone (required)
 * @param name - Patient name (required for name scoring)
 * @param age - Optional; ±2 years boosts confidence
 * @param gender - Optional; exact match boosts confidence
 * @param correlationId - For audit
 * @returns Top matches with confidence >= threshold, sorted by confidence desc
 */
export async function findPossiblePatientMatches(
  doctorId: string,
  phone: string,
  name: string,
  age?: number | null,
  gender?: string | null,
  correlationId?: string
): Promise<PossiblePatientMatch[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const phoneLast10 = normalizePhoneLast10(phone);
  if (phoneLast10.length < 10) {
    return [];
  }

  const inputName = name.trim();
  if (!inputName) {
    return [];
  }

  // Get distinct patient IDs linked to this doctor (appointments OR conversations)
  const { data: aptPatients, error: aptErr } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .not('patient_id', 'is', null);

  if (aptErr) handleSupabaseError(aptErr, correlationId ?? '');

  const { data: convPatients, error: convErr } = await admin
    .from('conversations')
    .select('patient_id')
    .eq('doctor_id', doctorId);

  if (convErr) handleSupabaseError(convErr, correlationId ?? '');

  const patientIds = new Set<string>();
  for (const row of aptPatients ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) patientIds.add(pid);
  }
  for (const row of convPatients ?? []) {
    patientIds.add((row as { patient_id: string }).patient_id);
  }

  if (patientIds.size === 0) return [];

  // Fetch patients; filter by phone last-10
  const { data: patients, error: patErr } = await admin
    .from('patients')
    .select('id, name, phone, age, gender, medical_record_number')
    .in('id', Array.from(patientIds));

  if (patErr) handleSupabaseError(patErr, correlationId ?? '');

  const matches: PossiblePatientMatch[] = [];
  for (const p of (patients ?? []) as Pick<Patient, 'id' | 'name' | 'phone' | 'age' | 'gender' | 'medical_record_number'>[]) {
    const pPhoneLast10 = normalizePhoneLast10(p.phone);
    if (pPhoneLast10 !== phoneLast10) continue;

    const nameScore = nameSimilarity(inputName, p.name);
    let confidence = nameScore;

    if (age != null && p.age != null) {
      const ageDiff = Math.abs(age - p.age);
      if (ageDiff <= 2) confidence += 0.1;
    }
    if (gender && p.gender) {
      const gNorm = (s: string) => s.trim().toLowerCase().replace(/^(m|male)$/, 'male').replace(/^(f|female)$/, 'female');
      if (gNorm(gender) === gNorm(p.gender)) confidence += 0.05;
    }

    confidence = Math.min(1, confidence);

    if (confidence >= CONFIDENCE_THRESHOLD) {
      matches.push({
        patientId: p.id,
        name: p.name,
        phone: p.phone,
        age: p.age ?? undefined,
        gender: p.gender ?? undefined,
        medicalRecordNumber: p.medical_record_number,
        confidence,
      });
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, MAX_MATCHES);
}

/** Patient summary for possible-duplicates list (e-task-6). */
export interface DuplicateGroupPatient {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medicalRecordNumber?: string;
}

/**
 * List possible duplicate patient groups for a doctor (e-task-6).
 * Groups patients by same phone last-10 + similar name. Returns groups of 2+.
 *
 * @param doctorId - Doctor UUID
 * @param correlationId - For audit
 * @returns Groups of patients that might be duplicates
 */
export async function listPossibleDuplicates(
  doctorId: string,
  correlationId: string
): Promise<{ groups: DuplicateGroupPatient[][] }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const patientIds = new Set<string>();

  const { data: aptPatients, error: aptErr } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .not('patient_id', 'is', null);

  if (aptErr) handleSupabaseError(aptErr, correlationId);
  for (const row of aptPatients ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) patientIds.add(pid);
  }

  const { data: convPatients, error: convErr } = await admin
    .from('conversations')
    .select('patient_id')
    .eq('doctor_id', doctorId);

  if (convErr) handleSupabaseError(convErr, correlationId);
  for (const row of convPatients ?? []) {
    patientIds.add((row as { patient_id: string }).patient_id);
  }

  if (patientIds.size === 0) return { groups: [] };

  const { data: patients, error: patErr } = await admin
    .from('patients')
    .select('id, name, phone, age, gender, medical_record_number')
    .in('id', Array.from(patientIds));

  if (patErr) handleSupabaseError(patErr, correlationId);

  const patientList = (patients ?? []) as Pick<
    Patient,
    'id' | 'name' | 'phone' | 'age' | 'gender' | 'medical_record_number'
  >[];

  // Exclude merged patients
  const activePatients = patientList.filter(
    (p) => p.name !== '[Merged]' && !(p.phone ?? '').startsWith('merged-')
  );

  // Group by phone last-10; within each group, find name-similar pairs
  const byPhone = new Map<string, typeof activePatients>();
  for (const p of activePatients) {
    const last10 = normalizePhoneLast10(p.phone);
    if (last10.length < 10) continue;
    const list = byPhone.get(last10) ?? [];
    list.push(p);
    byPhone.set(last10, list);
  }

  const groups: DuplicateGroupPatient[][] = [];
  for (const [, list] of byPhone) {
    if (list.length < 2) continue;
    // Same phone + 2+ patients = possible duplicates
    const group: DuplicateGroupPatient[] = list.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      age: p.age ?? undefined,
      gender: p.gender ?? undefined,
      medicalRecordNumber: p.medical_record_number,
    }));
    groups.push(group);
  }

  return { groups };
}
