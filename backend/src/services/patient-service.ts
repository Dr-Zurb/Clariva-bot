/**
 * Patient Service Functions
 *
 * Service functions for patient-related database operations.
 * Patients contain PHI (name, phone, date_of_birth) which is encrypted at rest.
 * Supports placeholder patients per platform user (e-task-3) via platform/platform_external_id.
 */

import { getSupabaseAdminClient, supabase } from '../config/database';
import { logger } from '../config/logger';
import { Patient, InsertPatient, UpdatePatient } from '../types';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification, logAuditEvent } from '../utils/audit-logger';
import { findPossiblePatientMatches, type PossiblePatientMatch } from './patient-matching-service';
import {
  ageYearsFromIsoDate,
  calendarYmd,
  subtractCalendarDays,
  subtractCalendarMonths,
} from '../utils/validation';
import type { PatientListFilters, PatientListSortId, PatientSegmentId } from './patient-list-types';
import {
  hasPatientIdentityFilter,
  matchesPatientIdentityFilter,
} from '../utils/patient-identity-filter';
import {
  INCOMPLETE_CONSULT_LOOKBACK_DAYS,
  consultationSessionStarted,
  isIncompleteConsult,
} from '../utils/incomplete-consult';
import { classifyVisitSegment } from '../utils/visit-segment';
import { comparePatientSearchHits, isNameSearchQuery } from '../utils/patient-search-rank';
import {
  applyTagOp,
  coercePatientTags,
  legacyPatientTagFromTags,
  patientHasTag,
  type PatientTagOp,
} from '../utils/patient-tags';

export type { PatientListFilters, PatientListSortId, PatientSegmentId } from './patient-list-types';
export { PATIENT_LIST_SORT_IDS, PATIENT_SEGMENT_IDS } from './patient-list-segment-sql';

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
  /** Multi-tag labels (migration 191). */
  patient_tags?: string[];
  /** Legacy single label — mirrors patient_tags[0]. */
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
  guardian_name?: string | null;
  guardian_relation?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  date_of_birth?: string | Date | null;
  /** Desk hide stamp (migration 209). Not PHI. */
  archived_at?: string | Date | null;
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
export async function findPatientById(id: string, correlationId: string): Promise<Patient | null> {
  const { data, error } = await supabase.from('patients').select('*').eq('id', id).single();

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
function logPatientRead(
  correlationId: string,
  doctorId: string,
  patientId: string | undefined,
  actorId?: string
): Promise<void> {
  const userId = actorId ?? doctorId;
  if (actorId && actorId !== doctorId) {
    return logDataAccess(correlationId, userId, 'patient', patientId, doctorId);
  }
  return logDataAccess(correlationId, userId, 'patient', patientId);
}

export async function getPatientForDoctor(
  patientId: string,
  doctorId: string,
  correlationId: string,
  actorId?: string
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
    await logPatientRead(correlationId, doctorId, patientId, actorId);
    return withCreatedByLabel(patient, doctorId, correlationId);
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
    await logPatientRead(correlationId, doctorId, patientId, actorId);
    return withCreatedByLabel(patient, doctorId, correlationId);
  }

  const { data: owned } = await admin
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (owned) {
    const patient = await findPatientByIdWithAdmin(patientId, correlationId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }
    await logPatientRead(correlationId, doctorId, patientId, actorId);
    return withCreatedByLabel(patient, doctorId, correlationId);
  }

  throw new ForbiddenError('Access denied: You do not have access to this patient');
}

/** Desk create: one ownership read — no conversation / appointment / label lookup. */
export async function getDeskPatientForBooking(
  patientId: string,
  doctorId: string,
  correlationId: string,
  actorId?: string
): Promise<{ name: string; phone: string; medical_record_number: string | null }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('patients')
    .select('name, phone, medical_record_number')
    .eq('id', patientId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data) {
    throw new ForbiddenError('Access denied: You do not have access to this patient');
  }

  void logPatientRead(correlationId, doctorId, patientId, actorId);
  const row = data as { name: string; phone: string; medical_record_number: string | null };
  return {
    name: row.name,
    phone: row.phone,
    medical_record_number: row.medical_record_number ?? null,
  };
}

/** Resolve created_by to a display label. Never log the label (personal data). */
async function withCreatedByLabel(
  patient: Patient,
  doctorId: string,
  correlationId: string
): Promise<Patient> {
  const createdBy = patient.created_by ?? null;
  if (!createdBy) {
    return { ...patient, created_by_label: null };
  }
  if (createdBy === doctorId) {
    return { ...patient, created_by_label: 'Doctor' };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ...patient, created_by_label: 'Receptionist' };
  }

  const { data, error } = await admin
    .from('clinic_staff')
    .select('display_name')
    .eq('staff_user_id', createdBy)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const raw =
    data && typeof (data as { display_name?: unknown }).display_name === 'string'
      ? (data as { display_name: string }).display_name.trim()
      : '';
  return { ...patient, created_by_label: raw || 'Receptionist' };
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

  const { data, error } = await supabaseAdmin.from('patients').select('*').eq('id', id).single();

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
        const aT = a.last_appointment_date
          ? new Date(a.last_appointment_date).getTime()
          : Number.POSITIVE_INFINITY;
        const bT = b.last_appointment_date
          ? new Date(b.last_appointment_date).getTime()
          : Number.POSITIVE_INFINITY;
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

/** PostgREST default max rows per request. */
const SUPABASE_PAGE = 1000;
/** Stay under PostgREST URL limits for `.in()` (a few thousand UUIDs → 400). */
const IN_FILTER_CHUNK = 100;

