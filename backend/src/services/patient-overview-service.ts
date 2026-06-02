/**
 * Patient Overview Service (Patients tab redesign / pr-03 / DL-5 + DL-6).
 *
 * Composes patient chart context (snapshot, problems, allergies, conditions,
 * vitals, current meds), the six-visit strip, the recent activity feed, and
 * derived care-plan + risk-flag arrays into a single response. Also exposes
 * the doctor-scoped KPI counts behind a 60s process-local LRU.
 *
 * ## Auth / RLS posture
 *
 * Every internal call funnels through the admin (service-role) client and
 * enforces `doctor_id = userId` in TypeScript. This matches the codebase
 * convention established by `prescription-service.ts`,
 * `patient-chart-service.ts`, and every other multi-table aggregator. The
 * migration 087 (chart context) and migration 026 (prescriptions /
 * appointments) RLS policies stay live as defense-in-depth — every source
 * table is gated on `auth.uid() = doctor_id` (verified via:
 * `rg "auth\.uid\(\)" backend/migrations`):
 *   - patient_allergies          (migration 087 §4)
 *   - patient_chronic_conditions (migration 087 §4)
 *   - patient_vitals             (migration 087 §4)
 *   - prescriptions              (migration 026 §4)
 *   - appointments               (migration 026 §4)
 *   - payments                   (migration 008 §3; gated via appointment.doctor_id)
 *   - patient_problem_list_v     (inherits from chronic_conditions / episodes / prescriptions)
 *
 * The aggregator MUST NOT compose these tables in a single SQL statement
 * with hand-rolled JOIN predicates — even a tiny misspecification could
 * silently leak rows across tenants. Each section is fetched via its
 * existing TS service function (which already enforces ownership), and
 * the composition happens in pure TypeScript. See `task-pr-03 § notes 1`.
 *
 * ## PHI surface
 *
 * Every field on the wire is PHI (vitals, allergies, conditions, current
 * medications, activity references). Doctor-only consumer. No PHI in logs.
 *
 * ## Care-plan and risk-flag derivation
 *
 * Deterministic, documented inline (CP-1..CP-5, RF-1..RF-5). No LLM call.
 * The rule list is exhaustive for Phase 1; a sixth rule belongs in its own
 * task. Each rule's input is the in-memory composition result, so the
 * rules are testable in isolation against a constructed fixture.
 *
 * ## KPI cache
 *
 * 60s process-local LRU per doctor. Acceptable staleness window for the
 * "New patients this month" / "Open episodes" tiles. Cache eviction on
 * patient mutation is deferred to Phase 2 (Supabase realtime invalidator).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess } from '../utils/audit-logger';
import { InternalError, NotFoundError } from '../utils/errors';
import { logger } from '../config/logger';
import {
  listAllergies,
  listChronicConditions,
  listVitals,
  getProblemList,
} from './patient-chart-service';
import { listPrescriptionsByPatient } from './prescription-service';
import { listAppointmentsForPatient } from './appointment-service';
import { findPatientByIdWithAdmin } from './patient-service';
import { listPossibleDuplicates } from './patient-matching-service';
import type {
  PatientAllergy,
  PatientChronicCondition,
  PatientVitalsReading,
  ProblemListItem,
} from '../types/patient-chart';
import type {
  Prescription,
  PrescriptionWithRelations,
} from '../types/prescription';
import type { Appointment, AppointmentStatus, Patient } from '../types';

// ============================================================================
// Response shapes (mirror frontend/types/patient.ts exactly — pr-01 / DL-5)
// ============================================================================

export interface PatientOverviewSnapshot {
  blood_group: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  preferred_language: string | null;
}

export interface PatientCurrentMedication {
  drug_name: string;
  dose: string | null;
  frequency: string | null;
  prescribed_at: string;
  prescriber_doctor_id: string;
  still_taking: boolean | null;
}

export interface PatientVitalsTrendPoint {
  recorded_at: string;
  value: number;
}

export interface PatientVitalsTrends {
  bp_systolic: PatientVitalsTrendPoint[];
  bp_diastolic: PatientVitalsTrendPoint[];
  heart_rate: PatientVitalsTrendPoint[];
  spo2: PatientVitalsTrendPoint[];
  weight_kg: PatientVitalsTrendPoint[];
  bmi: PatientVitalsTrendPoint[];
}

export type PatientActivityKind =
  | 'visit'
  | 'message'
  | 'prescription'
  | 'payment'
  | 'no_show'
  | 'file_upload';

export interface PatientActivityRow {
  kind: PatientActivityKind;
  occurred_at: string;
  summary: string;
  href: string | null;
}

export interface PatientCarePlan {
  next_step: string | null;
  overdue: string[];
  rationale: string[];
}

export type PatientRiskFlagSeverity = 'info' | 'warning' | 'danger';

export interface PatientRiskFlag {
  code: string;
  label: string;
  severity: PatientRiskFlagSeverity;
}

export interface PatientSixVisitStripEntry {
  appointment_id: string;
  occurred_at: string;
  status: AppointmentStatus;
  modality: 'text' | 'voice' | 'video' | 'in_clinic';
  chief_complaint: string | null;
}

export interface PatientOverviewData {
  patient: Patient;
  snapshot: PatientOverviewSnapshot;
  active_problems: ProblemListItem[];
  allergies: PatientAllergy[];
  chronic_conditions: PatientChronicCondition[];
  current_medications: PatientCurrentMedication[];
  vitals_trends: PatientVitalsTrends;
  recent_activity: PatientActivityRow[];
  care_plan: PatientCarePlan | null;
  risk_flags: PatientRiskFlag[];
  six_visit_strip: PatientSixVisitStripEntry[];
}

export interface PatientsKpis {
  active_90d: { count: number; delta_7d: number };
  new_30d: { count: number; delta_7d: number };
  followup_overdue: { count: number; delta_7d: number };
  open_episodes: { count: number; delta_7d: number };
  possible_duplicates: { count: number; delta_7d: number };
  cache_ttl_seconds: number;
}

// ============================================================================
// Tuning constants
// ============================================================================

const VITALS_LOOKBACK_LIMIT = 200;
const VITALS_TREND_CAP_PER_METRIC = 30;
const PRESCRIPTIONS_LOOKBACK_LIMIT = 50;
const APPOINTMENTS_LOOKBACK_LIMIT = 100;
const CURRENT_MEDICATIONS_CAP = 20;
const ACTIVITY_FEED_CAP = 10;
const SIX_VISIT_STRIP_CAP = 6;
const CHIEF_COMPLAINT_MAX_LEN = 80;
const KPI_CACHE_TTL_SECONDS = 60;

const RECENT_VITALS_RECHECK_DAYS = 14;
const OPEN_EPISODE_INACTIVITY_DAYS = 30;
const REFILL_DUE_SOON_DAYS = 25;
const REFILL_DEFAULT_COURSE_DAYS = 30;
const BP_HIGH_SYSTOLIC = 140;
const BP_HIGH_DIASTOLIC = 90;
const SPO2_LOW_THRESHOLD = 92;
const POLYPHARMACY_THRESHOLD = 5;
const NO_SHOW_WINDOW = 4;
const NO_SHOW_THRESHOLD = 2;

// ============================================================================
// Internal helpers
// ============================================================================

/** np-09 measurement-only — set NP_DB_PROFILE=1; durations + row counts only (no PHI). */
const NP_DB_PROFILE = process.env.NP_DB_PROFILE === '1';

