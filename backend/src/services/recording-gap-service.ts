/**
 * Recording gap derivation (rec-18 / REC-D17 · REC3-D8).
 *
 * Reads `consultation_recording_audit` (service-role only) and returns
 * zero-width markers positioned in **media time**: each gap's wall-clock
 * offset from the artifact start, minus the cumulative duration of every
 * earlier gap on that artifact. The paused window does not exist in the
 * composition; a spanned region would lie about what the listener hears.
 *
 * Composition cardinality (rec-18 step 0): the account audio hook fires
 * once when the room completes. Pause via Recording Rules creates new
 * Recording SIDs, not new Compositions. This service therefore positions
 * against one audio artifact and (when present) one video artifact.
 *
 * Attempted-only and failed rows are not gaps. A dangling completed
 * pause (no resume, or `session_ended_while_paused`) runs to the
 * artifact end. A gap that cannot be placed is still listed.
 *
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p3-pause-integrity/Tasks/task-rec-18-gap-markers-replay-player.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';
import {
  isRecordingPauseReasonCode,
  PAUSE_REASON_NOT_RECORDED,
  type RecordingPauseClosedAs,
  type RecordingPauseReasonCode,
} from '../types/consultation-recording-audit';
import { getRecordingArtifactsForSession, type ArtifactRef } from './recording-track-service';

export const RECORDING_GAPS_SCHEMA_VERSION = 1 as const;

export type RecordingGapActorRole = 'doctor' | 'patient' | 'system';
export type RecordingGapClosedAs = RecordingPauseClosedAs | 'unclosed';
export type RecordingGapReasonCode =
  | RecordingPauseReasonCode
  | typeof PAUSE_REASON_NOT_RECORDED;

export interface RecordingGap {
  wallStartedAt: string;
  wallEndedAt: string | null;
  durationMs: number | null;
  actorRole: RecordingGapActorRole;
  reasonCode: RecordingGapReasonCode;
  closedAs: RecordingGapClosedAs;
  /** Zero-width media-time position per artifact. `null` = listed, not placed. */
  mediaOffsetMs: {
    audio: number | null;
    video: number | null;
  };
}

export interface RecordingGapsResult {
  schemaVersion: typeof RECORDING_GAPS_SCHEMA_VERSION;
  gaps: RecordingGap[];
}

export interface GapLedgerRow {
  action: 'recording_paused' | 'recording_resumed';
  createdAt: Date;
  status: 'attempted' | 'completed' | 'failed' | null;
  actionByRole: string | null;
  pauseReasonCode: string | null;
  reason: string | null;
  pauseClosedAs: RecordingPauseClosedAs | null;
}

export interface ArtifactBounds {
  startedAt: Date;
  endedAt: Date | null;
}

// ============================================================================
// Public: listRecordingGaps
// ============================================================================

export async function listRecordingGaps(sessionId: string): Promise<RecordingGapsResult> {
  const trimmed = sessionId?.trim();
  if (!trimmed) {
    throw new ValidationError('sessionId is required');
  }

  const rows = await fetchCompletedPauseResumeRows(trimmed);
  const artifacts = await loadArtifactBounds(trimmed);
  return deriveRecordingGaps(rows, artifacts);
}

/**
 * Pure derivation — the two-pause arithmetic lives here and nowhere else.
 */
export function deriveRecordingGaps(
  rows: GapLedgerRow[],
  artifacts: { audio: ArtifactBounds | null; video: ArtifactBounds | null }
): RecordingGapsResult {
  const paired = pairCompletedGaps(rows, artifacts);
  const withOffsets = positionGapsInMediaTime(paired, artifacts);
  return {
    schemaVersion: RECORDING_GAPS_SCHEMA_VERSION,
    gaps: withOffsets,
  };
}

/**
 * REC3-D8: media offset = (wall start − artifact start) − sum of earlier
 * in-artifact gap durations. Implement once.
 */
export function positionGapsInMediaTime(
  gaps: Array<Omit<RecordingGap, 'mediaOffsetMs'>>,
  artifacts: { audio: ArtifactBounds | null; video: ArtifactBounds | null }
): RecordingGap[] {
  return gaps.map((gap, index) => {
    const earlier = gaps.slice(0, index);
    return {
      ...gap,
      mediaOffsetMs: {
        audio: offsetOnArtifact(gap, earlier, artifacts.audio),
        video: offsetOnArtifact(gap, earlier, artifacts.video),
      },
    };
  });
}

// ============================================================================
// Pairing
// ============================================================================

function pairCompletedGaps(
  rows: GapLedgerRow[],
  artifacts: { audio: ArtifactBounds | null; video: ArtifactBounds | null }
): Array<Omit<RecordingGap, 'mediaOffsetMs'>> {
  const completed = rows.filter((row) => row.status === 'completed');
  const gaps: Array<Omit<RecordingGap, 'mediaOffsetMs'>> = [];
  let open: GapLedgerRow | null = null;

  for (const row of completed) {
    if (row.action === 'recording_paused') {
      if (open) {
        continue;
      }
      open = row;
      continue;
    }
    if (row.action === 'recording_resumed' && open) {
      gaps.push(toGap(open, row.createdAt, closedAsForPair(open, row)));
      open = null;
    }
  }

  if (open) {
    const endedAt = danglingEnd(artifacts);
    gaps.push(
      toGap(
        open,
        endedAt,
        open.pauseClosedAs === 'session_ended_while_paused'
          ? 'session_ended_while_paused'
          : endedAt
            ? 'session_ended_while_paused'
            : 'unclosed'
      )
    );
  }

  return gaps;
}