const PATIENT_IDENTITY_SELECT =
  'id, name, phone, age, date_of_birth, gender, medical_record_number, patient_tag, patient_tags, platform, platform_external_id, guardian_name, guardian_relation, alt_phone, address, archived_at, created_at';
const PATIENT_PRE_ARCHIVE_SELECT =
  'id, name, phone, age, date_of_birth, gender, medical_record_number, patient_tag, patient_tags, platform, platform_external_id, guardian_name, guardian_relation, alt_phone, address, created_at';
const PATIENT_LEGACY_SELECT =
  'id, name, phone, age, date_of_birth, gender, medical_record_number, patient_tag, patient_tags, platform, platform_external_id, created_at';

type LinkedPatientRow = {
  id: string;
  name: string;
  phone: string;
  age?: number | null;
  gender?: string | null;
  medical_record_number?: string | null;
  patient_tag?: string | null;
  patient_tags?: string[] | null;
  platform?: string | null;
  platform_external_id?: string | null;
  guardian_name?: string | null;
  guardian_relation?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  date_of_birth?: string | Date | null;
  archived_at?: string | Date | null;
  created_at: string | Date;
};

type QueryPage<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }>;

async function fetchAllPages<T>(
  runPage: (from: number, to: number) => QueryPage<T>,
  correlationId: string
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE) {
    const { data, error } = await runPage(from, from + SUPABASE_PAGE - 1);
    if (error) handleSupabaseError(error, correlationId);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SUPABASE_PAGE) break;
  }
  return out;
}

function idChunks(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK) {
    out.push(ids.slice(i, i + IN_FILTER_CHUNK));
  }
  return out;
}

async function fetchPatientsByIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ids: string[],
  correlationId: string
): Promise<LinkedPatientRow[]> {
  if (ids.length === 0) return [];
  const rows: LinkedPatientRow[] = [];
  for (const chunk of idChunks(ids)) {
    let { data, error } = await admin.from('patients').select(PATIENT_IDENTITY_SELECT).in('id', chunk);
    if (error && /archived_at/i.test(error.message ?? '')) {
      const retry = await admin.from('patients').select(PATIENT_PRE_ARCHIVE_SELECT).in('id', chunk);
      data = retry.data as typeof data;
      error = retry.error;
    }
    if (error && /guardian_name|alt_phone|address/i.test(error.message ?? '')) {
      const retry = await admin.from('patients').select(PATIENT_LEGACY_SELECT).in('id', chunk);
      data = retry.data as typeof data;
      error = retry.error;
    }
    if (error) handleSupabaseError(error, correlationId);
    rows.push(...((data ?? []) as LinkedPatientRow[]));
  }
  return rows;
}

/** Doctor-scoped patient rows linked via this doctor's appointments or conversations (rcp-27). */
async function fetchLinkedPatientRows(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  correlationId: string
): Promise<LinkedPatientRow[]> {
  const patientIds = new Set<string>();

  const [aptRows, convRows, ownedRows] = await Promise.all([
    fetchAllPages<{ patient_id: string | null }>(
      (from, to) =>
        admin
          .from('appointments')
          .select('patient_id')
          .eq('doctor_id', doctorId)
          .not('patient_id', 'is', null)
          .range(from, to),
      correlationId
    ),
    fetchAllPages<{ patient_id: string }>(
      (from, to) =>
        admin.from('conversations').select('patient_id').eq('doctor_id', doctorId).range(from, to),
      correlationId
    ),
    fetchAllPages<{ id: string }>(
      (from, to) => admin.from('patients').select('id').eq('doctor_id', doctorId).range(from, to),
      correlationId
    ),
  ]);

  for (const row of aptRows) {
    if (row.patient_id) patientIds.add(row.patient_id);
  }
  for (const row of convRows) {
    patientIds.add(row.patient_id);
  }
  for (const row of ownedRows) {
    patientIds.add(row.id);
  }

  if (patientIds.size === 0) return [];
  return fetchPatientsByIds(admin, Array.from(patientIds), correlationId);
}

const OPEN_NEXT_STATUSES = new Set(['scheduled', 'confirmed', 'tentative']);

