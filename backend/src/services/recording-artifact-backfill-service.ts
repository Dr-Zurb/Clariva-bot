/**
 * rec-05 — walk ended voice/video sessions and register their Twilio
 * Compositions through `registerFinalisedComposition`.
 *
 * Dry-run is the safe default (the script layer enforces it). This
 * module never inserts except via rec-02's writer. Idempotent: UNIQUE
 * `(session_id, artifact_kind, storage_uri)` collapses duplicates
 * (REC1-D2). Safe to re-run after a kill or rate-limit.
 *
 * Hide-eligible uses the 90-day patient self-serve window (REC-D25).
 * Hard-delete candidates use a 3-year retention-years floor (shortest
 * seeded policy) without reading patient DOB — that over-counts
 * slightly vs a DOB-extended cutoff, which is the conservative report.
 */

import { env } from '../config/env';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';
import {
  buildTwilioCompositionStorageUri,
  registerFinalisedComposition,
} from './recording-artifact-service';
import { listCompositionsForRoom } from './twilio-compositions';
import type { RoomCompositionSummary } from './twilio-compositions';

export const BACKFILL_DEFAULT_BATCH_SIZE = 25;
export const BACKFILL_HIDE_ELIGIBLE_DAYS = 90;
export const BACKFILL_RETENTION_YEARS_FLOOR = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

export interface ArtifactIndexBackfillOptions {
  dryRun: boolean;
  batchSize?: number;
  limit?: number;
  endedAfter?: Date;
  endedBefore?: Date;
  correlationId?: string;
}

export interface ArtifactIndexBackfillStats {
  dryRun: boolean;
  archivalHardDeleteEnabled: boolean;
  sessionsScanned: number;
  skippedNoRoom: number;
  skippedNoCompositions: number;
  skippedNotCompleted: number;
  compositionsFound: number;
  wouldCreate: number;
  created: number;
  alreadyPresent: number;
  failures: number;
  byKind: { audio_composition: number; video_composition: number };
  byModality: { voice: number; video: number; other: number };
  immediatelyHideEligible: number;
  hardDeleteCandidates: number;
  sessionsStillUnresolvable: number;
  unresolvableReasons: {
    noRoom: number;
    noCompositions: number;
    noCompletedCompositions: number;
  };
}

interface EndedSessionRow {
  id: string;
  modality: string;
  provider_session_id: string | null;
  actual_ended_at: string;
}

function emptyStats(dryRun: boolean): ArtifactIndexBackfillStats {
  return {
    dryRun,
    archivalHardDeleteEnabled: env.ARCHIVAL_HARD_DELETE_ENABLED === true,
    sessionsScanned: 0,
    skippedNoRoom: 0,
    skippedNoCompositions: 0,
    skippedNotCompleted: 0,
    compositionsFound: 0,
    wouldCreate: 0,
    created: 0,
    alreadyPresent: 0,
    failures: 0,
    byKind: { audio_composition: 0, video_composition: 0 },
    byModality: { voice: 0, video: 0, other: 0 },
    immediatelyHideEligible: 0,
    hardDeleteCandidates: 0,
    sessionsStillUnresolvable: 0,
    unresolvableReasons: {
      noRoom: 0,
      noCompositions: 0,
      noCompletedCompositions: 0,
    },
  };
}

function bumpModality(stats: ArtifactIndexBackfillStats, modality: string): void {
  if (modality === 'voice') stats.byModality.voice += 1;
  else if (modality === 'video') stats.byModality.video += 1;
  else stats.byModality.other += 1;
}

function bucketKind(
  summary: RoomCompositionSummary
): 'audio_composition' | 'video_composition' | null {
  if (summary.includeVideo) return 'video_composition';
  if (summary.includeAudio) return 'audio_composition';
  return null;
}

