/**
 * Recording orphan-reconciliation worker (recording-governance-v2 · rec-20).
 *
 * Sweeps `consultation_recording_audit` rows stuck at
 * `metadata.status = 'attempted'` past the 5-minute SLA (064 L22–29)
 * with no `completed` / `failed` / `indeterminate` sibling on the same
 * `correlation_id`. Table-wide — pause/resume and track-service flips
 * share the ledger and the same ambiguity.
 *
 * **Observe and record.** Reads Twilio's current include-rules and
 * closes the ledger. Never flips a Recording Rule, never re-pauses,
 * never resumes, never escalates, never reverts.
 *
 * Outcomes:
 *   · completed     — Twilio shows the attempted state in effect
 *   · failed        — Twilio shows it is not in effect
 *   · indeterminate — room gone (`TwilioRoomNotFoundError`) or no
 *                     room sid; do not guess
 *
 * Two pods: atomic claim on `metadata.reconciliation_claimed_at`.
 * A second tick over a closed correlation_id writes nothing new.
 *
 * Uses `idx_recording_audit_attempted` (status='attempted' + created_at)
 * and `idx_recording_audit_correlation_id` for the sibling join.
 *
 * @see backend/src/workers/video-escalation-timeout-worker.ts
 * @see backend/migrations/064_consultation_recording_audit.sql
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  PAUSE_REASON_NOT_RECORDED,
  RECORDING_AUDIT_ORPHAN_SLA_MS,
  RECORDING_ORPHAN_CLAIM_STALE_MS,
  RECORDING_ORPHAN_RECONCILE_BATCH_CAP,
  RECORDING_ORPHAN_RECONCILE_TICK_SECONDS,
  RECORDING_SYSTEM_ACTOR_UUID,
} from '../types/consultation-recording-audit';
import {
  getIncludedRecordingKinds,
  TwilioRoomNotFoundError,
} from '../services/twilio-recording-rules';
import type { RecordingRuleKind } from '../services/twilio-recording-rules';

export const RECORDING_ORPHAN_RECONCILE_SLA_MS = RECORDING_AUDIT_ORPHAN_SLA_MS;

export type OrphanReconcileClosedAs = 'completed' | 'failed' | 'indeterminate';

export interface RecordingOrphanReconcileJobResult {
  scanned: number;
  closedCompleted: number;
  closedFailed: number;
  closedIndeterminate: number;
  raced: number;
  errors: string[];
}

interface OrphanRow {
  id: string;
  sessionId: string;
  action: string;
  reason: string | null;
  pauseReasonCode: string | null;
  metadata: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'indeterminate']);

const REASON_REQUIRED_ACTIONS = new Set([
  'recording_paused',
  'recording_stopped',
  'patient_revoked_video_mid_session',
]);

export async function runRecordingOrphanReconcileJob(
  correlationId: string,
  nowMs: number = Date.now(),
): Promise<RecordingOrphanReconcileJobResult> {
  const result: RecordingOrphanReconcileJobResult = {
    scanned: 0,
    closedCompleted: 0,
    closedFailed: 0,
    closedIndeterminate: 0,
    raced: 0,
    errors: [],
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'recording-orphan-reconciliation-worker: no admin client — tick skipped',
    );
    return result;
  }

  const cutoffIso = new Date(nowMs - RECORDING_AUDIT_ORPHAN_SLA_MS).toISOString();
  const staleIso = new Date(nowMs - RECORDING_ORPHAN_CLAIM_STALE_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const { data: scanRows, error: scanErr } = await admin
    .from('consultation_recording_audit')
    .select(
      'id, session_id, action, reason, pause_reason_code, metadata, correlation_id, created_at',
    )
    .filter('metadata->>status', 'eq', 'attempted')
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(RECORDING_ORPHAN_RECONCILE_BATCH_CAP);

  if (scanErr) {
    logger.error(
      { correlationId, error: scanErr.message },
      'recording-orphan-reconciliation-worker: scan failed',
    );
    result.errors.push(scanErr.message);
    return result;
  }

  if (!scanRows || scanRows.length === 0) {
    logger.debug(
      { correlationId, tickSeconds: RECORDING_ORPHAN_RECONCILE_TICK_SECONDS },
      'recording-orphan-reconciliation-worker: no stale attempted rows',
    );
    return result;
  }

  const orphans = (scanRows as Array<Record<string, unknown>>).map(mapOrphanRow);
  const siblingByCorr = await loadTerminalSiblings(
    admin,
    orphans
      .map((o) => o.correlationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const candidates = orphans.filter((row) => {
    if (!row.correlationId) return true;
    return !siblingByCorr.has(row.correlationId);
  });

  result.scanned = candidates.length;
  if (candidates.length === 0) {
    logger.debug(
      { correlationId, attemptedSeen: orphans.length },
      'recording-orphan-reconciliation-worker: attempted rows all have siblings',
    );
    return result;
  }

  for (const row of candidates) {
    const rowCorrelationId = row.correlationId ?? `${correlationId}:${row.id}`;
    try {
      const claimed = await claimOrphan(admin, row, nowIso, staleIso);
      if (!claimed) {
        result.raced += 1;
        logger.debug(
          { correlationId: rowCorrelationId, sessionId: row.sessionId, orphanId: row.id },
          'recording-orphan-reconciliation-worker: claim raced',
        );
        continue;
      }

      if (row.correlationId && (await hasTerminalSibling(admin, row.correlationId, row.id))) {
        result.raced += 1;
        continue;
      }

      const outcome = await observeOrphan(row);
      await insertClosingRow(admin, row, outcome, nowIso);

      if (outcome.closedAs === 'completed') result.closedCompleted += 1;
      else if (outcome.closedAs === 'failed') result.closedFailed += 1;
      else result.closedIndeterminate += 1;

      logger.info(
        {
          correlationId: rowCorrelationId,
          sessionId: row.sessionId,
          orphanId: row.id,
          action: row.action,
          closedAs: outcome.closedAs,
        },
        'recording-orphan-reconciliation-worker: orphan closed',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId: rowCorrelationId, sessionId: row.sessionId, orphanId: row.id },
        'recording-orphan-reconciliation-worker: unexpected error processing row',
      );
      result.errors.push(message);
    }
  }

  logger.info(
    {
      correlationId,
      scanned: result.scanned,
      closedCompleted: result.closedCompleted,
      closedFailed: result.closedFailed,
      closedIndeterminate: result.closedIndeterminate,
      raced: result.raced,
      errors: result.errors.length,
      tickSeconds: RECORDING_ORPHAN_RECONCILE_TICK_SECONDS,
    },
    'recording-orphan-reconciliation-worker: tick complete',
  );

  return result;
}

export function decideReconcileOutcome(input: {
  action: string;
  metadata: Record<string, unknown>;
  includedKinds: RecordingRuleKind[] | null;
}): OrphanReconcileClosedAs {
  if (input.includedKinds === null) return 'indeterminate';
  const intended = intendedCapture(input.action, input.metadata);
  if (intended.kind === 'unknown') return 'indeterminate';
  return captureMatches(intended, input.includedKinds) ? 'completed' : 'failed';
}

type IntendedCapture =
  | { kind: 'none'; kinds: RecordingRuleKind[] }
  | { kind: 'includes'; kinds: RecordingRuleKind[] }
  | { kind: 'unknown' };

function intendedCapture(action: string, metadata: Record<string, unknown>): IntendedCapture {
  if (action === 'recording_paused' || action === 'recording_stopped') {
    return { kind: 'none', kinds: kindsFrom(metadata, 'paused_kinds') };
  }
  if (action === 'recording_resumed') {
    const restored = kindsFrom(metadata, 'restored_kinds');
    return { kind: 'includes', kinds: restored.length > 0 ? restored : kindsFrom(metadata, 'paused_kinds') };
  }
  if (
    action === 'recording_started' ||
    action === 'video_recording_reverted' ||
    action === 'patient_revoked_video_mid_session'
  ) {
    return { kind: 'includes', kinds: ['audio'] };
  }
  if (action === 'video_recording_started') {
    return { kind: 'includes', kinds: ['audio', 'video'] };
  }
  return { kind: 'unknown' };
}

function captureMatches(intended: IntendedCapture, included: RecordingRuleKind[]): boolean {
  if (intended.kind === 'unknown') return false;
  if (intended.kind === 'none') {
    return intended.kinds.every((k) => !included.includes(k));
  }
  return intended.kinds.every((k) => included.includes(k));
}

function kindsFrom(metadata: Record<string, unknown>, key: string): RecordingRuleKind[] {
  const raw = metadata[key];
  if (Array.isArray(raw)) {
    const kinds = raw.filter((k): k is RecordingRuleKind => k === 'audio' || k === 'video');
    if (kinds.length > 0) return kinds;
  }
  if (metadata.kind === 'audio' || metadata.kind === 'video') return [metadata.kind];
  return ['audio'];
}

function mapOrphanRow(row: Record<string, unknown>): OrphanRow {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    action: String(row.action),
    reason: typeof row.reason === 'string' ? row.reason : null,
    pauseReasonCode: typeof row.pause_reason_code === 'string' ? row.pause_reason_code : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    correlationId: typeof row.correlation_id === 'string' ? row.correlation_id : null,
    createdAt: String(row.created_at ?? ''),
  };
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

async function loadTerminalSiblings(
  admin: AdminClient,
  correlationIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (correlationIds.length === 0) return found;
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select('id, correlation_id, metadata')
    .in('correlation_id', correlationIds);
  if (error) {
    throw new Error(error.message);
  }
  for (const raw of data ?? []) {
    const row = raw as { correlation_id?: string; metadata?: { status?: string } };
    const status = row.metadata?.status;
    if (row.correlation_id && status && TERMINAL_STATUSES.has(status)) {
      found.add(row.correlation_id);
    }
  }
  return found;
}

async function hasTerminalSibling(
  admin: AdminClient,
  correlationId: string,
  exceptId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select('id, metadata')
    .eq('correlation_id', correlationId)
    .neq('id', exceptId);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).some((raw) => {
    const status = (raw as { metadata?: { status?: string } }).metadata?.status;
    return typeof status === 'string' && TERMINAL_STATUSES.has(status);
  });
}

async function claimOrphan(
  admin: AdminClient,
  row: OrphanRow,
  nowIso: string,
  staleIso: string,
): Promise<boolean> {
  const claimedAt =
    typeof row.metadata.reconciliation_claimed_at === 'string'
      ? row.metadata.reconciliation_claimed_at
      : null;

  if (claimedAt && claimedAt > staleIso) {
    return false;
  }

  if (claimedAt) {
    const released = { ...row.metadata };
    delete released.reconciliation_claimed_at;
    const { data: releasedRow, error: releaseErr } = await admin
      .from('consultation_recording_audit')
      .update({ metadata: released })
      .eq('id', row.id)
      .filter('metadata->>reconciliation_claimed_at', 'eq', claimedAt)
      .select('id')
      .maybeSingle();
    if (releaseErr) throw new Error(releaseErr.message);
    if (!releasedRow) return false;
  }

  const nextMeta = { ...row.metadata, reconciliation_claimed_at: nowIso };
  const { data: updated, error } = await admin
    .from('consultation_recording_audit')
    .update({ metadata: nextMeta })
    .eq('id', row.id)
    .filter('metadata->>status', 'eq', 'attempted')
    .filter('metadata->>reconciliation_claimed_at', 'is', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(updated);
}

async function observeOrphan(row: OrphanRow): Promise<{
  closedAs: OrphanReconcileClosedAs;
  includedKinds: RecordingRuleKind[] | null;
  observeNote: string;
}> {
  const roomSid = typeof row.metadata.twilio_sid === 'string' ? row.metadata.twilio_sid.trim() : '';
  if (!roomSid) {
    return { closedAs: 'indeterminate', includedKinds: null, observeNote: 'no_room_sid' };
  }
  try {
    const includedKinds = await getIncludedRecordingKinds(roomSid);
    return {
      closedAs: decideReconcileOutcome({
        action: row.action,
        metadata: row.metadata,
        includedKinds,
      }),
      includedKinds,
      observeNote: 'observed',
    };
  } catch (err) {
    if (err instanceof TwilioRoomNotFoundError) {
      return { closedAs: 'indeterminate', includedKinds: null, observeNote: 'room_not_found' };
    }
    throw err;
  }
}

async function insertClosingRow(
  admin: AdminClient,
  row: OrphanRow,
  outcome: {
    closedAs: OrphanReconcileClosedAs;
    includedKinds: RecordingRuleKind[] | null;
    observeNote: string;
  },
  nowIso: string,
): Promise<void> {
  const kind =
    row.metadata.kind === 'video' || row.metadata.kind === 'audio' ? row.metadata.kind : 'audio';
  const metadata: Record<string, unknown> = {
    twilio_sid: row.metadata.twilio_sid ?? null,
    kind,
    status: outcome.closedAs,
    reconciled: true,
    reconciled_at: nowIso,
    observed_kinds: outcome.includedKinds ?? [],
    observe_note: outcome.observeNote,
  };
  if (outcome.closedAs === 'failed') {
    metadata.error = 'observed_state_mismatch';
  }

  const { error } = await admin.from('consultation_recording_audit').insert({
    session_id: row.sessionId,
    action: row.action,
    action_by: RECORDING_SYSTEM_ACTOR_UUID,
    action_by_role: 'system',
    reason: reasonForClosing(row),
    pause_reason_code: row.pauseReasonCode,
    metadata,
    correlation_id: row.correlationId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

function reasonForClosing(row: OrphanRow): string | null {
  if (!REASON_REQUIRED_ACTIONS.has(row.action)) return null;
  const trimmed = (row.reason ?? '').trim();
  if (trimmed.length >= 5 && trimmed.length <= 200) return trimmed;
  return PAUSE_REASON_NOT_RECORDED;
}
