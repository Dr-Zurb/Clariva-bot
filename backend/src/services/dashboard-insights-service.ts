/**
 * Dashboard Insights Service (insights-v1 · ins-01 / ins-03).
 *
 * Read-only, doctor-scoped, range-aware aggregations for the Insights
 * surface. Mirrors the read-service shape of `appointment-service.ts`
 * (service-role admin client + explicit `doctor_id` filter; RLS is a
 * belt-and-suspenders backstop).
 *
 * Privacy invariants (INS-D2):
 *   - Returns AGGREGATES ONLY — counts, sums, rates. Never raw `payments`
 *     rows or patient/appointment/conversation rows leave this module.
 *   - `doctor_id` is always the authenticated caller's id (threaded from
 *     `req.user.id` at the controller); nothing is trusted from the request.
 *   - No PII/PHI in logs — only `doctorId`, range, and non-identifying
 *     metadata.
 *
 * Time axis: every metric is anchored to a single window
 * `[from 00:00:00Z, to+1day 00:00:00Z)` (UTC day boundaries, matching the
 * `hasAppointmentOnDate` precedent in `appointment-service.ts`):
 *   - `volume` / `noShowRate` / `revenue` / funnel appointments key off
 *     `appointments.appointment_date`.
 *   - `consult.*` keys off `consultation_sessions.scheduled_start_at`.
 *   - Funnel slots key off `slot_selections.created_at`.
 *   - Review SLA keys off `service_staff_review_requests.created_at`.
 * Payments join `payments → appointments` (payments has no `doctor_id`) via a
 * PostgREST inner-embed so the doctor-scope + range filter run server-side.
 *
 * @see backend/src/services/appointment-service.ts (read-service pattern)
 * @see backend/migrations/008_payments.sql
 * @see backend/migrations/014_slot_selections_and_patients_email.sql
 * @see backend/migrations/040_service_staff_review_requests.sql
 * @see backend/migrations/049_consultation_sessions.sql
 */

import { getSupabaseAdminClient } from '../config/database';
import { razorpayConfig } from '../config/payment';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess } from '../utils/audit-logger';

// ============================================================================
// Public types (Tier-1 practice-health DTO)
// ============================================================================

export interface PracticeHealthRange {
  from: string;
  to: string;
}

export interface PracticeHealthVolume {
  total: number;
  byStatus: Record<string, number>;
  byModality: Record<string, number>;
}

export interface PracticeHealthConsult {
  /** sessions `ended` ÷ sessions scheduled-in-range (0 on empty). */
  completionRate: number;
  /** Median of (`actual_ended_at` − `actual_started_at`) in seconds; 0 on empty. */
  medianDurationSeconds: number;
}

export interface PracticeHealth {
  range: PracticeHealthRange;
  volume: PracticeHealthVolume;
  /** `no_show` ÷ (`confirmed` + `completed` + `no_show`); 0 on empty (0..1). */
  noShowRate: number;
  /** Σ captured `payments.amount_minor` for the dominant currency. */
  revenueCapturedMinor: number;
  /** Dominant captured currency (falls back to platform default when none). */
  currency: string;
  /**
   * Set to `true` only when captured payments span more than one currency.
   * In that case `revenueCapturedMinor` is the dominant currency's sum (a
   * cross-currency sum would be meaningless) — the flag tells the client the
   * figure is partial.
   */
  mixedCurrency?: boolean;
  consult: PracticeHealthConsult;
}

export interface GetPracticeHealthInput {
  doctorId: string;
  /** Inclusive start day, `YYYY-MM-DD` (validated at the controller). */
  from: string;
  /** Inclusive end day, `YYYY-MM-DD` (validated at the controller). */
  to: string;
  correlationId: string;
}

// ============================================================================
// Public types (Tier-2 booking funnel + review SLA)
// ============================================================================

export interface BookingFunnelStages {
  /** `slot_selections` created in range. */
  slotsSelected: number;
  /** Of those, rows with `consumed_at` set. */
  slotsConsumed: number;
  /** Captured payments linked to appointments in range. */
  paymentsCaptured: number;
  /** Appointments with status `confirmed` or `completed` in range. */
  appointmentsConfirmed: number;
}

export interface BookingReviewSla {
  /** Review requests still `pending` that were created in range. */
  pending: number;
  /** Median (`resolved_at` − `created_at`) seconds for resolved rows; 0 on empty. */
  medianResolutionSeconds: number;
  /**
   * Count of reviews that breached SLA: resolved after `sla_deadline_at`,
   * or still pending past `sla_deadline_at` (evaluated at read time).
   */
  breachedSla: number;
}

