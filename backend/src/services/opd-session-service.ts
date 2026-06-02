/**
 * Unified doctor OPD session snapshot (pdm-02).
 * Shared by GET /opd/session and legacy slot/queue session endpoints.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import type { OpdMode } from '../types/doctor-settings';
import type {
  OpdQueueSessionPayload,
  OpdSessionPayload,
  OpdSlotSessionPayload,
  QueueSessionCounts,
  QueueSessionRow,
} from '../types/opd-session';
import { InternalError } from '../utils/errors';
import { listDoctorQueueSession } from './opd-doctor-service';
import { resolveSessionDayMode } from './opd/opd-mode-service';
import { listDoctorSlotSession } from './opd-slot-session-service';

const QUEUE_ACTIVE = new Set(['waiting', 'called', 'in_consultation']);
const QUEUE_DONE = new Set(['completed']);
const QUEUE_MISSED = new Set(['missed', 'skipped', 'cancelled']);

function computeQueueSessionCounts(entries: QueueSessionRow[]): QueueSessionCounts {
  let active = 0;
  let done = 0;
  let missed = 0;
  for (const e of entries) {
    if (QUEUE_ACTIVE.has(e.queueStatus)) active += 1;
    else if (QUEUE_DONE.has(e.queueStatus)) done += 1;
    else if (QUEUE_MISSED.has(e.queueStatus)) missed += 1;
  }
  return { all: entries.length, active, done, missed };
}

export async function loadOpdSessionPayload(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  correlationId: string,
  options?: { forceMode?: OpdMode }
): Promise<OpdSessionPayload> {
  const resolvedMode = options?.forceMode
    ? { mode: options.forceMode, source: 'default' as const, changeCount: 0 }
    : await resolveSessionDayMode(supabase, doctorId, date);

  if (resolvedMode.mode === 'slot') {
    const slot = await listDoctorSlotSession(doctorId, date, correlationId);
    const payload: OpdSlotSessionPayload = {
      mode: 'slot',
      date,
      snapshotAt: slot.snapshotAt,
      modeSource: resolvedMode.source,
      modeChangeCount: resolvedMode.changeCount,
      entries: slot.entries,
      counts: slot.counts,
    };
    return payload;
  }

  const entries = await listDoctorQueueSession(doctorId, date, correlationId);
  const snapshotAt = new Date().toISOString();
  const payload: OpdQueueSessionPayload = {
    mode: 'queue',
    date,
    snapshotAt,
    modeSource: resolvedMode.source,
    modeChangeCount: resolvedMode.changeCount,
    entries,
    counts: computeQueueSessionCounts(entries),
  };
  return payload;
}

/** Convenience when callers do not inject a Supabase client. */
export async function loadOpdSessionPayloadForDoctor(
  doctorId: string,
  date: string,
  correlationId: string,
  options?: { forceMode?: OpdMode }
): Promise<OpdSessionPayload> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }
  return loadOpdSessionPayload(supabase, doctorId, date, correlationId, options);
}
