/**
 * Patient Service Functions
 *
 * Service functions for patient-related database operations.
 * Patients contain PHI (name, phone, date_of_birth) which is encrypted at rest.
 * Supports placeholder patients per platform user (e-task-3) via platform/platform_external_id.
 */

import { getSupabaseAdminClient, supabase } from '../config/database';
import { Patient, InsertPatient, UpdatePatient } from '../types';
import { ConflictError, ForbiddenError, InternalError, NotFoundError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification, logAuditEvent } from '../utils/audit-logger';
import type { PatientListFilters, PatientListSortId, PatientSegmentId } from './patient-list-types';

export type { PatientListFilters, PatientListSortId, PatientSegmentId } from './patient-list-types';
export {
  PATIENT_LIST_SORT_IDS,
  PATIENT_SEGMENT_IDS,
} from './patient-list-segment-sql';

/** Summary for list endpoint (e-task-3). No PHI in logs. */
export interface PatientSummary {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  last_appointment_date?: string | null;
  created_at: string;
  patient_tag?: string | null;
  /** Used for `q` search (IG handle); omitted from v1 UI. */
  platform_external_id?: string | null;
  /** pr-07 list table quick-look / risk pills */
  has_allergies?: boolean;
  open_episodes_count?: number;
  overdue_followup?: boolean;
  last_visit_modality?: string | null;
  next_appointment_date?: string | null;
  next_appointment_status?: string | null;
  next_appointment_modality?: string | null;
  platform?: string | null;
}