export interface BookingFunnel {
  range: PracticeHealthRange;
  funnel: BookingFunnelStages;
  review: BookingReviewSla;
}

export type GetBookingFunnelInput = GetPracticeHealthInput;

// ============================================================================
// Public types (Tier-3 clinical mix — de-identified)
// ============================================================================

/**
 * One ranked aggregate row. De-identified: label (+ optional ICD code) and
 * count only — never patient ids, notes, or free-text clinical narrative.
 */
export interface ClinicalMixItem {
  label: string;
  count: number;
  /** Optional ICD-11 (MMS) code when the label came from structured diagnoses_json. */
  code?: string;
}

export interface ClinicalMix {
  range: PracticeHealthRange;
  topDiagnoses: ClinicalMixItem[];
  topMedicines: ClinicalMixItem[];
  topInvestigations: ClinicalMixItem[];
  /**
   * Which diagnosis source produced `topDiagnoses`:
   *   - `diagnoses_json` — structured prescription rows (preferred, batch Q3)
   *   - `diagnosis_tags` — appointment tag fallback when no structured labels
   *   - `none`           — empty range / no labels
   */
  diagnosesSource: 'diagnoses_json' | 'diagnosis_tags' | 'none';
}

export interface GetClinicalMixInput extends GetPracticeHealthInput {
  /** Top-N cap (1–50). Default 10. */
  limit: number;
}

export const CLINICAL_MIX_DEFAULT_LIMIT = 10;
export const CLINICAL_MIX_MAX_LIMIT = 50;

// ============================================================================
// Public types (Tier-4 telehealth quality)
// ============================================================================

export interface TelehealthModalityMix {
  text: number;
  voice: number;
  video: number;
}

export interface TelehealthSwitches {
  upgrades: number;
  downgrades: number;
}

/**
 * Aggregate call-quality summary. Null fields mean "no samples in range"
 * (UI renders `—`). Percentiles computed in-service (nearest-rank) over
 * fetched `rtt_ms` / `packet_loss_pct` columns — no SQL RPC / migration.
 */
export interface CallQualitySummary {
  /** p50 of `rtt_ms` (ms); null when no RTT samples. */
  p50Rtt: number | null;
  /** p95 of `rtt_ms` (ms); null when no RTT samples. */
  p95Rtt: number | null;
  /** Mean of `packet_loss_pct` (0..100); null when no loss samples. */
  avgPacketLoss: number | null;
}

export interface TelehealthQuality {
  range: PracticeHealthRange;
  modalityMix: TelehealthModalityMix;
  switches: TelehealthSwitches;
  /**
   * Sessions with `actual_started_at` AND `patient_joined_at` ÷ sessions
   * with `actual_started_at` (0 on empty).
   */
  joinSuccessRate: number;
  quality: {
    video: CallQualitySummary;
    voice: CallQualitySummary;
  };
}

export type GetTelehealthQualityInput = GetPracticeHealthInput;

// ============================================================================
// Internal helpers
// ============================================================================

/** UTC start-of-day ISO for a `YYYY-MM-DD` string. */
function dayStartUtcIso(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

/** UTC start-of-day ISO for the day AFTER a `YYYY-MM-DD` string (exclusive upper bound). */
function dayAfterUtcIso(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1));
  return next.toISOString();
}

/** Median of a numeric list; returns 0 for an empty list. Even counts average the middle two. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid]!;
  }
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Trim + collapse internal whitespace; empty → null. */
function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

/** Case-fold key for counting (display label stays the first-seen trimmed form). */
function labelKey(label: string): string {
  return label.toLowerCase();
}

interface CountBucket {
  label: string;
  count: number;
  code?: string;
}

/** Increment a label bucket; keeps the first non-empty ICD code seen. */
function bumpCount(
  map: Map<string, CountBucket>,
  label: string,
  code?: string | null
): void {
  const key = labelKey(label);
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    if (!existing.code && code?.trim()) {
      existing.code = code.trim();
    }
    return;
  }
  const bucket: CountBucket = { label, count: 1 };
  if (code?.trim()) {
    bucket.code = code.trim();
  }
  map.set(key, bucket);
}