function collectVisitBounds(
  rows: Array<{
    patient_id: string;
    appointment_date: string;
    consultation_type?: string | null;
    status?: string | null;
  }>
): {
  lastByPatient: Map<string, { date: string; modality: string | null }>;
  nextByPatient: Map<string, { date: string; status: string; modality: string | null }>;
} {
  const now = Date.now();
  const lastByPatient = new Map<string, { date: string; modality: string | null }>();
  const nextByPatient = new Map<string, { date: string; status: string; modality: string | null }>();

  for (const r of rows) {
    const ts = new Date(r.appointment_date).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts <= now) {
      const existing = lastByPatient.get(r.patient_id);
      if (!existing || ts > new Date(existing.date).getTime()) {
        lastByPatient.set(r.patient_id, {
          date: r.appointment_date,
          modality: r.consultation_type ?? null,
        });
      }
    } else if (OPEN_NEXT_STATUSES.has(r.status ?? '')) {
      const existing = nextByPatient.get(r.patient_id);
      if (!existing || ts < new Date(existing.date).getTime()) {
        nextByPatient.set(r.patient_id, {
          date: r.appointment_date,
          status: r.status ?? '',
          modality: r.consultation_type ?? null,
        });
      }
    }
  }

  return { lastByPatient, nextByPatient };
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
  const withAllergies = await getPatientIdsWithAllergies(admin, doctorId, correlationId, ids);

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

  const { lastByPatient: lastVisitByPatient, nextByPatient: nextVisitByPatient } = collectVisitBounds(
    (aptRows ?? []) as Array<{
      patient_id: string;
      appointment_date: string;
      consultation_type?: string | null;
      status?: string | null;
    }>
  );

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
  correlationId: string,
  options?: { includeArchived?: boolean }
): Promise<PatientSummary[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const patientRows = await fetchLinkedPatientRows(admin, doctorId, correlationId);
  if (patientRows.length === 0) return [];

  const ids = patientRows.map((p) => p.id);
  const lastAptRows: Array<{
    patient_id: string;
    appointment_date: string;
    consultation_type?: string | null;
    status?: string | null;
  }> = [];
  for (const chunk of idChunks(ids)) {
    const { data, error: lastErr } = await admin
      .from('appointments')
      .select('patient_id, appointment_date, consultation_type, status')
      .eq('doctor_id', doctorId)
      .in('patient_id', chunk)
      .order('appointment_date', { ascending: false });
    if (lastErr) handleSupabaseError(lastErr, correlationId);
    lastAptRows.push(
      ...((data ?? []) as Array<{
        patient_id: string;
        appointment_date: string;
        consultation_type?: string | null;
        status?: string | null;
      }>)
    );
  }

  const { lastByPatient, nextByPatient } = collectVisitBounds(lastAptRows);

  const includeArchived = options?.includeArchived === true;
  const activePatients = patientRows.filter((p) => {
    if (p.name === '[Merged]' || (p.phone ?? '').startsWith('merged-')) return false;
    if (!includeArchived && p.archived_at) return false;
    return true;
  });

  const registeredPatients = activePatients.filter(
    (p) => p.medical_record_number != null && String(p.medical_record_number).trim() !== ''
  );

  const summaries: PatientSummary[] = registeredPatients.map((patient) => {
    const tags = coercePatientTags(patient.patient_tags, patient.patient_tag);
    return {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      age: patient.age ?? undefined,
      gender: patient.gender ?? undefined,
      medical_record_number: patient.medical_record_number,
      patient_tags: tags,
      patient_tag: legacyPatientTagFromTags(tags),
      platform: patient.platform ?? null,
      platform_external_id: patient.platform_external_id ?? null,
      last_appointment_date: lastByPatient.get(patient.id)?.date ?? null,
      last_visit_modality: lastByPatient.get(patient.id)?.modality ?? null,
      next_appointment_date: nextByPatient.get(patient.id)?.date ?? null,
      next_appointment_status: nextByPatient.get(patient.id)?.status ?? null,
      next_appointment_modality: nextByPatient.get(patient.id)?.modality ?? null,
      created_at: toIsoCreatedAt(patient.created_at),
      guardian_name: patient.guardian_name ?? null,
      guardian_relation: patient.guardian_relation ?? null,
      alt_phone: patient.alt_phone ?? null,
      address: patient.address ?? null,
      date_of_birth: patient.date_of_birth ?? null,
      archived_at: patient.archived_at ?? null,
    };
  });

  return defaultSortSummaries(summaries);
}

async function getIncompleteConsultPatientIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  candidateIds: string[],
  correlationId: string
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const candidateSet = new Set(candidateIds);
  const lookbackIso = new Date(
    Date.now() - INCOMPLETE_CONSULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: sessions, error: sessErr } = await admin
    .from('consultation_sessions')
    .select(
      'patient_id, appointment_id, status, actual_started_at, doctor_joined_at, patient_joined_at, scheduled_start_at'
    )
    .eq('doctor_id', doctorId)
    .gte('scheduled_start_at', lookbackIso)
    .not('patient_id', 'is', null);

  if (sessErr) handleSupabaseError(sessErr, correlationId);

  type SessRow = {
    patient_id: string;
    appointment_id: string;
    status: string;
    actual_started_at: string | null;
    doctor_joined_at: string | null;
    patient_joined_at: string | null;
  };
  const startedRows = ((sessions ?? []) as SessRow[]).filter((s) => consultationSessionStarted(s));
  const startedAptIds = [...new Set(startedRows.map((s) => s.appointment_id))];
  if (startedAptIds.length === 0) return new Set();

  const { data: apts, error: aptErr } = await admin
    .from('appointments')
    .select('id, status')
    .in('id', startedAptIds);

  if (aptErr) handleSupabaseError(aptErr, correlationId);

  const statusByApt = new Map(
    (apts ?? []).map((a) => {
      const row = a as { id: string; status: string };
      return [row.id, row.status] as const;
    })
  );

  const out = new Set<string>();
  for (const s of startedRows) {
    if (!candidateSet.has(s.patient_id)) continue;
    const aptStatus = statusByApt.get(s.appointment_id);
    if (aptStatus == null) continue;
    if (isIncompleteConsult({ session: s, appointmentStatus: aptStatus })) {
      out.add(s.patient_id);
    }
  }
  return out;
}