/** Paginated patients list (pr-02). */
export interface PatientsListPagedData {
  patients: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Find patient by ID
 *
 * @param id - Patient UUID
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientById(
  id: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Get patient by ID for authenticated doctor (API dashboard).
 * Verifies doctor has access via conversation or appointment link (RLS-aligned).
 * No PHI in logs; uses logDataAccess for audit.
 *
 * @param patientId - Patient UUID
 * @param doctorId - Doctor (auth.users) UUID
 * @param correlationId - Request correlation ID
 * @returns Patient
 * @throws ForbiddenError if doctor has no link to patient
 * @throws NotFoundError if patient not found after access check
 */
export async function getPatientForDoctor(
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<Patient> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  if (conv) {
    const patient = await findPatientByIdWithAdmin(patientId, correlationId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }
    await logDataAccess(correlationId, doctorId, 'patient', patientId);
    return patient;
  }

  const { data: apt } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle();

  if (apt) {
    const patient = await findPatientByIdWithAdmin(patientId, correlationId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }
    await logDataAccess(correlationId, doctorId, 'patient', patientId);
    return patient;
  }

  throw new ForbiddenError('Access denied: You do not have access to this patient');
}

/**
 * Find patient by ID using service role (webhook worker context).
 * Use when no user JWT is available (e.g. webhook processing).
 *
 * @param id - Patient UUID
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByIdWithAdmin(
  id: string,
  correlationId: string
): Promise<Patient | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Find patient by Medical Record Number (MRN).
 * Uses admin client (webhook/API contexts).
 *
 * @param medicalRecordNumber - Human-readable Patient ID (e.g. P-00001)
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 */
export async function findPatientByMrn(
  medicalRecordNumber: string,
  correlationId: string
): Promise<Patient | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const normalized = medicalRecordNumber.trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('medical_record_number', normalized)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * List patients for a doctor (e-task-3).
 * Returns distinct patients linked via appointments or conversations who have a
 * medical record number (registered after first successful payment path).
 * Ordered by last appointment date desc, then created_at desc.
 *
 * @param doctorId - Doctor UUID
 * @param correlationId - Request correlation ID
 * @returns PatientSummary[]
 */
function toIsoCreatedAt(createdAt: string | Date): string {
  return typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
}

function defaultSortSummaries(summaries: PatientSummary[]): PatientSummary[] {
  return [...summaries].sort((a, b) => {
    const aDate = a.last_appointment_date ? new Date(a.last_appointment_date).getTime() : 0;
    const bDate = b.last_appointment_date ? new Date(b.last_appointment_date).getTime() : 0;
    if (bDate !== aDate) return bDate - aDate;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function sortPatientSummaries(
  summaries: PatientSummary[],
  sort: PatientListSortId | undefined
): PatientSummary[] {
  const items = [...summaries];
  switch (sort) {
    case 'last-visit-asc':
      items.sort((a, b) => {
        const aT = a.last_appointment_date ? new Date(a.last_appointment_date).getTime() : Number.POSITIVE_INFINITY;
        const bT = b.last_appointment_date ? new Date(b.last_appointment_date).getTime() : Number.POSITIVE_INFINITY;
        if (aT !== bT) return aT - bT;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      break;
    case 'created-at-desc':
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
    case 'created-at-asc':
      items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'name-asc':
      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      break;
    case 'last-visit-desc':
    default:
      return defaultSortSummaries(items);
  }
  return items;
}

/** Doctor-scoped patient rows linked via this doctor's appointments or conversations (rcp-27). */
async function fetchLinkedPatientRows(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  correlationId: string
): Promise<
  Array<{
    id: string;
    name: string;
    phone: string;
    age?: number | null;
    gender?: string | null;
    medical_record_number?: string | null;
    patient_tag?: string | null;
    platform?: string | null;
    platform_external_id?: string | null;
    created_at: string | Date;
  }>
> {
  const patientIds = new Set<string>();

  const { data: aptRows, error: aptErr } = await admin
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .not('patient_id', 'is', null);

  if (aptErr) handleSupabaseError(aptErr, correlationId);
  for (const row of aptRows ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) patientIds.add(pid);
  }

  const { data: convRows, error: convErr } = await admin
    .from('conversations')
    .select('patient_id')
    .eq('doctor_id', doctorId);

  if (convErr) handleSupabaseError(convErr, correlationId);
  for (const row of convRows ?? []) {
    patientIds.add((row as { patient_id: string }).patient_id);
  }

  if (patientIds.size === 0) return [];

  const { data: patients, error: patErr } = await admin
    .from('patients')
    .select(
      'id, name, phone, age, gender, medical_record_number, patient_tag, platform, platform_external_id, created_at'
    )
    .in('id', Array.from(patientIds));

  if (patErr) handleSupabaseError(patErr, correlationId);

  return (patients ?? []) as Array<{
    id: string;
    name: string;
    phone: string;
    age?: number | null;
    gender?: string | null;
    medical_record_number?: string | null;
    patient_tag?: string | null;
    platform?: string | null;
    platform_external_id?: string | null;
    created_at: string | Date;
  }>;
}

function followUpUnitToDays(unit: string | null, value: number | null): number | null {
  if (value == null || value <= 0) return null;
  const u = (unit ?? 'days').toLowerCase();
  if (u === 'day' || u === 'days') return value;
  if (u === 'week' || u === 'weeks') return value * 7;
  if (u === 'month' || u === 'months') return value * 30;
  return value;
}

async function enrichPatientSummariesForList(
  summaries: PatientSummary[],
  doctorId: string,
  correlationId: string
): Promise<PatientSummary[]> {
  if (summaries.length === 0) return summaries;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const ids = summaries.map((p) => p.id);
  const withAllergies = await getPatientIdsWithAllergies(admin, doctorId, correlationId);

  const { data: episodeRows, error: episodeErr } = await admin
    .from('patient_problem_list_v')
    .select('patient_id, episode_status')
    .eq('doctor_id', doctorId)
    .eq('source', 'episode')
    .in('patient_id', ids);
  if (episodeErr) handleSupabaseError(episodeErr, correlationId);

  const openEpisodeCount = new Map<string, number>();
  for (const row of episodeRows ?? []) {
    const r = row as { patient_id: string; episode_status: string | null };
    if (r.episode_status === 'closed') continue;
    openEpisodeCount.set(r.patient_id, (openEpisodeCount.get(r.patient_id) ?? 0) + 1);
  }

  const now = Date.now();
  const { data: aptRows, error: aptErr } = await admin
    .from('appointments')
    .select('patient_id, appointment_date, consultation_type, status')
    .eq('doctor_id', doctorId)
    .in('patient_id', ids)
    .order('appointment_date', { ascending: false });
  if (aptErr) handleSupabaseError(aptErr, correlationId);

  const lastVisitByPatient = new Map<
    string,
    { date: string; modality: string | null }
  >();
  const nextVisitByPatient = new Map<
    string,
    { date: string; status: string; modality: string | null }
  >();

  for (const row of aptRows ?? []) {
    const r = row as {
      patient_id: string;
      appointment_date: string;
      consultation_type: string | null;
      status: string;
    };
    const ts = new Date(r.appointment_date).getTime();
    if (ts <= now) {
      const existing = lastVisitByPatient.get(r.patient_id);
      if (!existing || ts > new Date(existing.date).getTime()) {
        lastVisitByPatient.set(r.patient_id, {
          date: r.appointment_date,
          modality: r.consultation_type,
        });
      }
    } else if (['scheduled', 'confirmed', 'tentative'].includes(r.status)) {
      const existing = nextVisitByPatient.get(r.patient_id);
      if (!existing || ts < new Date(existing.date).getTime()) {
        nextVisitByPatient.set(r.patient_id, {
          date: r.appointment_date,
          status: r.status,
          modality: r.consultation_type,
        });
      }
    }
  }

  const { data: rxRows, error: rxErr } = await admin
    .from('prescriptions')
    .select('patient_id, created_at, follow_up_value, follow_up_unit')
    .eq('doctor_id', doctorId)
    .in('patient_id', ids)
    .not('follow_up_value', 'is', null);
  if (rxErr) handleSupabaseError(rxErr, correlationId);

  const followupOverduePatients = new Set<string>();
  for (const row of rxRows ?? []) {
    const r = row as {
      patient_id: string | null;
      created_at: string;
      follow_up_value: number | null;
      follow_up_unit: string | null;
    };
    if (!r.patient_id) continue;
    const days = followUpUnitToDays(r.follow_up_unit, r.follow_up_value);
    if (days == null || days <= 0) continue;
    const prescribedAt = new Date(r.created_at);
    if (Number.isNaN(prescribedAt.getTime())) continue;
    const followUpDate = new Date(prescribedAt.getTime() + days * 24 * 60 * 60 * 1000);
    if (followUpDate.getTime() >= now) continue;
    let hasLater = false;
    for (const apt of aptRows ?? []) {
      const a = apt as { patient_id: string; appointment_date: string };
      if (a.patient_id !== r.patient_id) continue;
      if (new Date(a.appointment_date).getTime() >= followUpDate.getTime()) {
        hasLater = true;
        break;
      }
    }
    if (!hasLater) followupOverduePatients.add(r.patient_id);
  }

  return summaries.map((p) => {
    const last = lastVisitByPatient.get(p.id);
    const next = nextVisitByPatient.get(p.id);
    return {
      ...p,
      has_allergies: withAllergies.has(p.id),
      open_episodes_count: openEpisodeCount.get(p.id) ?? 0,
      overdue_followup: followupOverduePatients.has(p.id),
      last_visit_modality: last?.modality ?? p.last_visit_modality ?? null,
      last_appointment_date: last?.date ?? p.last_appointment_date ?? null,
      next_appointment_date: next?.date ?? null,
      next_appointment_status: next?.status ?? null,
      next_appointment_modality: next?.modality ?? null,
    };
  });
}

async function buildPatientSummariesForDoctor(
  doctorId: string,
  correlationId: string
): Promise<PatientSummary[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const patientRows = await fetchLinkedPatientRows(admin, doctorId, correlationId);
  if (patientRows.length === 0) return [];

  const ids = patientRows.map((p) => p.id);
  const { data: lastAptRows, error: lastErr } = await admin
    .from('appointments')
    .select('patient_id, appointment_date')
    .eq('doctor_id', doctorId)
    .in('patient_id', ids)
    .order('appointment_date', { ascending: false });

  if (lastErr) handleSupabaseError(lastErr, correlationId);

  const lastByPatient = new Map<string, string>();
  for (const row of lastAptRows ?? []) {
    const r = row as { patient_id: string; appointment_date: string };
    if (!lastByPatient.has(r.patient_id)) {
      lastByPatient.set(r.patient_id, r.appointment_date);
    }
  }

  const activePatients = patientRows.filter(
    (p) => p.name !== '[Merged]' && !(p.phone ?? '').startsWith('merged-')
  );

  const registeredPatients = activePatients.filter(
    (p) => p.medical_record_number != null && String(p.medical_record_number).trim() !== ''
  );

  const summaries: PatientSummary[] = registeredPatients.map((patient) => ({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    age: patient.age ?? undefined,
    gender: patient.gender ?? undefined,
    medical_record_number: patient.medical_record_number,
    patient_tag: patient.patient_tag ?? null,
    platform: patient.platform ?? null,
    platform_external_id: patient.platform_external_id ?? null,
    last_appointment_date: lastByPatient.get(patient.id) ?? null,
    created_at: toIsoCreatedAt(patient.created_at),
  }));

  return defaultSortSummaries(summaries);
}

async function getNoShowPronePatientIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  candidateIds: string[],
  correlationId: string
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('appointments')
    .select('patient_id, status, appointment_date')
    .eq('doctor_id', doctorId)
    .in('patient_id', candidateIds)
    .order('appointment_date', { ascending: false });

  if (error) handleSupabaseError(error, correlationId);

  const byPatient = new Map<string, string[]>();
  for (const row of data ?? []) {
    const r = row as { patient_id: string; status: string };
    const statuses = byPatient.get(r.patient_id) ?? [];
    if (statuses.length < 4) statuses.push(r.status);
    byPatient.set(r.patient_id, statuses);
  }

  const prone = new Set<string>();
  for (const [patientId, statuses] of byPatient) {
    const noShowCount = statuses.filter((s) => s === 'no_show').length;
    if (noShowCount >= 2) prone.add(patientId);
  }
  return prone;
}

async function getPatientIdsWithAllergies(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  correlationId: string
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('patient_allergies')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .is('archived_at', null);

  if (error) handleSupabaseError(error, correlationId);
  return new Set((data ?? []).map((r) => (r as { patient_id: string }).patient_id));
}

async function getPatientIdsWithOpenEpisodes(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  correlationId: string
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('patient_problem_list_v')
    .select('patient_id, episode_status')
    .eq('doctor_id', doctorId)
    .eq('source', 'episode');

  if (error) handleSupabaseError(error, correlationId);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { patient_id: string; episode_status: string | null };
    if (r.episode_status !== 'closed') ids.add(r.patient_id);
  }
  return ids;
}

async function applySegmentFilter(
  summaries: PatientSummary[],
  segment: PatientSegmentId,
  doctorId: string,
  correlationId: string
): Promise<PatientSummary[]> {
  const now = Date.now();
  const ms90d = 90 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  switch (segment) {
    case 'active-90d':
      return summaries.filter((p) => {
        if (!p.last_appointment_date) return false;
        return now - new Date(p.last_appointment_date).getTime() <= ms90d;
      });
    case 'new-30d':
      return summaries.filter((p) => now - new Date(p.created_at).getTime() <= ms30d);
    case 'untagged':
      return summaries.filter((p) => !p.patient_tag || p.patient_tag.trim() === '');
    case 'no-show-prone':
    case 'has-allergies':
    case 'has-open-episodes': {
      const admin = getSupabaseAdminClient();
      if (!admin) throw new InternalError('Service role client not available');
      const ids = summaries.map((p) => p.id);
      if (segment === 'no-show-prone') {
        const prone = await getNoShowPronePatientIds(admin, doctorId, ids, correlationId);
        return summaries.filter((p) => prone.has(p.id));
      }
      if (segment === 'has-allergies') {
        const withAllergies = await getPatientIdsWithAllergies(admin, doctorId, correlationId);
        return summaries.filter((p) => withAllergies.has(p.id));
      }
      const withEpisodes = await getPatientIdsWithOpenEpisodes(admin, doctorId, correlationId);
      return summaries.filter((p) => withEpisodes.has(p.id));
    }
    case 'at-risk-followup':
      return summaries;
    default: {
      const _exhaustive: never = segment;
      return _exhaustive;
    }
  }
}

/**
 * List patients for a doctor (e-task-3).
 * Returns distinct patients linked via appointments or conversations who have a
 * medical record number (registered after first successful payment path).
 * Ordered by last appointment date desc, then created_at desc.
 */
export async function listPatientsForDoctor(
  doctorId: string,
  correlationId: string
): Promise<PatientSummary[]> {
  const summaries = await buildPatientSummariesForDoctor(doctorId, correlationId);
  if (summaries.length > 0) {
    await logDataAccess(correlationId, doctorId, 'patient', undefined);
  }
  return summaries;
}

/**
 * Filtered, sorted, paginated patients list (pr-02 / DL-4).
 * Segment predicates mirror `patient-list-segment-sql.ts` ({@link sortOrderByClause}).
 */
export async function listPatientsForDoctorFiltered(
  doctorId: string,
  filters: PatientListFilters,
  correlationId: string
): Promise<PatientsListPagedData> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;

  let summaries = await buildPatientSummariesForDoctor(doctorId, correlationId);

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const qRaw = filters.q;
    summaries = summaries.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(needle);
      const phoneMatch = p.phone.includes(qRaw);
      const mrnMatch = (p.medical_record_number ?? '').toLowerCase().includes(needle);
      const handleMatch = (p.platform_external_id ?? '').toLowerCase().includes(needle);
      return nameMatch || phoneMatch || mrnMatch || handleMatch;
    });
  }