function isHideEligible(endedAt: string, asOf: Date): boolean {
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(end)) return false;
  return end + BACKFILL_HIDE_ELIGIBLE_DAYS * MS_PER_DAY <= asOf.getTime();
}

function isHardDeleteCandidate(endedAt: string, asOf: Date): boolean {
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(end)) return false;
  return end + BACKFILL_RETENTION_YEARS_FLOOR * MS_PER_YEAR <= asOf.getTime();
}

async function indexRowExists(
  sessionId: string,
  artifactKind: string,
  storageUri: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('recording-artifact-backfill: Supabase admin client unavailable');
  }
  const { data, error } = await admin
    .from('recording_artifact_index')
    .select('id')
    .eq('session_id', sessionId)
    .eq('artifact_kind', artifactKind)
    .eq('storage_uri', storageUri)
    .maybeSingle();
  if (error) {
    throw new InternalError(`recording-artifact-backfill: index lookup failed: ${error.message}`);
  }
  return data != null;
}

async function fetchEndedSessionPage(
  offset: number,
  batchSize: number,
  endedAfter?: Date,
  endedBefore?: Date
): Promise<EndedSessionRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('recording-artifact-backfill: Supabase admin client unavailable');
  }

  let query = admin
    .from('consultation_sessions')
    .select('id, modality, provider_session_id, actual_ended_at')
    .not('actual_ended_at', 'is', null)
    .in('modality', ['voice', 'video'])
    .order('actual_ended_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (endedAfter) {
    query = query.gte('actual_ended_at', endedAfter.toISOString());
  }
  if (endedBefore) {
    query = query.lt('actual_ended_at', endedBefore.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    throw new InternalError(`recording-artifact-backfill: session scan failed: ${error.message}`);
  }
  return (data ?? []) as EndedSessionRow[];
}

async function listCompositionsSafe(
  roomSid: string,
  correlationId: string,
  sessionId: string
): Promise<RoomCompositionSummary[] | 'failed'> {
  try {
    return await listCompositionsForRoom(roomSid);
  } catch (first) {
    const firstMessage = first instanceof Error ? first.message : String(first);
    logger.warn(
      { correlationId, sessionId, roomSid, error: firstMessage },
      'recording-artifact-backfill: list-by-room failed — retrying once'
    );
    try {
      return await listCompositionsForRoom(roomSid);
    } catch (second) {
      const message = second instanceof Error ? second.message : String(second);
      logger.error(
        { correlationId, sessionId, roomSid, error: message },
        'recording-artifact-backfill: list-by-room failed after retry'
      );
      return 'failed';
    }
  }
}

async function registerOne(
  input: {
    dryRun: boolean;
    sessionId: string;
    compositionSid: string;
    artifactKind: 'audio_composition' | 'video_composition';
    endedAt: string;
    modality: string;
    correlationId: string;
    asOf: Date;
  },
  stats: ArtifactIndexBackfillStats
): Promise<void> {
  const storageUri = buildTwilioCompositionStorageUri(input.compositionSid);

  if (input.dryRun) {
    const exists = await indexRowExists(input.sessionId, input.artifactKind, storageUri);
    if (exists) {
      stats.alreadyPresent += 1;
      return;
    }
    stats.wouldCreate += 1;
    stats.byKind[input.artifactKind] += 1;
    bumpModality(stats, input.modality);
    if (isHideEligible(input.endedAt, input.asOf)) {
      stats.immediatelyHideEligible += 1;
    }
    if (isHardDeleteCandidate(input.endedAt, input.asOf)) {
      stats.hardDeleteCandidates += 1;
    }
    return;
  }

  const result = await registerFinalisedComposition({
    sessionId: input.sessionId,
    compositionSid: input.compositionSid,
    artifactKind: input.artifactKind,
    correlationId: input.correlationId,
  });
  if (result.created) {
    stats.created += 1;
    stats.byKind[input.artifactKind] += 1;
    bumpModality(stats, input.modality);
    if (isHideEligible(input.endedAt, input.asOf)) {
      stats.immediatelyHideEligible += 1;
    }
    if (isHardDeleteCandidate(input.endedAt, input.asOf)) {
      stats.hardDeleteCandidates += 1;
    }
  } else {
    stats.alreadyPresent += 1;
  }
}