export interface PatientOverviewWaveProfile {
  /** Merged tenant gate (patient row ∥ ownership probes). */
  waveAB_tenantGateMs: number;
  /** @deprecated alias — same as waveAB_tenantGateMs for np-09 script compat */
  waveA_findPatientMs: number;
  /** @deprecated alias — always 0 after np-10 (merged into waveAB) */
  waveB_ownershipMs: number;
  waveC_sectionsMs: number;
  /** Overlapped inside wave C; tracked separately for attribution. */
  waveD_paymentsMs: number;
  rowCounts: {
    allergies: number;
    chronicConditions: number;
    problems: number;
    vitals: number;
    prescriptions: number;
    appointments: number;
    payments: number;
  };
}

let lastOverviewWaveProfile: PatientOverviewWaveProfile | null = null;

/** Test/script hook — read and clear the last np-09 wave profile. */
export function consumeOverviewWaveProfile(): PatientOverviewWaveProfile | null {
  const snapshot = lastOverviewWaveProfile;
  lastOverviewWaveProfile = null;
  return snapshot;
}

function adminOrThrow(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function clampString(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function followUpUnitToDays(unit: string | null, value: number | null): number | null {
  if (value == null || value < 0) return null;
  switch (unit) {
    case 'days':
      return value;
    case 'weeks':
      return value * 7;
    case 'months':
      return value * 30;
    case 'as_needed':
    default:
      return null;
  }
}

function formatDateYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Derive a numeric "course length in days" from a prescription medicine row.
 * Returns null when the medicine ships without structured duration columns
 * (CP-5 then falls back to {@link REFILL_DEFAULT_COURSE_DAYS}).
 */
function medicineDurationDays(med: {
  duration_value: number | null;
  duration_unit: string | null;
}): number | null {
  if (med.duration_value == null) return null;
  switch (med.duration_unit) {
    case 'days':
      return med.duration_value;
    case 'weeks':
      return med.duration_value * 7;
    case 'months':
      return med.duration_value * 30;
    case 'until-finished':
    case 'continue':
    default:
      return null;
  }
}

/**
 * Most-recent reading per metric across the vitals array. The list is sorted
 * `recorded_at DESC` upstream (see {@link listVitals}), so the first
 * non-null reading is the latest.
 */
function latestVitalValue(
  vitals: PatientVitalsReading[],
  metric: keyof Pick<
    PatientVitalsReading,
    | 'bp_systolic'
    | 'bp_diastolic'
    | 'heart_rate'
    | 'spo2'
    | 'weight_kg'
    | 'height_cm'
    | 'bmi'
    | 'temperature_c'
  >
): number | null {
  for (const row of vitals) {
    const value = row[metric];
    if (value != null) return Number(value);
  }
  return null;
}

/**
 * Pivot the vitals history into a per-metric trend array sorted by
 * `recorded_at ASC` (oldest → newest) and capped at
 * {@link VITALS_TREND_CAP_PER_METRIC} points so the line chart isn't
 * overwhelmed.
 */
function buildTrendSeries(
  vitals: PatientVitalsReading[],
  metric: keyof Pick<
    PatientVitalsReading,
    'bp_systolic' | 'bp_diastolic' | 'heart_rate' | 'spo2' | 'weight_kg' | 'bmi'
  >
): PatientVitalsTrendPoint[] {
  const points: PatientVitalsTrendPoint[] = [];
  for (const row of vitals) {
    const value = row[metric];
    if (value == null) continue;
    points.push({ recorded_at: row.recorded_at, value: Number(value) });
  }
  points.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  if (points.length > VITALS_TREND_CAP_PER_METRIC) {
    return points.slice(points.length - VITALS_TREND_CAP_PER_METRIC);
  }
  return points;
}

/**
 * Lightweight payment events for a patient. Read directly via the admin
 * client because the per-doctor scoping is implicit in the appointment
 * filter (we join the appointment IDs of doctor-owned appointments only).
 */
async function fetchPaymentEvents(
  appointmentIds: string[],
  correlationId: string
): Promise<Array<{ appointment_id: string; amount_minor: number; currency: string; created_at: string; status: string }>> {
  if (appointmentIds.length === 0) return [];
  const admin = adminOrThrow();
  const { data, error } = await admin
    .from('payments')
    .select('appointment_id, amount_minor, currency, created_at, status')
    .in('appointment_id', appointmentIds)
    .eq('status', 'captured')
    .order('created_at', { ascending: false });
  if (error) handleSupabaseError(error, correlationId);
  return (data ?? []) as Array<{
    appointment_id: string;
    amount_minor: number;
    currency: string;
    created_at: string;
    status: string;
  }>;
}

/**
 * Format an `amount_minor` (paise / cents) into a human-readable string the
 * activity feed can show next to the currency code. Returns `"99.50"` for
 * `amount_minor=9950` with the default 2-place denomination assumption.
 * Phase 1 keeps this simple — internationalising the minor-unit count is
 * Phase 2 work.
 */
function formatAmountMinor(amountMinor: number): string {
  const major = amountMinor / 100;
  return major.toFixed(2);
}

// ============================================================================
// Public — overview aggregator
// ============================================================================

/**
 * Build the {@link PatientOverviewData} payload for the given patient.
 *
 * Steps:
 *   1. Belt-and-suspenders tenant assertion (the chart sources already
 *      gate by `doctor_id`, but we resolve the patient first so a
 *      cross-doctor request 404s loud and early without revealing the
 *      patient's existence).
 *   2. Six parallel section fetches via `Promise.all`. Any failure aborts
 *      the whole response with a 5xx — silently substituting empty arrays
 *      would mislead the doctor into thinking the patient has no allergies.
 *   3. In-memory composition (snapshot, current medications, vitals trends,
 *      recent activity, six-visit strip).
 *   4. Care-plan + risk-flag rule evaluation (see {@link deriveCarePlan} and
 *      {@link deriveRiskFlags}).
 */
export async function getPatientOverview(
  patientId: string,
  correlationId: string,
  userId: string
): Promise<PatientOverviewData> {
  const admin = adminOrThrow();
  const waveStart = NP_DB_PROFILE ? performance.now() : 0;
  let waveAB_ms = 0;
  let waveC_ms = 0;
  let waveD_ms = 0;

  // ----------------------------------------------------------------------
  // Step 1 (np-10): Tenant gate — patient row ∥ ownership probes in one wave.
  // Ownership checks depend only on patientId + userId, not patient row fields.
  // ----------------------------------------------------------------------
  const waveABStart = NP_DB_PROFILE ? performance.now() : 0;
  const [
    patient,
    { data: aptCheck, error: aptErr },
    { data: convCheck, error: convErr },
  ] = await Promise.all([
    findPatientByIdWithAdmin(patientId, correlationId),
    admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', userId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
    admin
      .from('conversations')
      .select('id')
      .eq('doctor_id', userId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (NP_DB_PROFILE) waveAB_ms = Math.round(performance.now() - waveABStart);
  if (!patient) {
    throw new NotFoundError('Patient not found');
  }
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  if (convErr) handleSupabaseError(convErr, correlationId);
  if (!aptCheck && !convCheck) {
    throw new NotFoundError('Patient not found');
  }

  // ----------------------------------------------------------------------
  // Step 2: Six parallel section fetches + payments overlapped on appointments.
  // Payments only needs appointment ids — start as soon as appointments resolve.
  // ----------------------------------------------------------------------
  const waveCStart = NP_DB_PROFILE ? performance.now() : 0;
  type Section =
    | 'allergies'
    | 'chronic_conditions'
    | 'problems'
    | 'vitals'
    | 'prescriptions'
    | 'appointments';

  async function guard<T>(section: Section, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const error = err as Error;
      logger.error(
        {
          correlationId,
          section,
          error: error.message,
        },
        'patient_overview.section_failed'
      );
      // Rethrow with a section-labelled internal error so the controller
      // surfaces a structured failure rather than masking with an empty list.
      const wrapped = new InternalError(`patient_overview_section_failed:${section}`);
      throw wrapped;
    }
  }

  const appointmentsPromise = guard('appointments', () =>
    listAppointmentsForPatient(patientId, userId, correlationId)
  );

  let paymentsWaveStart = 0;
  const paymentsPromise = appointmentsPromise.then((resolvedAppointments) => {
    const capped = resolvedAppointments.slice(-APPOINTMENTS_LOOKBACK_LIMIT);
    if (NP_DB_PROFILE) paymentsWaveStart = performance.now();
    return fetchPaymentEvents(
      capped.map((a) => a.id),
      correlationId
    ).then((resolvedPayments) => {
      if (NP_DB_PROFILE && paymentsWaveStart > 0) {
        waveD_ms = Math.round(performance.now() - paymentsWaveStart);
      }
      return resolvedPayments;
    });
  });

  const [
    allergies,
    chronicConditions,
    problems,
    vitalsRecent,
    prescriptions,
    appointments,
    payments,
  ] = await Promise.all([
    guard('allergies', () => listAllergies(patientId, correlationId, userId)),
    guard('chronic_conditions', () =>
      listChronicConditions(patientId, correlationId, userId)
    ),
    guard('problems', () => getProblemList(patientId, correlationId, userId)),
    guard('vitals', () =>
      listVitals(patientId, correlationId, userId, VITALS_LOOKBACK_LIMIT)
    ),
    guard('prescriptions', () =>
      listPrescriptionsByPatient(patientId, correlationId, userId, {
        skipAccessGate: true,
      })
    ),
    appointmentsPromise,
    paymentsPromise,
  ]);
  if (NP_DB_PROFILE) waveC_ms = Math.round(performance.now() - waveCStart);

  // ----------------------------------------------------------------------
  // Step 3d: Recent activity feed (visits, prescriptions, payments,
  // no-shows). Messages + file uploads are deferred to Phase 2.
  // Payments were fetched in parallel with wave C (np-10).
  // ----------------------------------------------------------------------
  const cappedPrescriptions = prescriptions.slice(0, PRESCRIPTIONS_LOOKBACK_LIMIT);
  const cappedAppointments = appointments.slice(-APPOINTMENTS_LOOKBACK_LIMIT);

  // Step 3a: Snapshot. `blood_group` and `preferred_language` are Phase 2
  // — neither column exists on `patients` today (see discovery).
  const snapshot: PatientOverviewSnapshot = {
    blood_group: null,
    height_cm: latestVitalValue(vitalsRecent, 'height_cm'),
    weight_kg: latestVitalValue(vitalsRecent, 'weight_kg'),
    bmi: latestVitalValue(vitalsRecent, 'bmi'),
    preferred_language: null,
  };

  // ----------------------------------------------------------------------
  // Step 3b: Current medications. Pull medicines from non-archived
  // prescriptions ordered by `prescribed_at DESC` (the prescription row's
  // own created_at is the prescribed-at proxy — `sent_to_patient_at` would
  // miss drafts that are still in-flight). Cap at 20 rows.
  // ----------------------------------------------------------------------
  const currentMedications = buildCurrentMedications(cappedPrescriptions);

  // ----------------------------------------------------------------------
  // Step 3c: Vitals trends. Six metrics; oldest → newest; cap 30 per metric.
  // ----------------------------------------------------------------------
  const vitalsTrends: PatientVitalsTrends = {
    bp_systolic: buildTrendSeries(vitalsRecent, 'bp_systolic'),
    bp_diastolic: buildTrendSeries(vitalsRecent, 'bp_diastolic'),
    heart_rate: buildTrendSeries(vitalsRecent, 'heart_rate'),
    spo2: buildTrendSeries(vitalsRecent, 'spo2'),
    weight_kg: buildTrendSeries(vitalsRecent, 'weight_kg'),
    bmi: buildTrendSeries(vitalsRecent, 'bmi'),
  };

  // ----------------------------------------------------------------------
  // Step 3d: Recent activity feed (visits, prescriptions, payments,
  // no-shows). Messages + file uploads are deferred to Phase 2.
  // ----------------------------------------------------------------------
  const recentActivity = buildRecentActivity(
    cappedAppointments,
    cappedPrescriptions,
    payments
  );

  // ----------------------------------------------------------------------
  // Step 3e: Six-visit strip (newest left). Chief complaint resolution:
  // latest prescription cc for the appointment → appointment.reason_for_visit
  // → appointment.notes → null. (The task spec mentions a
  // `prescription_drafts` snapshot table; that table does not exist today —
  // when it lands, swap the first rung of the chain to the draft cc.)
  // ----------------------------------------------------------------------
  const sixVisitStrip = buildSixVisitStrip(cappedAppointments, cappedPrescriptions);

  // ----------------------------------------------------------------------
  // Step 4: Care-plan + risk-flag derivation. Deterministic; doesn't issue
  // any further DB calls.
  // ----------------------------------------------------------------------
  const carePlan = deriveCarePlan({
    prescriptions: cappedPrescriptions,
    appointments: cappedAppointments,
    vitals: vitalsRecent,
    problems,
    currentMedications,
    now: new Date(),
  });

  const riskFlags = deriveRiskFlags({
    vitals: vitalsRecent,
    appointments: cappedAppointments,
    allergies,
    currentMedications,
  });

  // Audit the composed read once (the inner functions already log their own
  // per-table access events; this is the top-level "doctor opened patient
  // overview" event).
  await logDataAccess(correlationId, userId, 'patient_overview', patientId);

  if (NP_DB_PROFILE) {
    lastOverviewWaveProfile = {
      waveAB_tenantGateMs: waveAB_ms,
      waveA_findPatientMs: waveAB_ms,
      waveB_ownershipMs: 0,
      waveC_sectionsMs: waveC_ms,
      waveD_paymentsMs: waveD_ms,
      rowCounts: {
        allergies: allergies.length,
        chronicConditions: chronicConditions.length,
        problems: problems.length,
        vitals: vitalsRecent.length,
        prescriptions: cappedPrescriptions.length,
        appointments: cappedAppointments.length,
        payments: payments.length,
      },
    };
    logger.info(
      {
        correlationId,
        totalMs: Math.round(performance.now() - waveStart),
        ...lastOverviewWaveProfile,
      },
      'np_db_profile.patient_overview_waves'
    );
  }

  return {
    patient,
    snapshot,
    active_problems: problems,
    allergies,
    chronic_conditions: chronicConditions,
    current_medications: currentMedications,
    vitals_trends: vitalsTrends,
    recent_activity: recentActivity,
    care_plan: carePlan,
    risk_flags: riskFlags,
    six_visit_strip: sixVisitStrip,
  };
}

// ============================================================================
// Current-medications derivation
// ============================================================================

export function buildCurrentMedications(
  prescriptions: PrescriptionWithRelations[]
): PatientCurrentMedication[] {
  const all: PatientCurrentMedication[] = [];
  // Sort prescriptions newest first by created_at so the resulting array is
  // "most recent visits first" — required by the FE which lists newest at
  // the top of the medication strip.
  const sortedPrescriptions = [...prescriptions].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
  for (const rx of sortedPrescriptions) {
    for (const med of rx.prescription_medicines ?? []) {
      all.push({
        drug_name: med.medicine_name,
        dose: med.dosage ?? null,
        frequency: med.frequency ?? null,
        prescribed_at: String(rx.created_at),
        prescriber_doctor_id: rx.doctor_id,
        // still_taking is Phase 2 — no med-recon prompt yet.
        still_taking: null,
      });
      if (all.length >= CURRENT_MEDICATIONS_CAP) break;
    }
    if (all.length >= CURRENT_MEDICATIONS_CAP) break;
  }
  return all;
}

// ============================================================================
// Recent-activity feed
// ============================================================================

export function buildRecentActivity(
  appointments: Appointment[],
  prescriptions: PrescriptionWithRelations[],
  payments: Array<{ appointment_id: string; amount_minor: number; currency: string; created_at: string; status: string }>
): PatientActivityRow[] {
  const rows: PatientActivityRow[] = [];

  for (const apt of appointments) {
    const occurredAt = toIsoString(apt.appointment_date);
    if (!occurredAt) continue;
    const modality = (apt.consultation_type ?? 'in_clinic') as string;
    if (apt.status === 'no_show') {
      rows.push({
        kind: 'no_show',
        occurred_at: occurredAt,
        summary: 'Marked as no-show',
        href: `/dashboard/appointments/${apt.id}`,
      });
    } else {
      rows.push({
        kind: 'visit',
        occurred_at: occurredAt,
        summary: `${modality} consult — ${apt.status}`,
        href: `/dashboard/appointments/${apt.id}`,
      });
    }
  }

  for (const rx of prescriptions) {
    const occurredAt = toIsoString(rx.created_at);
    if (!occurredAt) continue;
    const count = rx.prescription_medicines?.length ?? 0;
    rows.push({
      kind: 'prescription',
      occurred_at: occurredAt,
      summary: count === 1 ? '1 medicine prescribed' : `${count} medicines prescribed`,
      href: rx.appointment_id ? `/dashboard/appointments/${rx.appointment_id}` : null,
    });
  }

  for (const pay of payments) {
    rows.push({
      kind: 'payment',
      occurred_at: pay.created_at,
      summary: `${formatAmountMinor(pay.amount_minor)} ${pay.currency} received`,
      href: null,
    });
  }

  rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return rows.slice(0, ACTIVITY_FEED_CAP);
}

// ============================================================================
// Six-visit strip
// ============================================================================

export function buildSixVisitStrip(
  appointments: Appointment[],
  prescriptions: PrescriptionWithRelations[]
): PatientSixVisitStripEntry[] {
  // Index the latest cc per appointment from the prescription rows.
  const ccByAppointment = new Map<string, string>();
  // prescriptions returned from `listPrescriptionsByPatient` are ordered
  // `created_at DESC`. Take the first (= most recent) per appointment.
  for (const rx of prescriptions) {
    if (!rx.appointment_id) continue;
    if (ccByAppointment.has(rx.appointment_id)) continue;
    if (rx.cc && rx.cc.trim()) {
      ccByAppointment.set(rx.appointment_id, rx.cc.trim());
    }
  }

  const sorted = [...appointments]
    .map((apt) => ({ apt, occurredAt: toIsoString(apt.appointment_date) }))
    .filter((entry): entry is { apt: Appointment; occurredAt: string } => !!entry.occurredAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return sorted.slice(0, SIX_VISIT_STRIP_CAP).map(({ apt, occurredAt }) => {
    const ccFromRx = ccByAppointment.get(apt.id) ?? null;
    const ccFromVisit = ccFromRx ?? apt.reason_for_visit ?? apt.notes ?? null;
    const chiefComplaint = ccFromVisit ? clampString(ccFromVisit, CHIEF_COMPLAINT_MAX_LEN) : null;
    const modality = (apt.consultation_type ?? 'in_clinic') as
      | 'text'
      | 'voice'
      | 'video'
      | 'in_clinic';
    return {
      appointment_id: apt.id,
      occurred_at: occurredAt,
      status: apt.status,
      modality,
      chief_complaint: chiefComplaint,
    };
  });
}

// ============================================================================
// Care-plan derivation (CP-1 .. CP-5 — exhaustive Phase 1 rules)
// ============================================================================

export interface CarePlanInputs {
  prescriptions: PrescriptionWithRelations[];
  appointments: Appointment[];
  vitals: PatientVitalsReading[];
  problems: ProblemListItem[];
  currentMedications: PatientCurrentMedication[];
  now: Date;
}

/**
 * Apply the five care-plan rules in priority order. Returns `null` when no
 * rule fires (i.e. the patient is up to date and the care-plan banner stays
 * hidden on the FE).
 */
export function deriveCarePlan(inputs: CarePlanInputs): PatientCarePlan | null {
  const { prescriptions, appointments, vitals, problems, currentMedications, now } = inputs;
  const overdue: string[] = [];
  const rationale: string[] = [];
  let nextStep: string | null = null;

  function setNextStepOnce(value: string): void {
    if (nextStep == null) nextStep = value;
  }

  // CP-1 (priority 1) — Follow-up overdue.
  // Trigger: latest prescription with structured follow-up whose derived
  // follow-up date is in the past AND no completed appointment after it.
  const cp1 = matchFollowUpOverdue(prescriptions, appointments, now);
  if (cp1) {
    setNextStepOnce(`Follow-up overdue since ${formatDateYmd(cp1.followUpDate)}`);
    const daysOverdue = daysBetween(now, cp1.followUpDate);
    overdue.push(
      `Follow-up due ${formatDateYmd(cp1.followUpDate)} — overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`
    );
    rationale.push(
      `Last prescription on ${formatDateYmd(cp1.prescribedAt)} scheduled a follow-up after ${cp1.followUpDescriptor}`
    );
  }

  // CP-2 (priority 2) — Next scheduled follow-up. Only contributes
  // `next_step`; does not push to overdue (it's on track).
  const cp2 = matchScheduledFollowUp(appointments, now);
  if (cp2) {
    setNextStepOnce(`Follow-up scheduled for ${formatDateYmd(cp2)}`);
  }

  // CP-3 (priority 3) — Vitals recheck pending.
  const cp3 = matchVitalsRecheck(vitals, now);
  if (cp3) {
    setNextStepOnce('BP recheck recommended');
    overdue.push(`BP recheck pending since ${formatDateYmd(cp3.lastReadingDate)}`);
    rationale.push(
      `Last BP recorded ${cp3.bpSystolic}/${cp3.bpDiastolic} on ${formatDateYmd(cp3.lastReadingDate)}; above target range`
    );
  }

  // CP-4 (priority 4) — Open episode without recent contact.
  const cp4 = matchOpenEpisodeStale(problems, appointments, now);
  if (cp4) {
    setNextStepOnce("Open episode hasn't been seen in 30+ days");
    overdue.push(
      `${cp4.label} — open since ${cp4.sinceDate ? cp4.sinceDate : 'unknown'}`
    );
    rationale.push('Episode active without a follow-up visit in 30+ days');
  }

  // CP-5 (priority 5) — Medication refill window.
  const cp5 = matchRefillWindow(currentMedications, prescriptions, now);
  if (cp5) {
    if (cp5.endDate.getTime() <= now.getTime()) {
      setNextStepOnce(`Refill likely needed in 0 days`);
      overdue.push(`${cp5.drug} refill due since ${formatDateYmd(cp5.endDate)}`);
    } else {
      const daysToEnd = daysBetween(cp5.endDate, now);
      setNextStepOnce(`Refill likely needed in ${daysToEnd} day${daysToEnd === 1 ? '' : 's'}`);
    }
    rationale.push(
      `${cp5.drug} prescribed for ${cp5.durationDays} day${cp5.durationDays === 1 ? '' : 's'}; supply ends ${formatDateYmd(cp5.endDate)}`
    );
  }

  if (nextStep == null && overdue.length === 0 && rationale.length === 0) {
    return null;
  }

  return { next_step: nextStep, overdue, rationale };
}

// --- CP rule helpers (one per rule; pure functions for unit-testing) -------

function matchFollowUpOverdue(
  prescriptions: PrescriptionWithRelations[],
  appointments: Appointment[],
  now: Date
): {
  prescribedAt: Date;
  followUpDate: Date;
  followUpDescriptor: string;
} | null {
  // Find any prescription with a follow_up_value/unit that yields a date in
  // the past, then check if a completed appointment exists after that date.
  for (const rx of prescriptions) {
    const days = followUpUnitToDays(rx.follow_up_unit, rx.follow_up_value);
    if (days == null || days <= 0) continue;
    const prescribedAt = new Date(rx.created_at);
    if (Number.isNaN(prescribedAt.getTime())) continue;
    const followUpDate = new Date(prescribedAt.getTime() + days * 24 * 60 * 60 * 1000);
    if (followUpDate.getTime() >= now.getTime()) continue;
    const hasLaterCompletedVisit = appointments.some((apt) => {
      if (apt.status !== 'completed' && apt.status !== 'confirmed') return false;
      const aptDate = apt.appointment_date instanceof Date
        ? apt.appointment_date
        : new Date(String(apt.appointment_date));
      return aptDate.getTime() >= followUpDate.getTime();
    });
    if (hasLaterCompletedVisit) continue;
    return {
      prescribedAt,
      followUpDate,
      followUpDescriptor: `${rx.follow_up_value} ${rx.follow_up_unit}`,
    };
  }
  return null;
}

function matchScheduledFollowUp(appointments: Appointment[], now: Date): Date | null {
  // Future confirmed appointment whose notes contain "follow-up", OR future
  // confirmed appointment (any text) is good enough for Phase 1 — the
  // notes filter would be too restrictive given inconsistent doctor input.
  for (const apt of appointments) {
    if (apt.status !== 'confirmed') continue;
    const aptDate = apt.appointment_date instanceof Date
      ? apt.appointment_date
      : new Date(String(apt.appointment_date));
    if (aptDate.getTime() <= now.getTime()) continue;
    const notes = (apt.notes ?? '').toLowerCase();
    if (notes.includes('follow-up') || notes.includes('followup')) {
      return aptDate;
    }
  }
  return null;
}

function matchVitalsRecheck(
  vitals: PatientVitalsReading[],
  now: Date
): { lastReadingDate: Date; bpSystolic: number; bpDiastolic: number } | null {
  // Latest BP reading high AND no vitals reading in the last 14 days.
  const latestWithBp = vitals.find(
    (v) => v.bp_systolic != null && v.bp_diastolic != null
  );
  if (!latestWithBp) return null;
  const sys = Number(latestWithBp.bp_systolic);
  const dia = Number(latestWithBp.bp_diastolic);
  if (sys < BP_HIGH_SYSTOLIC && dia < BP_HIGH_DIASTOLIC) return null;
  const recordedAt = new Date(latestWithBp.recorded_at);
  if (Number.isNaN(recordedAt.getTime())) return null;
  const daysSince = daysBetween(now, recordedAt);
  if (daysSince <= RECENT_VITALS_RECHECK_DAYS) return null;
  return { lastReadingDate: recordedAt, bpSystolic: sys, bpDiastolic: dia };
}

function matchOpenEpisodeStale(
  problems: ProblemListItem[],
  appointments: Appointment[],
  now: Date
): { label: string; sinceDate: string | null } | null {
  const cutoff = new Date(now.getTime() - OPEN_EPISODE_INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const hasRecentVisit = appointments.some((apt) => {
    const aptDate = apt.appointment_date instanceof Date
      ? apt.appointment_date
      : new Date(String(apt.appointment_date));
    return aptDate.getTime() >= cutoff.getTime();
  });
  if (hasRecentVisit) return null;
  const openEpisode = problems.find(
    (p) => p.source === 'episode' && p.episode_status !== 'closed' && p.episode_status != null
  );
  if (!openEpisode) return null;
  return { label: openEpisode.label, sinceDate: openEpisode.since_date };
}

function matchRefillWindow(
  currentMedications: PatientCurrentMedication[],
  prescriptions: PrescriptionWithRelations[],
  now: Date
): { drug: string; endDate: Date; durationDays: number } | null {
  if (currentMedications.length === 0) return null;
  const latestMed = currentMedications[0];
  const prescribedAt = new Date(latestMed.prescribed_at);
  if (Number.isNaN(prescribedAt.getTime())) return null;
  const daysSincePrescribed = daysBetween(now, prescribedAt);
  if (daysSincePrescribed < REFILL_DUE_SOON_DAYS) return null;

  // Resolve the medicine's duration if structured; otherwise fall back to
  // the default short-course length.
  const sourceRx = prescriptions.find(
    (rx) =>
      String(rx.created_at) === latestMed.prescribed_at &&
      rx.doctor_id === latestMed.prescriber_doctor_id
  );
  let durationDays: number | null = null;
  if (sourceRx) {
    const med = sourceRx.prescription_medicines?.find(
      (m) => m.medicine_name === latestMed.drug_name
    );
    if (med) {
      durationDays = medicineDurationDays({
        duration_value: med.duration_value ?? null,
        duration_unit: med.duration_unit ?? null,
      });
    }
  }
  if (durationDays == null) durationDays = REFILL_DEFAULT_COURSE_DAYS;
  if (durationDays >= REFILL_DEFAULT_COURSE_DAYS) return null;
  const endDate = new Date(prescribedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return { drug: latestMed.drug_name, endDate, durationDays };
}

// ============================================================================
// Risk-flag derivation (RF-1 .. RF-5 — exhaustive Phase 1 rules)
// ============================================================================

export interface RiskFlagInputs {
  vitals: PatientVitalsReading[];
  appointments: Appointment[];
  allergies: PatientAllergy[];
  currentMedications: PatientCurrentMedication[];
}

export function deriveRiskFlags(inputs: RiskFlagInputs): PatientRiskFlag[] {
  const { vitals, appointments, allergies, currentMedications } = inputs;
  const flags: PatientRiskFlag[] = [];

  // RF-1 (BP_TREND_RISING / warning). Last 3 BP readings all elevated.
  const bpReadings = vitals
    .filter((v) => v.bp_systolic != null && v.bp_diastolic != null)
    .slice(0, 3);
  if (
    bpReadings.length >= 3 &&
    bpReadings.every(
      (v) =>
        Number(v.bp_systolic) >= BP_HIGH_SYSTOLIC ||
        Number(v.bp_diastolic) >= BP_HIGH_DIASTOLIC
    )
  ) {
    flags.push({
      code: 'BP_TREND_RISING',
      label: 'BP > 140/90 on last 3 visits',
      severity: 'warning',
    });
  }

  // RF-2 (SPO2_LOW / danger). Latest SpO2 < 92.
  const latestSpo2 = vitals.find((v) => v.spo2 != null);
  if (latestSpo2 && Number(latestSpo2.spo2) < SPO2_LOW_THRESHOLD) {
    flags.push({
      code: 'SPO2_LOW',
      label: `SpO₂ ${latestSpo2.spo2}% on ${formatDateYmd(new Date(latestSpo2.recorded_at))}`,
      severity: 'danger',
    });
  }

  // RF-3 (NO_SHOW_PATTERN / warning). 2+ of last 4 appointments no_show.
  const recentAppointments = [...appointments]
    .sort((a, b) => {
      const ad = a.appointment_date instanceof Date
        ? a.appointment_date.getTime()
        : new Date(String(a.appointment_date)).getTime();
      const bd = b.appointment_date instanceof Date
        ? b.appointment_date.getTime()
        : new Date(String(b.appointment_date)).getTime();
      return bd - ad;
    })
    .slice(0, NO_SHOW_WINDOW);
  const noShowCount = recentAppointments.filter((a) => a.status === 'no_show').length;
  if (noShowCount >= NO_SHOW_THRESHOLD) {
    flags.push({
      code: 'NO_SHOW_PATTERN',
      label: `Missed ${noShowCount} of last ${recentAppointments.length} appointments`,
      severity: 'warning',
    });
  }

  // RF-4 (ALLERGY_ALERT / info). ≥1 active severe allergy.
  const severeAllergy = allergies.find(
    (a) => a.severity === 'severe' && a.archived_at == null
  );
  if (severeAllergy) {
    flags.push({
      code: 'ALLERGY_ALERT',
      label: `Severe allergy — ${severeAllergy.allergen}`,
      severity: 'info',
    });
  }

  // RF-5 (POLYPHARMACY / info). ≥5 active concurrent medications.
  // "Concurrent" is approximated by the current-medications list (top 20
  // most recent across the most recent prescription rows).
  if (currentMedications.length >= POLYPHARMACY_THRESHOLD) {
    flags.push({
      code: 'POLYPHARMACY',
      label: `${currentMedications.length} active medications — review for interactions`,
      severity: 'info',
    });
  }

  return flags;
}

// ============================================================================
// KPI compute + LRU cache
// ============================================================================

interface KpiCacheEntry {
  value: PatientsKpis;
  expiresAt: number;
}

const kpisCache = new Map<string, KpiCacheEntry>();

/**
 * Test-only escape hatch — flushes the per-process LRU. Production code
 * should never need this. Exported so unit tests can reset the cache
 * between cases without reaching into module state.
 */
export function __resetKpisCacheForTests(): void {
  kpisCache.clear();
}

export interface PatientsKpisResult {
  data: PatientsKpis;
  fromCache: boolean;
}

/**
 * Compute (or return cached) KPI counts for the authenticated doctor.
 *
 * Five counts, each derived from the same predicate set as the equivalent
 * segment SQL in `patient-list-segment-sql.ts`. `delta_7d` is inflow only
 * (Phase 1 limit — no historical snapshot to compute "patients who left a
 * segment").
 */
export async function computePatientsKpis(
  userId: string,
  correlationId: string
): Promise<PatientsKpisResult> {
  const cacheKey = `kpis:${userId}`;
  const now = Date.now();
  const cached = kpisCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, fromCache: true };
  }

  const admin = adminOrThrow();
  const now7dAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const now30dAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const now90dAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const now7dIso = now7dAgo.toISOString();
  const now30dIso = now30dAgo.toISOString();

  // np-10: parallel fetch wave — minimal columns; new-patient counts via head/count.
  const [
    { data: aptRows, error: aptErr },
    linkedPatientIds,
    { data: rxRows, error: rxErr },
    { data: problemRows, error: problemErr },
    duplicateGroups,
  ] = await Promise.all([
    admin
      .from('appointments')
      .select('patient_id, appointment_date')
      .eq('doctor_id', userId)
      .not('patient_id', 'is', null),
    fetchLinkedPatientIdSet(userId, correlationId),
    admin
      .from('prescriptions')
      .select('patient_id, created_at, follow_up_value, follow_up_unit')
      .eq('doctor_id', userId)
      .not('follow_up_value', 'is', null),
    admin
      .from('patient_problem_list_v')
      .select('patient_id, episode_status, since_date')
      .eq('doctor_id', userId)
      .eq('source', 'episode'),
    listPossibleDuplicates(userId, correlationId).then((r) => r.groups),
  ]);
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  if (rxErr) handleSupabaseError(rxErr, correlationId);
  if (problemErr) handleSupabaseError(problemErr, correlationId);

  // ----------------------------------------------------------------------
  // active_90d: patients with a last appointment in the last 90 days.
  // delta_7d: patients with a last appointment in the last 7 days.
  // (Requires per-patient max — minimal apt row set retained.)
  // ----------------------------------------------------------------------
  const latestAptByPatient = new Map<string, number>();
  for (const row of aptRows ?? []) {
    const r = row as { patient_id: string; appointment_date: string };
    const ts = new Date(r.appointment_date).getTime();
    if (Number.isNaN(ts)) continue;
    const existing = latestAptByPatient.get(r.patient_id);
    if (existing == null || ts > existing) {
      latestAptByPatient.set(r.patient_id, ts);
    }
  }
  let active90d = 0;
  let active7d = 0;
  for (const ts of latestAptByPatient.values()) {
    if (ts >= now90dAgo.getTime()) active90d += 1;
    if (ts >= now7dAgo.getTime()) active7d += 1;
  }

  // ----------------------------------------------------------------------
  // new_30d / new_7d: DB-side count (PostgREST head/count — NP-Q8).
  // ----------------------------------------------------------------------
  let new30d = 0;
  let new7d = 0;
  if (linkedPatientIds.size > 0) {
    const linkedIds = Array.from(linkedPatientIds);
    const [{ count: count30, error: err30 }, { count: count7, error: err7 }] =
      await Promise.all([
        admin
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .in('id', linkedIds)
          .gte('created_at', now30dIso),
        admin
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .in('id', linkedIds)
          .gte('created_at', now7dIso),
      ]);
    if (err30) handleSupabaseError(err30, correlationId);
    if (err7) handleSupabaseError(err7, correlationId);
    new30d = count30 ?? 0;
    new7d = count7 ?? 0;
  }

  // ----------------------------------------------------------------------
  // followup_overdue: same predicate as the `at-risk-followup` segment.
  // Uses shared aptRows + minimal rxRows (cross-row logic stays in TS).
  // ----------------------------------------------------------------------
  const followupOverduePatients = new Set<string>();
  const followupOverduePatients7d = new Set<string>();
  // Map from patient_id → array of {createdAt} for the inflow check.
  for (const row of (rxRows ?? []) as Array<{
    patient_id: string | null;
    created_at: string;
    follow_up_value: number | null;
    follow_up_unit: string | null;
  }>) {
    if (!row.patient_id) continue;
    const days = followUpUnitToDays(row.follow_up_unit, row.follow_up_value);
    if (days == null || days <= 0) continue;
    const prescribedAt = new Date(row.created_at);
    if (Number.isNaN(prescribedAt.getTime())) continue;
    const followUpDate = new Date(prescribedAt.getTime() + days * 24 * 60 * 60 * 1000);
    if (followUpDate.getTime() >= now) continue;
    // Check whether the patient has a later qualifying appointment.
    let hasLater = false;
    for (const apt of aptRows ?? []) {
      const a = apt as { patient_id: string; appointment_date: string };
      if (a.patient_id !== row.patient_id) continue;
      const aptTs = new Date(a.appointment_date).getTime();
      if (aptTs >= followUpDate.getTime()) {
        hasLater = true;
        break;
      }
    }
    if (hasLater) continue;
    followupOverduePatients.add(row.patient_id);
    // Inflow: derived follow-up date crossed into the past within the last 7d.
    if (followUpDate.getTime() >= now7dAgo.getTime()) {
      followupOverduePatients7d.add(row.patient_id);
    }
  }

  // ----------------------------------------------------------------------
  // open_episodes: distinct patient_ids with episode rows not closed.
  // Minimal column fetch (distinct semantics require patient_id set in TS).
  // ----------------------------------------------------------------------
  const openEpisodePatients = new Set<string>();
  const openEpisodePatients7d = new Set<string>();
  for (const row of (problemRows ?? []) as Array<{
    patient_id: string;
    episode_status: string | null;
    since_date: string | null;
  }>) {
    if (row.episode_status === 'closed') continue;
    openEpisodePatients.add(row.patient_id);
    if (row.since_date) {
      const ts = new Date(row.since_date).getTime();
      if (!Number.isNaN(ts) && ts >= now7dAgo.getTime()) {
        openEpisodePatients7d.add(row.patient_id);
      }
    }
  }

  // ----------------------------------------------------------------------
  // possible_duplicates: count of duplicate GROUPS (not patients).
  // (Fetched in parallel wave above.)
  // ----------------------------------------------------------------------

  const result: PatientsKpis = {
    active_90d: { count: active90d, delta_7d: active7d },
    new_30d: { count: new30d, delta_7d: new7d },
    followup_overdue: {
      count: followupOverduePatients.size,
      delta_7d: followupOverduePatients7d.size,
    },
    open_episodes: {
      count: openEpisodePatients.size,
      delta_7d: openEpisodePatients7d.size,
    },
    possible_duplicates: { count: duplicateGroups.length, delta_7d: 0 },
    cache_ttl_seconds: KPI_CACHE_TTL_SECONDS,
  };

  kpisCache.set(cacheKey, {
    value: result,
    expiresAt: now + KPI_CACHE_TTL_SECONDS * 1000,
  });

  return { data: result, fromCache: false };
}

async function fetchLinkedPatientIdSet(
  doctorId: string,
  correlationId: string
): Promise<Set<string>> {
  const admin = adminOrThrow();
  const ids = new Set<string>();
  const [{ data: aptRows, error: aptErr }, { data: convRows, error: convErr }] =
    await Promise.all([
      admin
        .from('appointments')
        .select('patient_id')
        .eq('doctor_id', doctorId)
        .not('patient_id', 'is', null),
      admin
        .from('conversations')
        .select('patient_id')
        .eq('doctor_id', doctorId),
    ]);
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  if (convErr) handleSupabaseError(convErr, correlationId);
  for (const row of aptRows ?? []) {
    const pid = (row as { patient_id: string | null }).patient_id;
    if (pid) ids.add(pid);
  }
  for (const row of convRows ?? []) {
    ids.add((row as { patient_id: string }).patient_id);
  }
  return ids;
}

// Re-export for unit tests that need to inspect the cache window.
export { KPI_CACHE_TTL_SECONDS };

// Re-export the Prescription helper alias for tests so they can type the
// `created_at` cast neatly.
export type { Prescription };