  if (filters.segment) {
    summaries = await applySegmentFilter(summaries, filters.segment, doctorId, correlationId);
  }

  summaries = sortPatientSummaries(summaries, filters.sort);
  summaries = await enrichPatientSummariesForList(summaries, doctorId, correlationId);

  const total = summaries.length;

  const offset = (page - 1) * pageSize;
  const patients = summaries.slice(offset, offset + pageSize);

  await logDataAccess(correlationId, doctorId, 'patient', undefined);

  return { patients, total, page, pageSize };
}

/**
 * Find patient by phone number
 * 
 * Used to look up existing patients before creating new ones.
 * Phone numbers are unique identifiers for patients.
 * 
 * @param phone - Patient phone number
 * @param correlationId - Request correlation ID
 * @returns Patient or null if not found
 * 
 * @throws InternalError if database operation fails
 */
export async function findPatientByPhone(
  phone: string,
  correlationId: string
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error) {
    // Not found is OK (return null)
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Create a new patient
 * 
 * Creates patient record. Used when processing webhooks from platforms.
 * 
 * @param data - Patient data to insert
 * @param correlationId - Request correlation ID
 * @returns Created patient
 * 
 * @throws ConflictError if patient with phone number already exists
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function createPatient(
  data: InsertPatient,
  correlationId: string
): Promise<Patient> {
  // Check if patient already exists
  const existing = await findPatientByPhone(data.phone, correlationId);
  if (existing) {
    throw new ConflictError('Patient with this phone number already exists');
  }

  // Create patient (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(data)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation (webhook processing)
    'create',
    'patient',
    patient.id
  );

  return patient as Patient;
}