async function getVisitSegmentPatientIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  candidateIds: string[],
  kind: 'new-30d' | 'revisit-30d',
  correlationId: string
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('appointments')
    .select('patient_id, appointment_date, status')
    .eq('doctor_id', doctorId)
    .eq('status', 'completed')
    .in('patient_id', candidateIds);

  if (error) handleSupabaseError(error, correlationId);

  const byPatient = new Map<string, number[]>();
  for (const row of data ?? []) {
    const r = row as { patient_id: string; appointment_date: string };
    const ts = new Date(r.appointment_date).getTime();
    if (Number.isNaN(ts)) continue;
    const list = byPatient.get(r.patient_id) ?? [];
    list.push(ts);
    byPatient.set(r.patient_id, list);
  }

  const now = Date.now();
  const out = new Set<string>();
  for (const [patientId, times] of byPatient) {
    if (classifyVisitSegment(times, now) === kind) out.add(patientId);
  }
  return out;
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
  correlationId: string,
  patientIds?: string[]
): Promise<Set<string>> {
  let query = admin
    .from('patient_allergies')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .is('archived_at', null);
  if (patientIds && patientIds.length > 0) {
    query = query.in('patient_id', patientIds);
  }
  const { data, error } = await query;

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

  switch (segment) {
    case 'active-90d':
      return summaries.filter((p) => {
        if (!p.last_appointment_date) return false;
        return now - new Date(p.last_appointment_date).getTime() <= ms90d;
      });
    case 'untagged':
      return summaries.filter((p) => coercePatientTags(p.patient_tags, p.patient_tag).length === 0);
    case 'new-30d':
    case 'revisit-30d':
    case 'incomplete-consult':
    case 'no-show-prone':
    case 'has-allergies':
    case 'has-open-episodes': {
      const admin = getSupabaseAdminClient();
      if (!admin) throw new InternalError('Service role client not available');
      const ids = summaries.map((p) => p.id);
      if (segment === 'new-30d' || segment === 'revisit-30d') {
        const matched = await getVisitSegmentPatientIds(
          admin,
          doctorId,
          ids,
          segment,
          correlationId
        );
        return summaries.filter((p) => matched.has(p.id));
      }
      if (segment === 'incomplete-consult') {
        const incomplete = await getIncompleteConsultPatientIds(
          admin,
          doctorId,
          ids,
          correlationId
        );
        return summaries.filter((p) => incomplete.has(p.id));
      }
      if (segment === 'no-show-prone') {
        const prone = await getNoShowPronePatientIds(admin, doctorId, ids, correlationId);
        return summaries.filter((p) => prone.has(p.id));
      }
      if (segment === 'has-allergies') {
        const withAllergies = await getPatientIdsWithAllergies(admin, doctorId, correlationId, ids);
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
  correlationId: string,
  actorId?: string
): Promise<PatientSummary[]> {
  const summaries = await buildPatientSummariesForDoctor(doctorId, correlationId);
  if (summaries.length > 0) {
    await logPatientRead(correlationId, doctorId, undefined, actorId);
  }
  return summaries;
}

function isLeanDeskLookup(filters: PatientListFilters): boolean {
  if (filters.lean !== true) return false;
  if (filters.segment || filters.tag) return false;
  return Boolean(filters.q?.trim()) || hasPatientIdentityFilter(filters);
}

/** Strip PostgREST `or` / LIKE metacharacters. Never log the raw search. */
function ilikeContainsPattern(raw: string): string | null {
  const cleaned = raw.replace(/[%_,.()"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return `%${cleaned}%`;
}

function linkedRowToSummary(patient: LinkedPatientRow): PatientSummary {
  const tags = coercePatientTags(patient.patient_tags, patient.patient_tag);
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    age: patient.age ?? undefined,
    gender: patient.gender ?? undefined,
    medical_record_number: patient.medical_record_number,
    patient_tags: tags,
    patient_tag: legacyPatientTagFromTags(tags),
    platform: patient.platform ?? null,
    platform_external_id: patient.platform_external_id ?? null,
    last_appointment_date: null,
    last_visit_modality: null,
    next_appointment_date: null,
    next_appointment_status: null,
    next_appointment_modality: null,
    created_at: toIsoCreatedAt(patient.created_at),
    guardian_name: patient.guardian_name ?? null,
    guardian_relation: patient.guardian_relation ?? null,
    alt_phone: patient.alt_phone ?? null,
    address: patient.address ?? null,
    date_of_birth: patient.date_of_birth ?? null,
    archived_at: patient.archived_at ?? null,
  };
}

async function fetchOwnedPatientsForLeanDesk(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  filters: PatientListFilters,
  correlationId: string
): Promise<LinkedPatientRow[]> {
  const qPattern = filters.q ? ilikeContainsPattern(filters.q) : null;
  const namePattern = filters.name ? ilikeContainsPattern(filters.name) : null;
  const guardianPattern = filters.guardianName
    ? ilikeContainsPattern(filters.guardianName)
    : null;

  return fetchAllPages<LinkedPatientRow>((from, to) => {
    let query = admin
      .from('patients')
      .select(PATIENT_IDENTITY_SELECT)
      .eq('doctor_id', doctorId)
      .not('medical_record_number', 'is', null);
    if (namePattern) query = query.ilike('name', namePattern);
    if (guardianPattern) query = query.ilike('guardian_name', guardianPattern);
    if (filters.gender) query = query.eq('gender', filters.gender);
    if (qPattern) {
      query = query.or(
        [
          `name.ilike.${qPattern}`,
          `guardian_name.ilike.${qPattern}`,
          `phone.ilike.${qPattern}`,
          `alt_phone.ilike.${qPattern}`,
          `medical_record_number.ilike.${qPattern}`,
          `address.ilike.${qPattern}`,
          `platform_external_id.ilike.${qPattern}`,
        ].join(',')
      );
    }
    return query.range(from, to);
  }, correlationId);
}

async function attachVisitBoundsToSummaries(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  doctorId: string,
  summaries: PatientSummary[],
  correlationId: string
): Promise<PatientSummary[]> {
  if (summaries.length === 0) return summaries;
  const lastAptRows: Array<{
    patient_id: string;
    appointment_date: string;
    consultation_type?: string | null;
    status?: string | null;
  }> = [];
  for (const chunk of idChunks(summaries.map((row) => row.id))) {
    const { data, error } = await admin
      .from('appointments')
      .select('patient_id, appointment_date, consultation_type, status')
      .eq('doctor_id', doctorId)
      .in('patient_id', chunk)
      .order('appointment_date', { ascending: false });
    if (error) handleSupabaseError(error, correlationId);
    lastAptRows.push(
      ...((data ?? []) as Array<{
        patient_id: string;
        appointment_date: string;
        consultation_type?: string | null;
        status?: string | null;
      }>)
    );
  }
  const { lastByPatient, nextByPatient } = collectVisitBounds(lastAptRows);
  return summaries.map((row) => {
    const last = lastByPatient.get(row.id);
    const next = nextByPatient.get(row.id);
    return {
      ...row,
      last_appointment_date: last?.date ?? null,
      last_visit_modality: last?.modality ?? null,
      next_appointment_date: next?.date ?? null,
      next_appointment_status: next?.status ?? null,
      next_appointment_modality: next?.modality ?? null,
    };
  });
}

/**
 * Filtered, sorted, paginated patients list (pr-02 / DL-4).
 * Segment predicates mirror `patient-list-segment-sql.ts` ({@link sortOrderByClause}).
 */
export async function listPatientsForDoctorFiltered(
  doctorId: string,
  filters: PatientListFilters,
  correlationId: string,
  actorId?: string
): Promise<PatientsListPagedData> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;

  if (isLeanDeskLookup(filters)) {
    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new InternalError('Service role client not available');
    }
    const includeArchived = filters.includeArchived === true;
    const rows = await fetchOwnedPatientsForLeanDesk(admin, doctorId, filters, correlationId);
    let summaries = rows
      .filter((p) => {
        if (p.name === '[Merged]' || (p.phone ?? '').startsWith('merged-')) return false;
        if (!includeArchived && p.archived_at) return false;
        if (!p.medical_record_number || String(p.medical_record_number).trim() === '') return false;
        return true;
      })
      .map(linkedRowToSummary);

    if (filters.q) {
      const needle = filters.q.toLowerCase();
      const qRaw = filters.q;
      summaries = summaries.filter((p) => {
        return (
          p.name.toLowerCase().includes(needle) ||
          p.phone.includes(qRaw) ||
          (p.alt_phone ?? '').includes(qRaw) ||
          (p.guardian_name ?? '').toLowerCase().includes(needle) ||
          (p.address ?? '').toLowerCase().includes(needle) ||
          (p.medical_record_number ?? '').toLowerCase().includes(needle) ||
          (p.platform_external_id ?? '').toLowerCase().includes(needle)
        );
      });
    }
    if (hasPatientIdentityFilter(filters)) {
      summaries = summaries.filter((p) => matchesPatientIdentityFilter(p, filters));
    }

    summaries = await attachVisitBoundsToSummaries(admin, doctorId, summaries, correlationId);

    if (filters.q && isNameSearchQuery(filters.q)) {
      summaries = [...summaries].sort((a, b) => comparePatientSearchHits(filters.q as string, a, b));
    } else if (filters.name && !filters.q) {
      summaries = [...summaries].sort((a, b) => comparePatientSearchHits(filters.name as string, a, b));
    } else {
      summaries = sortPatientSummaries(summaries, filters.sort);
    }

    const total = summaries.length;
    const offset = (page - 1) * pageSize;
    const patients = summaries.slice(offset, offset + pageSize);
    await logPatientRead(correlationId, doctorId, undefined, actorId);
    return { patients, total, page, pageSize };
  }

  let summaries = await buildPatientSummariesForDoctor(doctorId, correlationId, {
    includeArchived: filters.includeArchived === true,
  });

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const qRaw = filters.q;
    summaries = summaries.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(needle);
      const phoneMatch = p.phone.includes(qRaw);
      const altPhoneMatch = (p.alt_phone ?? '').includes(qRaw);
      const guardianMatch = (p.guardian_name ?? '').toLowerCase().includes(needle);
      const addressMatch = (p.address ?? '').toLowerCase().includes(needle);
      const mrnMatch = (p.medical_record_number ?? '').toLowerCase().includes(needle);
      const handleMatch = (p.platform_external_id ?? '').toLowerCase().includes(needle);
      return (
        nameMatch ||
        phoneMatch ||
        altPhoneMatch ||
        guardianMatch ||
        addressMatch ||
        mrnMatch ||
        handleMatch
      );
    });
  }

  if (hasPatientIdentityFilter(filters)) {
    summaries = summaries.filter((p) => matchesPatientIdentityFilter(p, filters));
  }

  if (filters.segment) {
    summaries = await applySegmentFilter(summaries, filters.segment, doctorId, correlationId);
  }

  if (filters.tag) {
    summaries = summaries.filter((p) =>
      patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), filters.tag!)
    );
  }

  if (filters.q && isNameSearchQuery(filters.q)) {
    summaries = [...summaries].sort((a, b) => comparePatientSearchHits(filters.q as string, a, b));
  } else {
    summaries = sortPatientSummaries(summaries, filters.sort);
  }

  const total = summaries.length;
  const offset = (page - 1) * pageSize;
  let patients = summaries.slice(offset, offset + pageSize);

  if (filters.lean !== true) {
    patients = await enrichPatientSummariesForList(patients, doctorId, correlationId);
  }

  await logPatientRead(correlationId, doctorId, undefined, actorId);

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
  const { data, error } = await supabase.from('patients').select('*').eq('phone', phone).single();

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
export async function createPatient(data: InsertPatient, correlationId: string): Promise<Patient> {
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
    registered_via: 'booking_for_other',
  };

  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .insert(insertData)
    .select()
    .single();

  if (error || !patient) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(correlationId, undefined as any, 'create', 'patient', patient.id);

  return patient as Patient;
}

