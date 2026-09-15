/**
 * On-demand composition (cost-cut step 7, replay half).
 *
 * ## The problem this solves
 *
 * The account-level Composition Hook composes every consult at
 * `$0.01`/composed minute — about `₹5.73` per 6-minute consult — while
 * only a small fraction are ever replayed. Turning the hook off would
 * save all of it, except that raw Twilio tracks are Matroska and no
 * browser will play them, so replay would simply break.
 *
 * So compose at the moment someone presses play, and only then.
 *
 * ## Why this is not the same as rec-01's rejected design
 *
 * rec-01 chose a hook over `compositions.create` because every consult
 * needed composing and a hook needed no code. Once only *some* consults
 * need composing, the choice of which ones is a product decision, and a
 * hook cannot express one. Same API, different premise.
 *
 * ## Guarding the meter
 *
 * A read endpoint that can start a billable job is a footgun, so the
 * order here matters:
 *
 *   1. Twilio's own composition list is the idempotency key. If a
 *      composition already exists for the room — enqueued, processing,
 *      or completed — we never create a second one. This is authoritative
 *      and survives a restart, which a DB flag or in-process lock would
 *      not.
 *   2. Composing requires raw tracks. No tracks means the media is gone
 *      or never existed, and a composition would be empty and still
 *      billable.
 *   3. Composition is asynchronous. A first press of play returns
 *      `artifact_not_ready`; the existing composition-status webhook
 *      registers the finished `CJ…` exactly as it does for hook-created
 *      compositions, so the next attempt resolves through the normal
 *      index path with no special-casing.
 *
 * Everything here is gated on `RECORDING_COMPOSE_ON_DEMAND`.
 */

import { env } from '../config/env';
import { logger } from '../config/logger';
import { findSessionById } from './consultation-session-service';
import { listRecordingsForRoom } from './twilio-recordings';
import {
  createCompositionForRoom,
  listCompositionsForRoom,
  type TwilioCompositionStatus,
} from './twilio-compositions';

export type ComposeOnDemandOutcome =
  /** A composition is being built; the caller should tell the user to wait. */
  | { state: 'pending'; compositionSid: string; status: TwilioCompositionStatus }
  /** A composition already exists and is playable. */
  | { state: 'ready'; compositionSid: string }
  /** Nothing to compose — no raw tracks, or the feature is off. */
  | { state: 'unavailable'; reason: ComposeUnavailableReason };

export type ComposeUnavailableReason =
  | 'disabled'
  | 'no_room_sid'
  | 'no_raw_tracks';

export interface EnsureCompositionInput {
  sessionId:     string;
  artifactKind:  'audio' | 'video';
  correlationId: string;
}

function statusCallbackUrl(): string | undefined {
  const base = env.WEBHOOK_BASE_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/+$/, '')}/webhooks/twilio/composition-status`;
}

/**
 * Ensure a Composition exists for a session's room, creating one only
 * if the room has raw media and nothing has been composed yet.
 *
 * Returns `unavailable` rather than throwing for every "cannot compose"
 * case, so the caller keeps its existing 404 behaviour unchanged.
 */
export async function ensureCompositionForSession(
  input: EnsureCompositionInput,
): Promise<ComposeOnDemandOutcome> {
  const { sessionId, artifactKind, correlationId } = input;

  if (!env.RECORDING_COMPOSE_ON_DEMAND) {
    return { state: 'unavailable', reason: 'disabled' };
  }

  const session = await findSessionById(sessionId);
  const roomSid = session?.providerSessionId?.trim();
  if (!roomSid) {
    logger.info(
      { correlationId, sessionId },
      'compose-on-demand: session has no provider room SID — nothing to compose',
    );
    return { state: 'unavailable', reason: 'no_room_sid' };
  }

  const wantVideo = artifactKind === 'video';

  // 1. Twilio is the idempotency key. Never create a second composition
  //    for a room that already has a usable one.
  const existing = await listCompositionsForRoom(roomSid);
  const match = existing.find(
    (c) =>
      c.includeVideo === wantVideo &&
      c.status !== 'failed' &&
      c.status !== 'deleted',
  );
  if (match) {
    if (match.status === 'completed') {
      return { state: 'ready', compositionSid: match.compositionSid };
    }
    logger.info(
      {
        correlationId,
        sessionId,
        roomSid,
        compositionSid: match.compositionSid,
        status: match.status,
      },
      'compose-on-demand: composition already in flight — not creating another',
    );
    return {
      state: 'pending',
      compositionSid: match.compositionSid,
      status: match.status,
    };
  }

  // 2. Composing a room with no media bills for an empty file.
  const recordings = await listRecordingsForRoom(roomSid);
  const usable = recordings.filter(
    (r) => r.status === 'completed' && (wantVideo ? r.type === 'video' : r.type === 'audio'),
  );
  if (usable.length === 0) {
    logger.info(
      {
        correlationId,
        sessionId,
        roomSid,
        artifactKind,
        candidateStates: recordings.map((r) => `${r.type}:${r.status}`),
      },
      'compose-on-demand: no completed raw tracks — refusing to compose',
    );
    return { state: 'unavailable', reason: 'no_raw_tracks' };
  }

  // 3. Start the meter.
  const created = await createCompositionForRoom({
    roomSid,
    includeVideo: wantVideo,
    ...(statusCallbackUrl() ? { statusCallbackUrl: statusCallbackUrl()! } : {}),
  });

  logger.info(
    {
      correlationId,
      sessionId,
      roomSid,
      artifactKind,
      compositionSid: created.compositionSid,
      trackCount: usable.length,
    },
    'compose-on-demand: composition requested at play time',
  );

  return {
    state: 'pending',
    compositionSid: created.compositionSid,
    status: created.status,
  };
}