/**
 * Create a patient for "booking for someone else" flow (e-task-1 2026-03-18).
 * Creates a standalone patient with collected details; no platform link.
 * Used when user books for mother, father, etc. — consent implied by chat.
 *
 * @param doctorId - Doctor ID (for audit context; patients table has no doctor_id)
 * @param data - Collected patient data (name, phone required; age, gender, email optional)
 * @param correlationId - Request correlation ID
 * @returns Created patient
 */
export async function createPatientForBooking(
  _doctorId: string,
  data: { name: string; phone: string; age?: number; gender?: string; email?: string },
  correlationId: string
): Promise<Patient> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const now = new Date();
  const insertData: InsertPatient = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    age: data.age ?? undefined,
    gender: data.gender?.trim() || undefined,
    email: data.email?.trim() || undefined,
    platform: null,
    platform_external_id: null,
    consent_status: 'granted',
    consent_granted_at: now,
    consent_method: 'instagram_dm_booking_for_other',
  };

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(insertData)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'patient',
    patient.id
  );

  return patient as Patient;
}

/**
 * Update patient information
 * 
 * Updates patient record. Used when patient information changes.
 * 
 * @param id - Patient ID
 * @param data - Update data
 * @param correlationId - Request correlation ID
 * @returns Updated patient
 * 
 * @throws NotFoundError if patient not found
 * @throws InternalError if database operation fails
 * 
 * Note: Uses service role client (webhook processing has no user context)
 */