/** Top-N by count DESC, then label ASC (deterministic). */
function topNFromCounts(
  map: Map<string, CountBucket>,
  limit: number
): ClinicalMixItem[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((b) => {
      const item: ClinicalMixItem = { label: b.label, count: b.count };
      if (b.code) item.code = b.code;
      return item;
    });
}

/**
 * Extract diagnosis labels (+ optional codes) from `diagnoses_json`.
 * Reads ONLY `label` / `code` — never `note` or other free-text fields.
 */
function extractDiagnosesFromJson(raw: unknown): Array<{ label: string; code?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; code?: string }> = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const label = normalizeLabel(obj.label);
    if (!label) continue;
    const code =
      typeof obj.code === 'string' && obj.code.trim()
        ? obj.code.trim()
        : undefined;
    out.push(code ? { label, code } : { label });
  }
  return out;
}

/**
 * Extract investigation labels from `investigations_orders_json`.
 * Reads ONLY top-level `label` — never requisition.indication or notes.
 */
function extractInvestigationLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const label = normalizeLabel((row as Record<string, unknown>).label);
    if (label) out.push(label);
  }
  return out;
}

/**
 * Nearest-rank percentile over a numeric list (inclusive).
 * Returns null for an empty list. `p` in 0..1 (e.g. 0.5, 0.95).
 *
 * Choice (ins-05): computed in-service after a doctor-scoped sample fetch
 * rather than `percentile_cont` SQL — keeps the slice migration-free and
 * matches how we already aggregate other Insights metrics in JS.
 */
function percentileNearestRank(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length) - 1;
  const idx = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[idx]!;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function summarizeCallQuality(
  samples: Array<{ rtt_ms: number | string | null; packet_loss_pct: number | string | null }>
): CallQualitySummary {
  const rtts: number[] = [];
  const losses: number[] = [];
  for (const s of samples) {
    const rtt = Number(s.rtt_ms);
    if (Number.isFinite(rtt)) rtts.push(rtt);
    const loss = Number(s.packet_loss_pct);
    if (Number.isFinite(loss)) losses.push(loss);
  }
  return {
    p50Rtt: percentileNearestRank(rtts, 0.5),
    p95Rtt: percentileNearestRank(rtts, 0.95),
    avgPacketLoss: mean(losses),
  };
}

interface AppointmentAggRow {
  status: string | null;
  consultation_type: string | null;
}

interface CapturedPaymentRow {
  amount_minor: number | string | null;
  currency: string | null;
}

interface ConsultationSessionAggRow {
  status: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
}

// ============================================================================
// Public: getPracticeHealth
// ============================================================================

/**
 * Compute the Tier-1 practice-health aggregates for one doctor over a
 * validated `[from, to]` window. Read-only; aggregate-only.
 *
 * @throws ValidationError if `doctorId` is missing.
 * @throws InternalError   if the service-role client is unavailable.
 */