export type CreateFrontDeskPatientResult =
  | { kind: 'created'; patient: Patient }
  | { kind: 'possible_duplicates'; matches: PossiblePatientMatch[] };

function phoneLast10(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function findOwnedPatientsByPhoneLast10(
  doctorId: string,
  phone: string,
  correlationId: string
): Promise<PossiblePatientMatch[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const last10 = phoneLast10(phone);
  if (last10.length < 10) {
    return [];
  }

  let { data, error } = await admin
    .from('patients')
    .select(
      'id, name, phone, age, gender, medical_record_number, guardian_name, guardian_relation, alt_phone, archived_at'
    )
    .eq('doctor_id', doctorId);

  if (error && /archived_at/i.test(error.message ?? '')) {
    const retry = await admin
      .from('patients')
      .select(
        'id, name, phone, age, gender, medical_record_number, guardian_name, guardian_relation, alt_phone'
      )
      .eq('doctor_id', doctorId);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error && /guardian_name|alt_phone/i.test(error.message ?? '')) {
    const retry = await admin
      .from('patients')
      .select('id, name, phone, age, gender, medical_record_number')
      .eq('doctor_id', doctorId);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const matches: PossiblePatientMatch[] = [];
  for (const row of data ?? []) {
    const p = row as {
      id: string;
      name: string;
      phone: string;
      age?: number | null;
      gender?: string | null;
      medical_record_number?: string | null;
      guardian_name?: string | null;
      guardian_relation?: string | null;
      alt_phone?: string | null;
      archived_at?: string | Date | null;
    };
    if (p.archived_at) continue;
    const primary = phoneLast10(p.phone);
    const alt = p.alt_phone ? phoneLast10(p.alt_phone) : '';
    if (primary !== last10 && alt !== last10) continue;
    matches.push({
      patientId: p.id,
      name: p.name,
      phone: p.phone,
      age: p.age,
      gender: p.gender,
      medicalRecordNumber: p.medical_record_number,
      guardianName: p.guardian_name,
      guardianRelation: p.guardian_relation,
      altPhone: p.alt_phone,
      confidence: 1,
    });
  }
  return matches;
}

function mergeMatches(
  a: PossiblePatientMatch[],
  b: PossiblePatientMatch[]
): PossiblePatientMatch[] {
  const byId = new Map<string, PossiblePatientMatch>();
  for (const m of [...a, ...b]) {
    const prev = byId.get(m.patientId);
    if (!prev || m.confidence > prev.confidence) {
      byId.set(m.patientId, m);
    }
  }
  return [...byId.values()].sort((x, y) => y.confidence - x.confidence);
}

/**
 * Manual / front-desk patient registration (receptionist-portal P2).
 * Doctor-scoped dedup (R9). Immediate MRN (R2). doctor_id ownership (R8).
 */
export async function createPatientForFrontDesk(
  doctorId: string,
  data: {
    name: string;
    phone: string;
    age?: number;
    ageUnit?: 'years' | 'months' | 'days';
    dateOfBirth?: string;
    gender?: string;
    email?: string;
    guardianName?: string;
    guardianRelation?: 'father' | 'spouse' | 'mother' | 'son' | 'daughter';
    altPhone?: string;
    address?: string;
    confirmNew?: boolean;
  },
  correlationId: string,
  actorId?: string
): Promise<CreateFrontDeskPatientResult> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const altLast10 = data.altPhone ? phoneLast10(data.altPhone) : '';
  const altForStore = altLast10.length === 10 ? altLast10 : undefined;
  const today = calendarYmd();
  const derivedDob =
    data.dateOfBirth ??
    (data.age != null && data.ageUnit === 'months'
      ? subtractCalendarMonths(today, data.age)
      : data.age != null && data.ageUnit === 'days'
        ? subtractCalendarDays(today, data.age)
        : undefined);
  const ageYears =
    derivedDob != null ? (ageYearsFromIsoDate(derivedDob) ?? undefined) : data.age;

  if (!data.confirmNew) {
    const [fuzzy, ownedPhone, ownedAlt] = await Promise.all([
      findPossiblePatientMatches(
        doctorId,
        data.phone,
        data.name,
        ageYears,
        data.gender,
        correlationId,
        data.guardianName
      ),
      findOwnedPatientsByPhoneLast10(doctorId, data.phone, correlationId),
      altForStore
        ? findOwnedPatientsByPhoneLast10(doctorId, altForStore, correlationId)
        : Promise.resolve([]),
    ]);
    const matches = mergeMatches(mergeMatches(fuzzy, ownedPhone), ownedAlt);
    if (matches.length > 0) {
      return { kind: 'possible_duplicates', matches };
    }
  }

  const now = new Date();
  const insertData: InsertPatient = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    age: ageYears,
    date_of_birth: derivedDob ? (derivedDob as unknown as Date) : undefined,
    gender: data.gender?.trim() || undefined,
    email: data.email?.trim() || undefined,
    guardian_name: data.guardianName?.trim() || undefined,
    guardian_relation: data.guardianRelation || undefined,
    alt_phone: altForStore,
    address: data.address?.trim() || undefined,
    doctor_id: doctorId,
    platform: null,
    platform_external_id: null,
    consent_status: 'granted',
    consent_granted_at: now,
    consent_method: 'front_desk',
    registered_via: actorId && actorId !== doctorId ? 'front_desk' : 'doctor',
    created_by: actorId ?? doctorId,
  };

  const { data: created, error } = await supabaseAdmin
    .from('patients')
    .insert(insertData)
    .select()
    .single();

  if (error || !created) {
    handleSupabaseError(error, correlationId);
  }

  const patientId = (created as Patient).id;
  const mrn = await ensurePatientMrnIfEligible(patientId, correlationId);
  const patient: Patient = {
    ...(created as Patient),
    medical_record_number: mrn ?? (created as Patient).medical_record_number,
  };

  const onBehalf = actorId && actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId ?? doctorId,
    'create',
    'patient',
    patientId,
    undefined,
    onBehalf
  );

  return { kind: 'created', patient };
}

