/**
 * Drains the debounced OPD mode-change notification batch table (pdm-06).
 *
 * @see backend/migrations/101_opd_pending_mode_notifications.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../config/logger';
import type { OpdMode } from '../../types/doctor-settings';
import { notifyConversionAffectedPatients } from './opd-mode-notification-dispatcher';

export interface DrainSummary {
  dispatched: number;
  skipped: number;
}

export interface PendingModeNotificationPayload {
  from_mode?: OpdMode | null;
  to_mode?: OpdMode;
  affected_apt_count?: number;
  overflow_count?: number;
  correlation_id?: string;
}

interface PendingRow {
  doctor_id: string;
  session_date: string;
  first_flip_at: string;
  scheduled_for: string;
  latest_flip_mode: OpdMode;
  payload_json: PendingModeNotificationPayload;
}

const DEBOUNCE_CEILING_MS = 30 * 60 * 1000;

/**
 * Drain rows where the 5-min debounce elapsed OR the 30-min hard ceiling passed.
 */
export async function drainOpdPendingModeNotifications(
  supabase: SupabaseClient
): Promise<DrainSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const ceilingIso = new Date(now.getTime() - DEBOUNCE_CEILING_MS).toISOString();

  const { data: rows, error } = await supabase
    .from('doctor_opd_pending_mode_notifications')
    .select(
      'doctor_id, session_date, first_flip_at, scheduled_for, latest_flip_mode, payload_json'
    )
    .or(`scheduled_for.lte.${nowIso},first_flip_at.lte.${ceilingIso}`);

  if (error) {
    logger.error(
      { err: error.message, context: 'drainOpdPendingModeNotifications' },
      'select_failed'
    );
    return { dispatched: 0, skipped: 0 };
  }

  let dispatched = 0;
  let skipped = 0;

  for (const row of (rows ?? []) as PendingRow[]) {
    try {
      await notifyConversionAffectedPatients(supabase, {
        doctorId: row.doctor_id,
        sessionDate: row.session_date,
        latestMode: row.latest_flip_mode,
        payloadJson: row.payload_json ?? {},
      });

      const correlationId = row.payload_json?.correlation_id;
      if (correlationId) {
        const { error: auditErr } = await supabase
          .from('doctor_opd_session_mode_changes')
          .update({ notification_dispatched: true })
          .eq('correlation_id', correlationId);
        if (auditErr) {
          logger.warn(
            {
              correlationId,
              err: auditErr.message,
              context: 'drainOpdPendingModeNotifications',
            },
            'audit_notification_dispatched_update_failed'
          );
        }
      }

      const { error: deleteErr } = await supabase
        .from('doctor_opd_pending_mode_notifications')
        .delete()
        .eq('doctor_id', row.doctor_id)
        .eq('session_date', row.session_date);

      if (deleteErr) {
        throw deleteErr;
      }

      dispatched += 1;
    } catch (err) {
      logger.error(
        {
          doctorId: row.doctor_id,
          sessionDate: row.session_date,
          err: err instanceof Error ? err.message : String(err),
          context: 'drainOpdPendingModeNotifications',
        },
        'dispatch_failed'
      );
      skipped += 1;
    }
  }

  return { dispatched, skipped };
}