export async function getPracticeHealth(
  input: GetPracticeHealthInput
): Promise<PracticeHealth> {
  const { doctorId, from, to, correlationId } = input;

  if (!doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for insights');
  }

  const fromStart = dayStartUtcIso(from);
  const toExclusive = dayAfterUtcIso(to);

  // --------------------------------------------------------------------------
  // 1. Volume + no-show rate (appointments in range, doctor-scoped).
  // --------------------------------------------------------------------------
  const { data: apptData, error: apptError } = await admin
    .from('appointments')
    .select('status, consultation_type')
    .eq('doctor_id', doctorId)
    .gte('appointment_date', fromStart)
    .lt('appointment_date', toExclusive);

  if (apptError) {
    handleSupabaseError(apptError, correlationId);
  }

  const appointments = (apptData ?? []) as AppointmentAggRow[];
  const byStatus: Record<string, number> = {};
  const byModality: Record<string, number> = {};
  for (const row of appointments) {
    const status = row.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const modality = row.consultation_type ?? 'unknown';
    byModality[modality] = (byModality[modality] ?? 0) + 1;
  }
  const total = appointments.length;

  const noShow = byStatus['no_show'] ?? 0;
  const noShowDenominator =
    (byStatus['confirmed'] ?? 0) + (byStatus['completed'] ?? 0) + noShow;
  const noShowRate = noShowDenominator > 0 ? noShow / noShowDenominator : 0;

  // --------------------------------------------------------------------------
  // 2. Revenue captured (payments → appointments inner-embed for doctor-scope
  //    + range; sum only status='captured'). No per-transaction data escapes.
  // --------------------------------------------------------------------------
  const { data: payData, error: payError } = await admin
    .from('payments')
    .select('amount_minor, currency, appointments!inner(doctor_id, appointment_date)')
    .eq('status', 'captured')
    .eq('appointments.doctor_id', doctorId)
    .gte('appointments.appointment_date', fromStart)
    .lt('appointments.appointment_date', toExclusive);

  if (payError) {
    handleSupabaseError(payError, correlationId);
  }

  const capturedPayments = (payData ?? []) as CapturedPaymentRow[];
  const sumByCurrency = new Map<string, number>();
  for (const p of capturedPayments) {
    const currency = (p.currency || razorpayConfig.defaultCurrency)
      .toString()
      .toUpperCase();
    const amount = Number(p.amount_minor ?? 0);
    if (!Number.isFinite(amount)) continue;
    sumByCurrency.set(currency, (sumByCurrency.get(currency) ?? 0) + amount);
  }

  let currency: string = razorpayConfig.defaultCurrency;
  let revenueCapturedMinor = 0;
  const mixedCurrency = sumByCurrency.size > 1;
  if (sumByCurrency.size > 0) {
    // Dominant = highest total; deterministic tiebreak on currency code.
    const [dominant] = [...sumByCurrency.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    currency = dominant![0];
    revenueCapturedMinor = dominant![1];
  }
  if (mixedCurrency) {
    logger.warn(
      {
        correlationId,
        doctorId,
        currencyCount: sumByCurrency.size,
        dominantCurrency: currency,
        context: 'insights_revenue',
      },
      'insights: captured payments span multiple currencies; returning dominant currency sum'
    );
  }

  // --------------------------------------------------------------------------
  // 3. Consult completion rate + median duration (sessions scheduled in range).
  // --------------------------------------------------------------------------
  const { data: sessData, error: sessError } = await admin
    .from('consultation_sessions')
    .select('status, actual_started_at, actual_ended_at')
    .eq('doctor_id', doctorId)
    .gte('scheduled_start_at', fromStart)
    .lt('scheduled_start_at', toExclusive);

  if (sessError) {
    handleSupabaseError(sessError, correlationId);
  }

  const sessions = (sessData ?? []) as ConsultationSessionAggRow[];
  const scheduledCount = sessions.length;
  const endedCount = sessions.filter((s) => s.status === 'ended').length;
  const completionRate = scheduledCount > 0 ? endedCount / scheduledCount : 0;

  const durationsSeconds: number[] = [];
  for (const s of sessions) {
    if (!s.actual_started_at || !s.actual_ended_at) continue;
    const startedMs = new Date(s.actual_started_at).getTime();
    const endedMs = new Date(s.actual_ended_at).getTime();
    if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) continue;
    if (endedMs <= startedMs) continue;
    durationsSeconds.push(Math.round((endedMs - startedMs) / 1000));
  }
  const medianDurationSeconds = median(durationsSeconds);

  // Aggregate-only read of doctor-owned money + volume data — audit the access
  // (no PII in the audit metadata; resourceId is the doctor's own id).
  await logDataAccess(correlationId, doctorId, 'practice_insights', doctorId);

  const result: PracticeHealth = {
    range: { from, to },
    volume: { total, byStatus, byModality },
    noShowRate,
    revenueCapturedMinor,
    currency,
    consult: { completionRate, medianDurationSeconds },
  };
  if (mixedCurrency) {
    result.mixedCurrency = true;
  }
  return result;
}

// ============================================================================
// Public: getBookingFunnel (ins-03)
// ============================================================================

interface SlotSelectionAggRow {
  consumed_at: string | null;
}

interface PaymentCountRow {
  id: string;
}

interface ReviewAggRow {
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  sla_deadline_at: string | null;
}

/**
 * Compute the Tier-2 booking-bot funnel + booking-review SLA aggregates
 * for one doctor over a validated `[from, to]` window. Read-only;
 * aggregate-only — never returns raw payment / patient / conversation rows.
 *
 * @throws ValidationError if `doctorId` is missing.
 * @throws InternalError   if the service-role client is unavailable.
 */