export async function updatePatient(
  id: string,
  data: UpdatePatient,
  correlationId: string
): Promise<Patient> {
  // Update patient (service role - webhook processing)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data: updated, error } = await supabaseAdmin
    .from('patients')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Get changed fields (field names only, not values)
  const changedFields = Object.keys(data as Record<string, unknown>).filter(
    (key) => key !== 'id'
  );

  // Audit log (system operation - no user)
  await logDataModification(
    correlationId,
    undefined as any, // System operation
    'update',
    'patient',
    id,
    changedFields
  );

  return updated as Patient;
}

/**
 * Merge source patient into target patient (e-task-6).
 * Moves all appointments and conversations from source to target, then anonymizes source.
 * Doctor must have access to both patients (via appointments or conversations).
 *
 * @param doctorId - Doctor UUID (must have access to both patients)
 * @param sourcePatientId - Patient to merge (will be anonymized)
 * @param targetPatientId - Patient to keep (receives all data)
 * @param correlationId - Request correlation ID
 * @throws ForbiddenError if doctor has no access to either patient
 * @throws NotFoundError if either patient not found
 */
/**
 * Bulk-set `patient_tag` for patients linked to the doctor (pr-07 / DL-11).
 */
export async function bulkTagPatientsForDoctor(
  doctorId: string,
  patientIds: string[],
  tag: string | null,
  correlationId: string
): Promise<{ updated: number }> {
  if (patientIds.length === 0) return { updated: 0 };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const linked = await fetchLinkedPatientRows(admin, doctorId, correlationId);
  const allowed = new Set(linked.map((p) => p.id));
  for (const id of patientIds) {
    if (!allowed.has(id)) {
      throw new ForbiddenError('Access denied to one or more patients');
    }
  }

  const normalizedTag = tag?.trim() ? tag.trim() : null;
  const { error } = await admin
    .from('patients')
    .update({ patient_tag: normalizedTag })
    .in('id', patientIds);

  if (error) handleSupabaseError(error, correlationId);

  await logDataModification(
    correlationId,
    doctorId,
    'update',
    'patient',
    `bulk-tag:${patientIds.length}`,
    ['patient_tag']
  );

  return { updated: patientIds.length };
}