export type UpdateFrontDeskPatientResult =
  | { kind: 'updated'; patient: Patient }
  | { kind: 'possible_duplicates'; matches: PossiblePatientMatch[] };

function isRetiredPatientRow(row: Pick<Patient, 'name' | 'phone'>): boolean {
  const name = (row.name ?? '').trim();
  const phone = (row.phone ?? '').trim().toLowerCase();
  return (
    name === '[Merged]' ||
    name === '[Anonymized]' ||
    phone.startsWith('merged-') ||
    phone.startsWith('revoked-')
  );
}

/**
 * Front-desk demographic edit. Does not change MRN, consent, ownership, or platform.
 * Write is doctor_id-scoped even if the actor can view via an old appointment.
 */
export async function updatePatientForFrontDesk(
  doctorId: string,
  patientId: string,
  data: {
    name: string;
    phone: string;
    age?: number;
    ageUnit?: 'years' | 'months' | 'days';
    dateOfBirth?: string;
    gender?: string;
    email?: string;
    guardianName?: string;
    guardianRelation?: 'father' | 'spouse' | 'mother' | 'son' | 'daughter';
    altPhone?: string;
    address?: string;
    confirmNew?: boolean;
  },
  correlationId: string,
  actorId?: string
): Promise<UpdateFrontDeskPatientResult> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const existing = await getPatientForDoctor(patientId, doctorId, correlationId, actorId);
  if (isRetiredPatientRow(existing)) {
    throw new ValidationError('This record cannot be edited');
  }

  const altLast10 = data.altPhone ? phoneLast10(data.altPhone) : '';
  const altForStore = altLast10.length === 10 ? altLast10 : undefined;
  const today = calendarYmd();
  const derivedDob =
    data.dateOfBirth ??
    (data.age != null && data.ageUnit === 'months'
      ? subtractCalendarMonths(today, data.age)
      : data.age != null && data.ageUnit === 'days'
        ? subtractCalendarDays(today, data.age)
        : undefined);
  const ageYears =
    derivedDob != null ? (ageYearsFromIsoDate(derivedDob) ?? undefined) : data.age;

  if (!data.confirmNew) {
    const [fuzzy, ownedPhone, ownedAlt] = await Promise.all([
      findPossiblePatientMatches(
        doctorId,
        data.phone,
        data.name,
        ageYears,
        data.gender,
        correlationId,
        data.guardianName
      ),
      findOwnedPatientsByPhoneLast10(doctorId, data.phone, correlationId),
      altForStore
        ? findOwnedPatientsByPhoneLast10(doctorId, altForStore, correlationId)
        : Promise.resolve([]),
    ]);
    const matches = mergeMatches(mergeMatches(fuzzy, ownedPhone), ownedAlt).filter(
      (row) => row.patientId !== patientId
    );
    if (matches.length > 0) {
      return { kind: 'possible_duplicates', matches };
    }
  }

  const patch = {
    name: data.name.trim(),
    phone: data.phone.trim(),
    age: ageYears ?? null,
    date_of_birth: derivedDob ? (derivedDob as unknown as Date) : null,
    gender: data.gender?.trim() || null,
    guardian_name: data.guardianName?.trim() || null,
    guardian_relation: data.guardianRelation || null,
    alt_phone: altForStore ?? null,
    address: data.address?.trim() || null,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('patients')
    .update(patch)
    .eq('id', patientId)
    .eq('doctor_id', doctorId)
    .select()
    .single();

  if (error || !updated) {
    if (error?.code === 'PGRST116' || !updated) {
      throw new ForbiddenError('Access denied: You do not have access to this patient');
    }
    handleSupabaseError(error, correlationId);
  }

  const onBehalf = actorId && actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId ?? doctorId,
    'update',
    'patient',
    patientId,
    Object.keys(patch),
    onBehalf
  );

  return { kind: 'updated', patient: updated as Patient };
}