export async function getBookingFunnel(
  input: GetBookingFunnelInput
): Promise<BookingFunnel> {
  const { doctorId, from, to, correlationId } = input;

  if (!doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for insights');
  }

  const fromStart = dayStartUtcIso(from);
  const toExclusive = dayAfterUtcIso(to);
  const nowMs = Date.now();

  // --------------------------------------------------------------------------
  // 1. Slot funnel stages (created in range).
  // --------------------------------------------------------------------------
  const { data: slotData, error: slotError } = await admin
    .from('slot_selections')
    .select('consumed_at')
    .eq('doctor_id', doctorId)
    .gte('created_at', fromStart)
    .lt('created_at', toExclusive);

  if (slotError) {
    handleSupabaseError(slotError, correlationId);
  }

  const slots = (slotData ?? []) as SlotSelectionAggRow[];
  const slotsSelected = slots.length;
  const slotsConsumed = slots.filter((s) => s.consumed_at != null).length;

  // --------------------------------------------------------------------------
  // 2. Payments captured (count only — no amounts leave the service).
  // --------------------------------------------------------------------------
  const { data: payData, error: payError } = await admin
    .from('payments')
    .select('id, appointments!inner(doctor_id, appointment_date)')
    .eq('status', 'captured')
    .eq('appointments.doctor_id', doctorId)
    .gte('appointments.appointment_date', fromStart)
    .lt('appointments.appointment_date', toExclusive);

  if (payError) {
    handleSupabaseError(payError, correlationId);
  }

  const paymentsCaptured = ((payData ?? []) as PaymentCountRow[]).length;

  // --------------------------------------------------------------------------
  // 3. Appointments confirmed/completed in range.
  // --------------------------------------------------------------------------
  const { data: apptData, error: apptError } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['confirmed', 'completed'])
    .gte('appointment_date', fromStart)
    .lt('appointment_date', toExclusive);

  if (apptError) {
    handleSupabaseError(apptError, correlationId);
  }

  const appointmentsConfirmed = (apptData ?? []).length;

  // --------------------------------------------------------------------------
  // 4. Booking-review SLA (requests created in range).
  // --------------------------------------------------------------------------
  const { data: reviewData, error: reviewError } = await admin
    .from('service_staff_review_requests')
    .select('status, created_at, resolved_at, sla_deadline_at')
    .eq('doctor_id', doctorId)
    .gte('created_at', fromStart)
    .lt('created_at', toExclusive);

  if (reviewError) {
    handleSupabaseError(reviewError, correlationId);
  }

  const reviews = (reviewData ?? []) as ReviewAggRow[];
  let pending = 0;
  let breachedSla = 0;
  const resolutionSeconds: number[] = [];

  for (const row of reviews) {
    const status = row.status ?? '';
    const isPending = status === 'pending';
    if (isPending) pending += 1;

    const deadlineMs = row.sla_deadline_at
      ? new Date(row.sla_deadline_at).getTime()
      : NaN;
    const resolvedMs = row.resolved_at
      ? new Date(row.resolved_at).getTime()
      : NaN;
    const createdMs = row.created_at ? new Date(row.created_at).getTime() : NaN;

    if (Number.isFinite(resolvedMs) && Number.isFinite(createdMs) && resolvedMs > createdMs) {
      resolutionSeconds.push(Math.round((resolvedMs - createdMs) / 1000));
    }

    // Breach: resolved after deadline, or still pending past deadline.
    if (Number.isFinite(deadlineMs)) {
      if (Number.isFinite(resolvedMs) && resolvedMs > deadlineMs) {
        breachedSla += 1;
      } else if (isPending && nowMs > deadlineMs) {
        breachedSla += 1;
      }
    }
  }

  const medianResolutionSeconds = median(resolutionSeconds);

  await logDataAccess(correlationId, doctorId, 'booking_funnel_insights', doctorId);

  return {
    range: { from, to },
    funnel: {
      slotsSelected,
      slotsConsumed,
      paymentsCaptured,
      appointmentsConfirmed,
    },
    review: {
      pending,
      medianResolutionSeconds,
      breachedSla,
    },
  };
}

// ============================================================================
// Public: getClinicalMix (ins-04)
// ============================================================================

interface PrescriptionClinicalRow {
  diagnoses_json: unknown;
  investigations_orders_json: unknown;
}

interface MedicineNameRow {
  medicine_name: string | null;
}

interface AppointmentTagsRow {
  diagnosis_tags: unknown;
}