export async function mergePatients(
  doctorId: string,
  sourcePatientId: string,
  targetPatientId: string,
  correlationId: string
): Promise<void> {
  if (sourcePatientId === targetPatientId) {
    throw new ForbiddenError('Source and target patient must be different');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // rcp-28: merge is doctor-scoped — both rows must be linked to this doctor;
  // appointments/conversations move only within doctor_id; source identity cols cleared.
  await getPatientForDoctor(sourcePatientId, doctorId, correlationId);
  await getPatientForDoctor(targetPatientId, doctorId, correlationId);

  // Update appointments: move from source to target
  const { error: aptErr } = await admin
    .from('appointments')
    .update({ patient_id: targetPatientId })
    .eq('doctor_id', doctorId)
    .eq('patient_id', sourcePatientId);

  if (aptErr) handleSupabaseError(aptErr, correlationId);

  // Update conversations: move from source to target
  const { error: convErr } = await admin
    .from('conversations')
    .update({ patient_id: targetPatientId })
    .eq('doctor_id', doctorId)
    .eq('patient_id', sourcePatientId);

  if (convErr) handleSupabaseError(convErr, correlationId);

  // Anonymize source patient (COMPLIANCE: don't hard-delete PHI)
  const { error: anonErr } = await admin
    .from('patients')
    .update({
      name: '[Merged]',
      phone: `merged-${sourcePatientId}`,
      email: null,
      date_of_birth: null,
      age: null,
      gender: null,
      platform: null,
      platform_external_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourcePatientId);

  if (anonErr) handleSupabaseError(anonErr, correlationId);

  await logDataModification(correlationId, doctorId, 'update', 'patient', sourcePatientId, [
    'merge_anonymize',
  ]);
  await logAuditEvent({
    correlationId,
    userId: doctorId,
    action: 'merge_patients',
    resourceType: 'patient',
    resourceId: targetPatientId,
    status: 'success',
    metadata: { sourcePatientId, targetPatientId },
  });
}

/**
 * Assign MRN to a patient after their first successful payment (migration 046).
 * No-op if patient already has an MRN (returning patient).
 * Uses raw SQL nextval('patient_mrn_seq') to guarantee unique sequential IDs.
 *
 * @returns The MRN (newly assigned or pre-existing), or null if patient not found.
 */
export async function assignMrnAfterPayment(
  patientId: string,
  correlationId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: patient, error: fetchErr } = await admin
    .from('patients')
    .select('id, medical_record_number')
    .eq('id', patientId)
    .single();

  if (fetchErr || !patient) return null;

  if (patient.medical_record_number) return patient.medical_record_number;

  const { data: seqRow, error: seqErr } = await admin.rpc('assign_patient_mrn', {
    p_patient_id: patientId,
  });

  if (seqErr) {
    handleSupabaseError(seqErr, correlationId);
  }

  const mrn: string | null = typeof seqRow === 'string' ? seqRow : (seqRow as any)?.mrn ?? null;

  if (mrn) {
    await logDataModification(correlationId, undefined as any, 'update', 'patient', patientId, [
      'medical_record_number',
    ]);
  }

  return mrn;
}

/**
 * Idempotent registration: assign MRN when missing (same RPC as `assignMrnAfterPayment`).
 * Call after booking completes without payment (zero-fee catalog, free-of-cost, queue with no charge)
 * or keep using `assignMrnAfterPayment` from the payment webhook for paid flows.
 */
export async function ensurePatientMrnIfEligible(
  patientId: string,
  correlationId: string
): Promise<string | null> {
  return assignMrnAfterPayment(patientId, correlationId);
}

/**
 * Doctor-scoped channel sender lookup (rcp-27).
 * Prefer resolvePatientForChannelSender for engine resolution; use this for
 * direct per-doctor reads outside the compat/backfill path.
 */
export async function findPatientByChannelSender(
  doctorId: string,
  channel: string,
  senderId: string,
  correlationId: string
): Promise<Patient | null> {
  return findPatientByDoctorPlatformExternalId(doctorId, channel, senderId, correlationId);
}

/**
 * Find per-doctor patient by platform sender identity (rcp-26).
 * Uses admin client to bypass RLS (webhook has no auth context).
 */
export async function findPatientByDoctorPlatformExternalId(
  doctorId: string,
  platform: string,
  platformExternalId: string,
  correlationId: string
): Promise<Patient | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('platform', platform)
    .eq('platform_external_id', platformExternalId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    handleSupabaseError(error, correlationId);
  }

  return data as Patient | null;
}