/**
 * Walk ended voice/video sessions and register completed compositions.
 * Per-session Twilio / writer failures are counted and the walk continues.
 */
export async function runArtifactIndexBackfill(
  options: ArtifactIndexBackfillOptions
): Promise<ArtifactIndexBackfillStats> {
  const dryRun = options.dryRun !== false;
  const batchSize = Math.max(1, options.batchSize ?? BACKFILL_DEFAULT_BATCH_SIZE);
  const limit = options.limit;
  const correlationId = options.correlationId?.trim() || `rec-05-backfill-${Date.now()}`;
  const asOf = new Date();
  const stats = emptyStats(dryRun);

  if (!getSupabaseAdminClient()) {
    throw new InternalError('recording-artifact-backfill: Supabase admin client unavailable');
  }

  logger.info(
    {
      correlationId,
      dryRun,
      batchSize,
      limit: limit ?? null,
      archivalHardDeleteEnabled: stats.archivalHardDeleteEnabled,
    },
    'recording-artifact-backfill: starting'
  );

  let offset = 0;
  let scanned = 0;
  let page: EndedSessionRow[] = [];

  do {
    const remaining = limit == null ? batchSize : Math.max(0, limit - scanned);
    if (remaining === 0) break;

    page = await fetchEndedSessionPage(
      offset,
      Math.min(batchSize, remaining),
      options.endedAfter,
      options.endedBefore
    );
    if (page.length === 0) break;

    for (const row of page) {
      scanned += 1;
      stats.sessionsScanned += 1;
      const sessionId = row.id;
      const roomSid = row.provider_session_id?.trim() ?? '';

      if (!roomSid) {
        stats.skippedNoRoom += 1;
        stats.sessionsStillUnresolvable += 1;
        stats.unresolvableReasons.noRoom += 1;
        continue;
      }

      const listed = await listCompositionsSafe(roomSid, correlationId, sessionId);
      if (listed === 'failed') {
        stats.failures += 1;
        continue;
      }

      if (listed.length === 0) {
        stats.skippedNoCompositions += 1;
        stats.sessionsStillUnresolvable += 1;
        stats.unresolvableReasons.noCompositions += 1;
        continue;
      }

      stats.compositionsFound += listed.length;

      let registeredOrPresent = 0;
      let onlyIncomplete = true;

      for (const summary of listed) {
        if (summary.status !== 'completed') {
          stats.skippedNotCompleted += 1;
          continue;
        }
        onlyIncomplete = false;
        const kind = bucketKind(summary);
        if (!kind) {
          stats.skippedNotCompleted += 1;
          continue;
        }

        try {
          await registerOne(
            {
              dryRun,
              sessionId,
              compositionSid: summary.compositionSid,
              artifactKind: kind,
              endedAt: row.actual_ended_at,
              modality: row.modality,
              correlationId,
              asOf,
            },
            stats
          );
          registeredOrPresent += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            {
              correlationId,
              sessionId,
              compositionSid: summary.compositionSid,
              artifactKind: kind,
              error: message,
            },
            'recording-artifact-backfill: register failed (continuing)'
          );
          stats.failures += 1;
        }
      }

      if (registeredOrPresent === 0) {
        stats.sessionsStillUnresolvable += 1;
        if (onlyIncomplete) {
          stats.unresolvableReasons.noCompletedCompositions += 1;
        }
      }
    }

    if (page.length < Math.min(batchSize, remaining)) break;
    offset += page.length;
  } while (limit == null || scanned < limit);

  logger.info({ correlationId, ...stats }, 'recording-artifact-backfill: finished');

  return stats;
}