/**
 * Compute de-identified top-N clinical-mix aggregates for one doctor over a
 * validated `[from, to]` window.
 *
 * Diagnosis source pick (batch open Q3):
 *   1. Prefer structured `prescriptions.diagnoses_json` (`label` + optional
 *      ICD `code`) for prescriptions created in range.
 *   2. Fall back to `appointments.diagnosis_tags[]` when no structured labels
 *      exist in the window.
 *
 * Privacy: response rows are `{ label, count, code? }` ONLY — never patient
 * ids, diagnosis notes, investigation indications, or free-text narrative.
 *
 * @throws ValidationError if `doctorId` is missing or `limit` is out of range.
 * @throws InternalError   if the service-role client is unavailable.
 */
export async function getClinicalMix(
  input: GetClinicalMixInput
): Promise<ClinicalMix> {
  const { doctorId, from, to, correlationId } = input;
  const limit = input.limit;

  if (!doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > CLINICAL_MIX_MAX_LIMIT
  ) {
    throw new ValidationError(
      `limit must be an integer between 1 and ${CLINICAL_MIX_MAX_LIMIT}`
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for insights');
  }

  const fromStart = dayStartUtcIso(from);
  const toExclusive = dayAfterUtcIso(to);

  // --------------------------------------------------------------------------
  // 1. Prescriptions in range — diagnoses_json + investigations_orders_json.
  // --------------------------------------------------------------------------
  const { data: rxData, error: rxError } = await admin
    .from('prescriptions')
    .select('diagnoses_json, investigations_orders_json')
    .eq('doctor_id', doctorId)
    .gte('created_at', fromStart)
    .lt('created_at', toExclusive);

  if (rxError) {
    handleSupabaseError(rxError, correlationId);
  }

  const prescriptions = (rxData ?? []) as PrescriptionClinicalRow[];
  const diagnosisCounts = new Map<string, CountBucket>();
  const investigationCounts = new Map<string, CountBucket>();

  for (const rx of prescriptions) {
    for (const dx of extractDiagnosesFromJson(rx.diagnoses_json)) {
      bumpCount(diagnosisCounts, dx.label, dx.code);
    }
    for (const label of extractInvestigationLabels(rx.investigations_orders_json)) {
      bumpCount(investigationCounts, label);
    }
  }

  // --------------------------------------------------------------------------
  // 2. Diagnosis fallback — appointments.diagnosis_tags when no structured Dx.
  // --------------------------------------------------------------------------
  let diagnosesSource: ClinicalMix['diagnosesSource'] = 'none';
  if (diagnosisCounts.size > 0) {
    diagnosesSource = 'diagnoses_json';
  } else {
    const { data: apptData, error: apptError } = await admin
      .from('appointments')
      .select('diagnosis_tags')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', fromStart)
      .lt('appointment_date', toExclusive);

    if (apptError) {
      handleSupabaseError(apptError, correlationId);
    }

    for (const row of (apptData ?? []) as AppointmentTagsRow[]) {
      const tags = Array.isArray(row.diagnosis_tags)
        ? (row.diagnosis_tags as unknown[])
        : [];
      for (const tag of tags) {
        const label = normalizeLabel(tag);
        if (label) bumpCount(diagnosisCounts, label);
      }
    }
    if (diagnosisCounts.size > 0) {
      diagnosesSource = 'diagnosis_tags';
    }
  }

  // --------------------------------------------------------------------------
  // 3. Medicines — prescription_medicines joined to prescriptions in range.
  // --------------------------------------------------------------------------
  const { data: medData, error: medError } = await admin
    .from('prescription_medicines')
    .select('medicine_name, prescriptions!inner(doctor_id, created_at)')
    .eq('prescriptions.doctor_id', doctorId)
    .gte('prescriptions.created_at', fromStart)
    .lt('prescriptions.created_at', toExclusive);

  if (medError) {
    handleSupabaseError(medError, correlationId);
  }

  const medicineCounts = new Map<string, CountBucket>();
  for (const row of (medData ?? []) as MedicineNameRow[]) {
    const label = normalizeLabel(row.medicine_name);
    if (label) bumpCount(medicineCounts, label);
  }

  await logDataAccess(correlationId, doctorId, 'clinical_mix_insights', doctorId);

  return {
    range: { from, to },
    topDiagnoses: topNFromCounts(diagnosisCounts, limit),
    topMedicines: topNFromCounts(medicineCounts, limit),
    topInvestigations: topNFromCounts(investigationCounts, limit),
    diagnosesSource,
  };
}

// ============================================================================
// Public: getTelehealthQuality (ins-05)
// ============================================================================

interface TelehealthSessionRow {
  modality: string | null;
  actual_started_at: string | null;
  patient_joined_at: string | null;
  upgrade_count: number | string | null;
  downgrade_count: number | string | null;
}

interface CallQualitySampleRow {
  rtt_ms: number | string | null;
  packet_loss_pct: number | string | null;
}

/**
 * Compute Tier-4 telehealth aggregates for one doctor over a validated
 * `[from, to]` window: modality mix, mid-call switch sums, join-success
 * rate, and video/voice call-quality percentiles.
 *
 * Quality samples are doctor-scoped via
 * `video_call_quality` / `voice_call_quality` → `consultation_sessions`
 * inner-embed (sessions scheduled in range). Percentiles are nearest-rank
 * in-service (see `percentileNearestRank`) — no SQL RPC / migration.
 *
 * Privacy: aggregates / percentiles only — never per-session or per-sample
 * rows leave this module.
 *
 * @throws ValidationError if `doctorId` is missing.
 * @throws InternalError   if the service-role client is unavailable.
 */
export async function getTelehealthQuality(
  input: GetTelehealthQualityInput
): Promise<TelehealthQuality> {
  const { doctorId, from, to, correlationId } = input;

  if (!doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for insights');
  }

  const fromStart = dayStartUtcIso(from);
  const toExclusive = dayAfterUtcIso(to);

  // --------------------------------------------------------------------------
  // 1. Sessions in range — modality mix, switches, join success.
  // --------------------------------------------------------------------------
  const { data: sessData, error: sessError } = await admin
    .from('consultation_sessions')
    .select(
      'modality, actual_started_at, patient_joined_at, upgrade_count, downgrade_count'
    )
    .eq('doctor_id', doctorId)
    .gte('scheduled_start_at', fromStart)
    .lt('scheduled_start_at', toExclusive);

  if (sessError) {
    handleSupabaseError(sessError, correlationId);
  }

  const sessions = (sessData ?? []) as TelehealthSessionRow[];
  const modalityMix: TelehealthModalityMix = { text: 0, voice: 0, video: 0 };
  let upgrades = 0;
  let downgrades = 0;
  let started = 0;
  let joined = 0;

  for (const s of sessions) {
    const modality = s.modality;
    if (modality === 'text' || modality === 'voice' || modality === 'video') {
      modalityMix[modality] += 1;
    }

    const up = Number(s.upgrade_count ?? 0);
    const down = Number(s.downgrade_count ?? 0);
    if (Number.isFinite(up)) upgrades += up;
    if (Number.isFinite(down)) downgrades += down;

    if (s.actual_started_at) {
      started += 1;
      if (s.patient_joined_at) joined += 1;
    }
  }

  const joinSuccessRate = started > 0 ? joined / started : 0;

  // --------------------------------------------------------------------------
  // 2. Quality samples for sessions scheduled in range (doctor-scoped join).
  // --------------------------------------------------------------------------
  const { data: videoData, error: videoError } = await admin
    .from('video_call_quality')
    .select(
      'rtt_ms, packet_loss_pct, consultation_sessions!inner(doctor_id, scheduled_start_at)'
    )
    .eq('consultation_sessions.doctor_id', doctorId)
    .gte('consultation_sessions.scheduled_start_at', fromStart)
    .lt('consultation_sessions.scheduled_start_at', toExclusive);

  if (videoError) {
    handleSupabaseError(videoError, correlationId);
  }

  const { data: voiceData, error: voiceError } = await admin
    .from('voice_call_quality')
    .select(
      'rtt_ms, packet_loss_pct, consultation_sessions!inner(doctor_id, scheduled_start_at)'
    )
    .eq('consultation_sessions.doctor_id', doctorId)
    .gte('consultation_sessions.scheduled_start_at', fromStart)
    .lt('consultation_sessions.scheduled_start_at', toExclusive);

  if (voiceError) {
    handleSupabaseError(voiceError, correlationId);
  }

  const videoQuality = summarizeCallQuality(
    (videoData ?? []) as CallQualitySampleRow[]
  );
  const voiceQuality = summarizeCallQuality(
    (voiceData ?? []) as CallQualitySampleRow[]
  );

  await logDataAccess(correlationId, doctorId, 'telehealth_insights', doctorId);

  return {
    range: { from, to },
    modalityMix,
    switches: { upgrades, downgrades },
    joinSuccessRate,
    quality: { video: videoQuality, voice: voiceQuality },
  };
}