function toGap(
  pause: GapLedgerRow,
  endedAt: Date | null,
  closedAs: RecordingGapClosedAs
): Omit<RecordingGap, 'mediaOffsetMs'> {
  const durationMs =
    endedAt && endedAt.getTime() >= pause.createdAt.getTime()
      ? endedAt.getTime() - pause.createdAt.getTime()
      : null;
  return {
    wallStartedAt: pause.createdAt.toISOString(),
    wallEndedAt: endedAt ? endedAt.toISOString() : null,
    durationMs,
    actorRole: asActorRole(pause.actionByRole),
    reasonCode: resolveReasonCode(pause.pauseReasonCode, pause.reason),
    closedAs,
  };
}

function closedAsForPair(pause: GapLedgerRow, resume: GapLedgerRow): RecordingGapClosedAs {
  if (pause.pauseClosedAs) return pause.pauseClosedAs;
  if (resume.actionByRole === 'system') return 'auto_resume';
  return 'manual_resume';
}

function danglingEnd(artifacts: {
  audio: ArtifactBounds | null;
  video: ArtifactBounds | null;
}): Date | null {
  const ends: number[] = [];
  for (const art of [artifacts.audio, artifacts.video]) {
    if (!art) continue;
    if (art.endedAt) ends.push(art.endedAt.getTime());
  }
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends));
}

function asActorRole(role: string | null): RecordingGapActorRole {
  if (role === 'patient' || role === 'system') return role;
  return 'doctor';
}

function resolveReasonCode(
  pauseReasonCode: string | null,
  reason: string | null
): RecordingGapReasonCode {
  if (isRecordingPauseReasonCode(pauseReasonCode)) return pauseReasonCode;
  if (isRecordingPauseReasonCode(reason)) return reason;
  return PAUSE_REASON_NOT_RECORDED;
}

function offsetOnArtifact(
  gap: Omit<RecordingGap, 'mediaOffsetMs'>,
  earlier: Array<Omit<RecordingGap, 'mediaOffsetMs'>>,
  artifact: ArtifactBounds | null
): number | null {
  if (!artifact) return null;
  const wallStart = Date.parse(gap.wallStartedAt);
  const artStart = artifact.startedAt.getTime();
  if (!Number.isFinite(wallStart) || !Number.isFinite(artStart)) return null;
  if (wallStart < artStart) return null;

  let earlierMs = 0;
  for (const prev of earlier) {
    const prevStart = Date.parse(prev.wallStartedAt);
    if (!Number.isFinite(prevStart) || prevStart < artStart) continue;
    if (prev.durationMs != null && prev.durationMs > 0) {
      earlierMs += prev.durationMs;
    }
  }
  return wallStart - artStart - earlierMs;
}

// ============================================================================
// Reads
// ============================================================================

async function fetchCompletedPauseResumeRows(sessionId: string): Promise<GapLedgerRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('recording-gap-service: admin client unavailable');
  }

  const { data, error } = await admin
    .from('consultation_recording_audit')
    .select(
      'action, reason, pause_reason_code, action_by_role, pause_closed_as, metadata, created_at'
    )
    .eq('session_id', sessionId)
    .in('action', ['recording_paused', 'recording_resumed'])
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'recording-gap-service: audit lookup failed'
    );
    throw new InternalError('recording-gap-service: audit lookup failed');
  }

  return (data ?? []).map((raw) => {
    const row = raw as {
      action: 'recording_paused' | 'recording_resumed';
      reason: string | null;
      pause_reason_code?: string | null;
      action_by_role?: string | null;
      pause_closed_as?: RecordingPauseClosedAs | null;
      metadata: { status?: 'attempted' | 'completed' | 'failed' } | null;
      created_at: string;
    };
    return {
      action: row.action,
      createdAt: new Date(row.created_at),
      status: row.metadata?.status ?? null,
      actionByRole: row.action_by_role ?? null,
      pauseReasonCode: row.pause_reason_code ?? null,
      reason: row.reason,
      pauseClosedAs: row.pause_closed_as ?? null,
    };
  });
}

async function loadArtifactBounds(
  sessionId: string
): Promise<{ audio: ArtifactBounds | null; video: ArtifactBounds | null }> {
  try {
    const listed = await getRecordingArtifactsForSession({ sessionId });
    return {
      audio: pickReplayArtifact(listed.audioCompositions),
      video: pickReplayArtifact(listed.videoCompositions),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { sessionId, error: message },
      'recording-gap-service: artifact list failed; gaps listed without positions'
    );
    return { audio: null, video: null };
  }
}

/**
 * Same "newest completed" pick the replay player resolves today
 * (`resolveAudioArtifact` / video path use newest-first).
 */
function pickReplayArtifact(list: ArtifactRef[]): ArtifactBounds | null {
  if (list.length === 0) return null;
  const completed = list.filter((row) => row.status === 'completed');
  const pool = completed.length > 0 ? completed : list;
  const newest = pool[pool.length - 1];
  if (!newest) return null;
  return { startedAt: newest.startedAt, endedAt: newest.endedAt };
}
