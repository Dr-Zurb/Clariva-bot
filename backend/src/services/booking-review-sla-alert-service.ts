/**
 * Booking-review SLA alert scan (Alerts v2 · alr2-04 / ALR2-D2 / OQ-2).
 *
 * Emits `booking_review_sla_breach` dashboard events for doctor-scoped
 * `service_staff_review_requests` that are still `pending` past
 * `sla_deadline_at`. This is a **notify-only** job — it never mutates
 * the review row. The SLA timeout closer
 * (`runStaffReviewTimeoutJob`) owns marking `sla_breached_at` / DMs.
 *
 * Mounted at `POST /cron/booking-review-sla-alerts` (CRON_SECRET).
 * Schedule externally every ~15 min alongside `staff-review-timeouts`.
 *
 * Idempotency: `dedupeKey = review_request_id` via
 * `insertDashboardEvent` + `uq_doctor_dashboard_events_dedupe`.
 *
 * @see docs/Work/Daily-plans/July 2026/21-07-2026/alerts-v2/Tasks/task-alr2-04-emitter-sla-breach-scan.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { insertDashboardEvent } from './dashboard-events-service';

/** Cap per tick — mirrors `runStaffReviewTimeoutJob` (50). */
const BATCH_SIZE_CAP = 50;

export interface BookingReviewSlaAlertJobResult {
  /** Rows matched by the breach predicate this tick. */
  scanned: number;
  /** New feed rows inserted. */
  inserted: number;
  /** Unique-index / pre-existing dedupe hits. */
  deduped: number;
  /** Per-row insert failures (non-fatal). */
  errors: number;
}

interface BreachedReviewRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  created_at: string;
  sla_deadline_at: string;
}

function emptyResult(): BookingReviewSlaAlertJobResult {
  return { scanned: 0, inserted: 0, deduped: 0, errors: 0 };
}

/**
 * Resolve `patients.name` (Decision-4 bar). Empty → UI "A patient".
 * Never throws.
 */
async function resolvePatientDisplayName(
  admin: SupabaseClient,
  patientId: string | null,
  correlationId: string,
): Promise<string> {
  if (!patientId) return '';
  try {
    const { data: patient, error } = await admin
      .from('patients')
      .select('name')
      .eq('id', patientId)
      .maybeSingle();
    if (error) {
      logger.warn(
        { correlationId, patientId, error: error.message },
        'booking-review-sla-alert: patient name lookup failed',
      );
      return '';
    }
    return ((patient as { name: string | null } | null)?.name ?? '').trim();
  } catch (err) {
    logger.warn(
      {
        correlationId,
        patientId,
        error: err instanceof Error ? err.message : String(err),
      },
      'booking-review-sla-alert: patient name lookup threw',
    );
    return '';
  }
}

/**
 * Scan breached-pending booking reviews and emit one action-needed
 * dashboard event each. Safe under concurrent cron ticks (dedupe key).
 */
export async function runBookingReviewSlaAlertJob(
  correlationId: string,
): Promise<BookingReviewSlaAlertJobResult> {
  const result = emptyResult();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'booking-review-sla-alert: no admin client — tick skipped',
    );
    return result;
  }

  const nowIso = new Date().toISOString();

  // Breach predicate mirrors getBookingFunnel: pending + past deadline.
  // We do NOT filter on sla_breached_at — the timeout job may stamp that
  // independently; the doctor still needs the feed alert until they ack.
  const { data: rows, error } = await admin
    .from('service_staff_review_requests')
    .select('id, doctor_id, patient_id, created_at, sla_deadline_at')
    .eq('status', 'pending')
    .not('sla_deadline_at', 'is', null)
    .lt('sla_deadline_at', nowIso)
    .order('sla_deadline_at', { ascending: true })
    .limit(BATCH_SIZE_CAP);

  if (error) {
    logger.warn(
      { correlationId, error: error.message },
      'booking-review-sla-alert: scan query failed',
    );
    result.errors += 1;
    return result;
  }

  const list = (rows ?? []) as BreachedReviewRow[];
  result.scanned = list.length;
  if (list.length === 0) {
    logger.info({ correlationId, ...result }, 'booking-review-sla-alert: tick complete');
    return result;
  }

  for (const row of list) {
    if (!row.id || !row.doctor_id || !row.sla_deadline_at || !row.created_at) {
      result.errors += 1;
      continue;
    }

    try {
      const patientDisplayName = await resolvePatientDisplayName(
        admin,
        row.patient_id,
        correlationId,
      );
      const insertResult = await insertDashboardEvent({
        doctorId:  row.doctor_id,
        eventKind: 'booking_review_sla_breach',
        sessionId: null,
        payload: {
          severity:             'action_needed',
          review_request_id:    row.id,
          patient_display_name: patientDisplayName,
          requested_at:         row.created_at,
          sla_deadline_at:      row.sla_deadline_at,
        },
        dedupeKey: row.id,
      });
      if (insertResult.inserted) {
        result.inserted += 1;
      } else {
        result.deduped += 1;
      }
    } catch (err) {
      result.errors += 1;
      logger.warn(
        {
          correlationId,
          reviewRequestId: row.id,
          doctorId:        row.doctor_id,
          error:           err instanceof Error ? err.message : String(err),
        },
        'booking-review-sla-alert: insert failed (continuing batch)',
      );
    }
  }

  logger.info({ correlationId, ...result }, 'booking-review-sla-alert: tick complete');
  return result;
}

/** @internal — tests only. */
export const __testInternals = {
  BATCH_SIZE_CAP,
};