export type ArchiveFrontDeskPatientResult =
  | { kind: 'archived'; patient: Patient }
  | { kind: 'has_clinical_data' };

const CLINICAL_HEAD_TABLES = [
  { table: 'prescriptions', column: 'id' },
  { table: 'patient_allergies', column: 'id' },
  { table: 'patient_chronic_conditions', column: 'id' },
  { table: 'patient_medications', column: 'id' },
  { table: 'patient_vitals', column: 'id' },
  { table: 'patient_problem_list_v', column: 'patient_id' },
] as const;

async function patientHasClinicalData(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  patientId: string,
  correlationId: string
): Promise<boolean> {
  for (const { table, column } of CLINICAL_HEAD_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select(column)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle();
    if (error && /does not exist|schema cache|column/i.test(error.message ?? '')) {
      continue;
    }
    if (error) handleSupabaseError(error, correlationId);
    if (data) return true;
  }

  const { data: completed, error: aptErr } = await admin
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('status', 'completed')
    .limit(1)
    .maybeSingle();
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  return Boolean(completed);
}

/**
 * Front-desk hide. Does not delete. Refuses rows with clinical payload.
 */
export async function archivePatientForFrontDesk(
  doctorId: string,
  patientId: string,
  correlationId: string,
  actorId?: string
): Promise<ArchiveFrontDeskPatientResult> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const existing = await getPatientForDoctor(patientId, doctorId, correlationId, actorId);
  if (isRetiredPatientRow(existing)) {
    throw new ValidationError('This record cannot be archived');
  }
  if (existing.archived_at) {
    return { kind: 'archived', patient: existing };
  }

  if (await patientHasClinicalData(supabaseAdmin, patientId, correlationId)) {
    return { kind: 'has_clinical_data' };
  }

  const archivedAt = new Date().toISOString();
  const archivedBy = actorId ?? doctorId;
  const { data: updated, error } = await supabaseAdmin
    .from('patients')
    .update({ archived_at: archivedAt, archived_by: archivedBy })
    .eq('id', patientId)
    .eq('doctor_id', doctorId)
    .select()
    .single();

  if (error || !updated) {
    if (error?.code === 'PGRST116' || !updated) {
      throw new ForbiddenError('Access denied: You do not have access to this patient');
    }
    handleSupabaseError(error, correlationId);
  }

  const onBehalf = actorId && actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId ?? doctorId,
    'update',
    'patient',
    patientId,
    ['archived_at', 'archived_by'],
    onBehalf
  );

  return { kind: 'archived', patient: updated as Patient };
}

