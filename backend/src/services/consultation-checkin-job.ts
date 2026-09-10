/**
 * Pre-visit notify job (consult-room-checkin + reminder ladder).
 *
 * Stages (slot time windows):
 *   - reminder_24h: appointments in [now+23h, now+24h] — soft reminder, no link
 *   - checkin_30:   appointments in [now, now+30m] — check-in with join link
 *   - nudge_15:     appointments in [now, now+15m] — join link; skip if Waiting
 *   - nudge_5:      appointments in [now, now+5m]  — join link; skip if Waiting
 *   - starting_now: appointment_date in [now−2m, now] — join link; skip if Waiting
 *
 * Queue path: ahead≤3 → checkin_30 once (even outside the 30m clock window).
 *
 * Does NOT create Twilio rooms. No PHI in logs.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  resolvePrevisitStageDue,
  STARTING_NOW_GRACE_MINUTES,
  type PrevisitAptRow,
  type PrevisitNotifyStage,
} from '../utils/previsit-notify-stages';
import { sendPrevisitNotifyToPatient } from './notification-service';

export type { PrevisitAptRow, PrevisitNotifyStage };
export { resolvePrevisitStageDue };

export interface CheckinJobResult {
  ranAt: string;
  windowStart: string;
  windowEnd: string;
  candidatesFound: number;
  notificationsFired: number;
  errors: number;
  byStage: Record<PrevisitNotifyStage, number>;
}

const MS_HOUR = 60 * 60_000;

function emptyByStage(): Record<PrevisitNotifyStage, number> {
  return {
    reminder_24h: 0,
    checkin_30: 0,
    nudge_15: 0,
    nudge_5: 0,
    starting_now: 0,
  };
}

export async function runConsultationCheckinJob(
  correlationId: string
): Promise<CheckinJobResult> {
  const ranAt = new Date();
  const nowMs = ranAt.getTime();
  const leadMinutes = env.CONSULTATION_CHECKIN_LEAD_MINUTES;

  const result: CheckinJobResult = {
    ranAt: ranAt.toISOString(),
    windowStart: new Date(nowMs - STARTING_NOW_GRACE_MINUTES * 60_000).toISOString(),
    windowEnd: new Date(nowMs + 24 * MS_HOUR).toISOString(),
    candidatesFound: 0,
    notificationsFired: 0,
    errors: 0,
    byStage: emptyByStage(),
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId },
      'consultation-checkin: admin client unavailable — skipping'
    );
    return result;
  }

  const selectCols =
    'id, appointment_date, patient_checkin_notified_at, ' +
    'patient_reminder_24h_notified_at, patient_checkin_nudge_15_notified_at, ' +
    'patient_checkin_nudge_5_notified_at, patient_start_notified_at, ' +
    'patient_checked_in_at, patient_lobby_last_seen_at';

  // Lower bound includes a short past window so T=0 starting_now is not missed.
  const windowStartMs = nowMs - STARTING_NOW_GRACE_MINUTES * 60_000;

  const { data: slotApts, error: slotErr } = await admin
    .from('appointments')
    .select(selectCols)
    .gte('appointment_date', new Date(windowStartMs).toISOString())
    .lte('appointment_date', new Date(nowMs + 24 * MS_HOUR).toISOString())
    .in('status', ['pending', 'confirmed']);

  if (slotErr) {
    logger.warn(
      { correlationId, error: slotErr.message },
      'consultation-checkin: slot candidate query failed'
    );
  }

  const byId = new Map<string, PrevisitAptRow>();
  for (const row of (slotApts ?? []) as unknown as PrevisitAptRow[]) {
    byId.set(row.id, row);
  }

  const forceCheckinIds = new Set<string>();

  const todayYmd = ranAt.toISOString().slice(0, 10);
  const { data: queueEntries, error: qErr } = await admin
    .from('opd_queue_entries')
    .select('appointment_id, doctor_id, token_number, session_date')
    .eq('session_date', todayYmd)
    .in('status', ['waiting', 'called']);

  if (qErr) {
    logger.warn(
      { correlationId, error: qErr.message },
      'consultation-checkin: queue candidate query failed'
    );
  } else if (queueEntries?.length) {
    type QRow = {
      appointment_id: string;
      doctor_id: string;
      token_number: number;
    };
    const byDoctor = new Map<string, QRow[]>();
    for (const e of queueEntries as QRow[]) {
      const list = byDoctor.get(e.doctor_id) ?? [];
      list.push(e);
      byDoctor.set(e.doctor_id, list);
    }

    const queueAptIds: string[] = [];
    for (const [, entries] of byDoctor) {
      const active = [...entries].sort((a, b) => a.token_number - b.token_number);
      for (const e of active) {
        const aheadCount = active.filter(
          (o) => o.token_number < e.token_number
        ).length;
        if (aheadCount <= 3) {
          queueAptIds.push(e.appointment_id);
        }
      }
    }

    const missing = queueAptIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      const { data: qApts, error: qAptErr } = await admin
        .from('appointments')
        .select(selectCols)
        .in('id', missing)
        .in('status', ['pending', 'confirmed']);

      if (qAptErr) {
        logger.warn(
          { correlationId, error: qAptErr.message },
          'consultation-checkin: queue appointment lookup failed'
        );
      } else {
        for (const a of (qApts ?? []) as unknown as PrevisitAptRow[]) {
          byId.set(a.id, a);
        }
      }
    }

    for (const id of queueAptIds) {
      const row = byId.get(id);
      if (row && !row.patient_checkin_notified_at) {
        forceCheckinIds.add(id);
      }
    }
  }

  type Work = { appointmentId: string; stage: PrevisitNotifyStage };
  const work: Work[] = [];

  for (const row of byId.values()) {
    const stage = resolvePrevisitStageDue(row, nowMs, leadMinutes, {
      forceCheckin30: forceCheckinIds.has(row.id),
    });
    if (stage) {
      work.push({ appointmentId: row.id, stage });
    }
  }

  result.candidatesFound = work.length;

  for (const item of work) {
    try {
      const sent = await sendPrevisitNotifyToPatient({
        appointmentId: item.appointmentId,
        correlationId,
        stage: item.stage,
      });
      if (sent) {
        result.notificationsFired += 1;
        result.byStage[item.stage] += 1;
      }
    } catch (err) {
      result.errors += 1;
      logger.warn(
        {
          correlationId,
          appointmentId: item.appointmentId,
          stage: item.stage,
          error: err instanceof Error ? err.message : String(err),
        },
        'consultation-checkin: send failed'
      );
    }
  }

  logger.info(
    {
      correlationId,
      candidatesFound: result.candidatesFound,
      notificationsFired: result.notificationsFired,
      byStage: result.byStage,
      errors: result.errors,
    },
    'consultation-checkin: run complete'
  );

  return result;
}