/**
 * Find or create a per-doctor placeholder patient for a platform user (rcp-26).
 * Keys on (doctorId, platform, platformExternalId); sets doctor_id on insert.
 * Legacy global lookup is handled by resolvePatientForChannelSender compat only.
 *
 * @param doctorId - Doctor ID (stored on patient row)
 * @param platform - Platform name (e.g. 'instagram')
 * @param platformExternalId - Platform user ID (e.g. Instagram PSID)
 * @param correlationId - Request correlation ID
 * @returns Existing or newly created per-doctor patient
 */
export async function findOrCreatePlaceholderPatient(
  doctorId: string,
  platform: string,
  platformExternalId: string,
  correlationId: string
): Promise<Patient> {
  const existing = await findPatientByDoctorPlatformExternalId(
    doctorId,
    platform,
    platformExternalId,
    correlationId
  );
  if (existing) {
    return existing;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const placeholderPhone = `placeholder-${platform}-${platformExternalId}`;
  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert({
      name: 'Placeholder',
      phone: placeholderPhone,
      platform,
      platform_external_id: platformExternalId,
      doctor_id: doctorId,
    } as InsertPatient)
    .select()
    .single();

  if (error) {
    const isUniqueViolation =
      error?.code === '23505' ||
      (typeof error?.message === 'string' &&
        /duplicate|unique|already exists/i.test(error.message));
    if (isUniqueViolation) {
      const delays = [200, 400, 800];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        const existingPatient = await findPatientByDoctorPlatformExternalId(
          doctorId,
          platform,
          platformExternalId,
          correlationId
        );
        if (existingPatient) return existingPatient;
        if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
    handleSupabaseError(error, correlationId);
  }

  if (!patient) throw new InternalError('Patient create returned no data');

  await logDataModification(
    correlationId,
    undefined as any,
    'create',
    'patient',
    patient.id
  );

  return patient as Patient;
}