/**
 * Front-desk restore. Always allowed for a doctor-owned archived row.
 */
export async function restorePatientForFrontDesk(
  doctorId: string,
  patientId: string,
  correlationId: string,
  actorId?: string
): Promise<Patient> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available');
  }

  const existing = await getPatientForDoctor(patientId, doctorId, correlationId, actorId);
  if (isRetiredPatientRow(existing)) {
    throw new ValidationError('This record cannot be restored');
  }
  if (!existing.archived_at) {
    return existing;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('patients')
    .update({ archived_at: null, archived_by: null })
    .eq('id', patientId)
    .eq('doctor_id', doctorId)
    .select()
    .single();

  if (error || !updated) {
    if (error?.code === 'PGRST116' || !updated) {
      throw new ForbiddenError('Access denied: You do not have access to this patient');
    }
    handleSupabaseError(error, correlationId);
  }

  const onBehalf = actorId && actorId !== doctorId ? doctorId : undefined;
  await logDataModification(
    correlationId,
    actorId ?? doctorId,
    'update',
    'patient',
    patientId,
    ['archived_at', 'archived_by'],
    onBehalf
  );

  return updated as Patient;
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
  const changedFields = Object.keys(data as Record<string, unknown>).filter((key) => key !== 'id');

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
 * Bulk tag ops for patients linked to the doctor (pr-07 / patients-multi-tag).
 */
export async function bulkTagPatientsForDoctor(
  doctorId: string,
  patientIds: string[],
  body: { op: PatientTagOp; tags: string[] },
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

  const linkedById = new Map(linked.map((p) => [p.id, p]));
  let updated = 0;

  for (const id of patientIds) {
    const row = linkedById.get(id);
    if (!row) continue;
    const current = coercePatientTags(row.patient_tags, row.patient_tag);
    const next = applyTagOp(current, body.op, body.tags);
    const { error } = await admin
      .from('patients')
      .update({
        patient_tags: next,
        patient_tag: legacyPatientTagFromTags(next),
      })
      .eq('id', id);
    if (error) handleSupabaseError(error, correlationId);
    updated += 1;
  }

  await logDataModification(correlationId, doctorId, 'update', 'patient', `bulk-tag:${updated}`, [
    'patient_tags',
  ]);

  return { updated };
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

  // Union tags onto target (cap via normalize).
  const { data: tagRows, error: tagFetchErr } = await admin
    .from('patients')
    .select('id, patient_tag, patient_tags')
    .in('id', [sourcePatientId, targetPatientId]);
  if (tagFetchErr) handleSupabaseError(tagFetchErr, correlationId);
  const byId = new Map(
    (tagRows ?? []).map((r) => [
      (r as { id: string }).id,
      r as { patient_tag?: string | null; patient_tags?: string[] | null },
    ])
  );
  const sourceTags = coercePatientTags(
    byId.get(sourcePatientId)?.patient_tags,
    byId.get(sourcePatientId)?.patient_tag
  );
  const targetTags = coercePatientTags(
    byId.get(targetPatientId)?.patient_tags,
    byId.get(targetPatientId)?.patient_tag
  );
  const mergedTags = applyTagOp(targetTags, 'add', sourceTags);
  const { error: tagMergeErr } = await admin
    .from('patients')
    .update({
      patient_tags: mergedTags,
      patient_tag: legacyPatientTagFromTags(mergedTags),
    })
    .eq('id', targetPatientId);
  if (tagMergeErr) handleSupabaseError(tagMergeErr, correlationId);

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

  const mrn: string | null = typeof seqRow === 'string' ? seqRow : ((seqRow as any)?.mrn ?? null);

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
/**
 * Set patients.platform_username when missing (Inbox @handle). Best-effort.
 */
export async function setPatientPlatformUsernameIfEmpty(
  patientId: string,
  platformUsername: string,
  correlationId: string
): Promise<void> {
  const trimmed = platformUsername.trim();
  if (!trimmed || !patientId) return;
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin
    .from('patients')
    .update({ platform_username: trimmed })
    .eq('id', patientId)
    .is('platform_username', null);

  if (error) {
    logger.warn(
      { correlationId, errCode: error.code },
      'patients.platform_username update failed (best-effort)'
    );
  }
}

export async function findOrCreatePlaceholderPatient(
  doctorId: string,
  platform: string,
  platformExternalId: string,
  correlationId: string,
  platformUsername?: string | null
): Promise<Patient> {
  const existing = await findPatientByDoctorPlatformExternalId(
    doctorId,
    platform,
    platformExternalId,
    correlationId
  );
  if (existing) {
    if (platformUsername?.trim() && !existing.platform_username) {
      await setPatientPlatformUsernameIfEmpty(existing.id, platformUsername, correlationId);
      return { ...existing, platform_username: platformUsername.trim() };
    }
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
      platform_username: platformUsername?.trim() || null,
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

  await logDataModification(correlationId, undefined as any, 'create', 'patient', patient.id);

  return patient as Patient;
}
