/**
 * Twilio Compositions adapter — metadata + signed-URL minter (Plan 07 · Task 29).
 *
 * Twilio's Composition resource exposes:
 *   - `client.video.v1.compositions(sid).fetch()` for status / duration
 *      / size metadata.
 *   - A media endpoint at
 *      `https://video.twilio.com/v1/Compositions/{sid}/Media`
 *      that returns a 302 to a short-TTL signed URL on the underlying
 *      storage bucket.
 *
 * In v1 we don't have a dedicated `compositions.media().fetch()` SDK
 * helper across all SDK versions in repo, so the URL minter performs a
 * direct HTTPS GET against the `/Media` endpoint (basic-auth with the
 * Twilio account SID + auth token) with `?Ttl=<seconds>` and follows
 * the redirect manually to capture the signed URL + its expiry. That
 * keeps us SDK-version-agnostic — Plan 05 Task 25's transcription
 * worker already exercises this same Composition surface (see
 * `backend/src/workers/voice-transcription-worker.ts#defaultResolveComposition`)
 * so the auth wiring is well-trodden.
 *
 * **Stream-only (Decision 10 LOCKED):** the returned signed URL is
 * passed to an HTML5 `<audio>` element on the frontend; we never set a
 * `download` attribute. The redirect target carries
 * `Content-Disposition: inline` from Twilio's CDN so even a determined
 * Save-As is best-effort. The real defense is the audit log written by
 * the calling service.
 *
 * **Testability:** every external call goes through one of three
 * functions — `fetchCompositionMetadata`, `mintCompositionSignedUrl`,
 * or `getComputedTwilioMediaUrl`. The first two are mockable at the
 * module level via the `__setOverridesForTests` hook; the third is
 * pure (URL construction).
 *
 * @see backend/src/services/twilio-recording-rules.ts (sibling adapter — Recording Rules surface)
 * @see backend/src/workers/voice-transcription-worker.ts (Composition polling pattern)
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-29-recording-replay-player-patient-self-serve.md
 */

import Twilio from 'twilio';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';

// ============================================================================
// Public types
// ============================================================================

export type TwilioCompositionStatus =
  | 'enqueued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'deleted';

export interface CompositionMetadata {
  status:        TwilioCompositionStatus;
  durationSec?:  number;
  sizeBytes?:    number;
  /**
   * Canonical media URL prefix (without query params). Used by the
   * access service to build the revocation-list lookup key — every
   * artifact for a given session has the same prefix shape.
   */
  mediaUrlPrefix: string;
}

export interface MintCompositionSignedUrlInput {
  compositionSid: string;
  /**
   * Requested TTL in seconds. Twilio honors this on `/Media?Ttl=N`.
   * Default 900 (15 min) per task-29 Note #4.
   */
  ttlSec?:        number;
}

export interface MintCompositionSignedUrlResult {
  signedUrl:  string;
  expiresAt:  Date;
}

// ============================================================================
// Twilio client
// ============================================================================

function getTwilioClient(): Twilio.Twilio | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

function requireCredentials(): { sid: string; token: string } {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new InternalError(
      'twilio-compositions: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }
  return { sid, token };
}

// ============================================================================
// Pure helper — composition media URL prefix
// ============================================================================

/**
 * Build the canonical Composition media URL (no query string). Pure;
 * exported so the access service can compute the revocation-list lookup
 * prefix without hitting Twilio.
 */
export function getComputedTwilioMediaUrl(compositionSid: string): string {
  const trimmed = compositionSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-compositions: compositionSid is required');
  }
  return `https://video.twilio.com/v1/Compositions/${trimmed}/Media`;
}

// ============================================================================
// Module-level overrides for unit tests
// ============================================================================

type FetchOverride = (compositionSid: string) => Promise<CompositionMetadata>;
type MintOverride = (input: MintCompositionSignedUrlInput) => Promise<MintCompositionSignedUrlResult>;
type ListByRoomOverride = (roomSid: string) => Promise<RoomCompositionSummary[]>;

let fetchMetadataOverride: FetchOverride | null = null;
let mintSignedUrlOverride: MintOverride | null = null;
let listByRoomOverride: ListByRoomOverride | null = null;

/**
 * Test hook. Pass `null` to clear an override and restore the default
 * (Twilio-backed) implementation.
 */
export function __setOverridesForTests(overrides: {
  fetchMetadata?:  FetchOverride | null;
  mintSignedUrl?:  MintOverride | null;
  listByRoom?:     ListByRoomOverride | null;
}): void {
  if (overrides.fetchMetadata !== undefined) fetchMetadataOverride = overrides.fetchMetadata;
  if (overrides.mintSignedUrl !== undefined) mintSignedUrlOverride = overrides.mintSignedUrl;
  if (overrides.listByRoom !== undefined)    listByRoomOverride    = overrides.listByRoom;
}

// ============================================================================
// Public types — room-level listing (Plan 08 · Task 43)
// ============================================================================

/**
 * Summary row for a Composition attached to a given room. Mirrors the
 * subset of Twilio's `CompositionInstance` shape that Task 43's
 * `getRecordingArtifactsForSession` consumer needs.
 *
 *   · `includeAudio`/`includeVideo` flags split the room's compositions
 *     into the two buckets Decision 10 LOCKED (audio-only legs vs.
 *     escalated audio+video legs).
 *   · `startedAt` orders artifacts within each bucket for the UI
 *     (Task 44's replay player shows them chronologically).
 *   · `endedAt` is null for in-flight compositions (the post-consult
 *     poll will see it flip to a timestamp).
 *
 * Room-to-composition cardinality: one room can yield N audio
 * compositions (pause/resume from Plan 07 · Task 28 closes + reopens
 * the audio-only leg) and M video compositions (each escalation /
 * revert cycle closes its video leg).
 */
export interface RoomCompositionSummary {
  compositionSid:   string;
  includeAudio:     boolean;
  includeVideo:     boolean;
  startedAt:        Date;
  endedAt:          Date | null;
  durationSeconds:  number | null;
  status:           TwilioCompositionStatus;
}

// ============================================================================
// Public: listCompositionsForRoom
// ============================================================================

/**
 * List every Composition the Twilio SDK returns for a given room. The
 * returned array is *unsorted* — the caller ordinarily filters by
 * include-audio / include-video and sorts by `startedAt` before
 * surfacing to the UI.
 *
 * Plan 08 · Task 43 uses this to implement
 * `recording-track-service.getRecordingArtifactsForSession`, which splits
 * the list into `audioCompositions` / `videoCompositions` buckets.
 *
 * No caching at this layer — the recording-track-service owns a 60 s
 * per-session Map-based cache. Putting the cache here would hide the
 * cache-bust from the escalate/revert callers.
 *
 * Pagination: Twilio's default `list` in the Node SDK auto-pages. For
 * the expected v1 cardinality (≤ ~5 compositions per room: worst case
 * = 2 pause/resume cycles × 1 audio leg + 1 escalation = 3) we pass a
 * generous `limit` cap without explicit pagination handling. If a room
 * ever exceeds 20 compositions the wrapper logs a warning so we catch
 * it in production before Task 44's UI misbehaves.
 *
 * @throws InternalError when Twilio is not configured OR the list call
 *         fails for any reason (including network). We do not
 *         distinguish 404 here — Twilio's list-by-room returns an
 *         empty array for an unknown room (not a 404), which this
 *         function surfaces as `[]`.
 */
export async function listCompositionsForRoom(
  roomSid: string,
): Promise<RoomCompositionSummary[]> {
  if (listByRoomOverride) {
    return listByRoomOverride(roomSid);
  }

  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-compositions: roomSid is required');
  }

  const client = getTwilioClient();
  if (!client) {
    throw new InternalError(
      'twilio-compositions: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }

  let compositions: Array<Record<string, unknown>>;
  try {
    // Limit 20 covers worst-case pause/resume + multiple escalations in
    // a single consult without needing explicit pagination.
    compositions = (await client.video.v1.compositions.list({
      roomSid: trimmed,
      limit:   20,
    })) as unknown as Array<Record<string, unknown>>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-compositions: list-by-room failed for ${trimmed}: ${message}`,
    );
  }

  if (compositions.length >= 20) {
    logger.warn(
      { roomSid: trimmed, count: compositions.length },
      'twilio-compositions: list-by-room hit the 20-composition cap; pagination may be needed',
    );
  }

  return compositions.map((c) => {
    const sid = String((c as { sid?: unknown }).sid ?? '');
    const rawIncludeAudio = (c as { includeAudioTracks?: unknown }).includeAudioTracks;
    const rawIncludeVideo = (c as { includeVideoTracks?: unknown }).includeVideoTracks;
    // Twilio SDK returns camelCase date fields as JS Date objects.
    const rawDateCreated = (c as { dateCreated?: unknown }).dateCreated;
    const rawDateCompleted = (c as { dateCompleted?: unknown }).dateCompleted;
    const rawDuration = (c as { duration?: unknown }).duration;
    const rawStatus = (c as { status?: unknown }).status;
    return {
      compositionSid:  sid,
      includeAudio:    Boolean(rawIncludeAudio),
      includeVideo:    Boolean(rawIncludeVideo),
      startedAt:
        rawDateCreated instanceof Date
          ? rawDateCreated
          : new Date(String(rawDateCreated)),
      endedAt:
        rawDateCompleted instanceof Date
          ? rawDateCompleted
          : rawDateCompleted
            ? new Date(String(rawDateCompleted))
            : null,
      durationSeconds: typeof rawDuration === 'number' ? rawDuration : null,
      status:          (rawStatus as TwilioCompositionStatus | undefined) ?? 'enqueued',
    } satisfies RoomCompositionSummary;
  });
}

// ============================================================================
// Public: fetchCompositionMetadata
// ============================================================================

/**
 * Fetch the live status + size metadata for a Composition.
 *
 * @throws NotFoundError when Twilio returns a 404 (composition gone /
 *         never existed).
 * @throws InternalError on any other Twilio failure.
 */
export async function fetchCompositionMetadata(
  compositionSid: string,
): Promise<CompositionMetadata> {
  if (fetchMetadataOverride) {
    return fetchMetadataOverride(compositionSid);
  }

  const trimmed = compositionSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-compositions: compositionSid is required');
  }

  const client = getTwilioClient();
  if (!client) {
    throw new InternalError(
      'twilio-compositions: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }

  try {
    const composition = await client.video.v1.compositions(trimmed).fetch();
    const status = composition.status as TwilioCompositionStatus;
    const durationSec =
      typeof composition.duration === 'number' ? composition.duration : undefined;
    const sizeBytes =
      typeof composition.size === 'number' ? composition.size : undefined;
    return {
      status,
      durationSec,
      sizeBytes,
      mediaUrlPrefix: getComputedTwilioMediaUrl(trimmed),
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new NotFoundError(`Composition ${trimmed} not found`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-compositions: fetch failed for ${trimmed}: ${message}`,
    );
  }
}

// ============================================================================
// Public: mintCompositionSignedUrl
// ============================================================================

/**
 * Mint a short-TTL signed URL for a Composition's audio media.
 *
 * Implementation note: Twilio's Composition `/Media` endpoint returns
 * `{ redirect_to: '<signed-url>' }` (JSON) when called with the right
 * `Accept` header and `?Ttl=N` query string. We do a direct fetch (no
 * redirect-follow) to capture the signed URL string. The returned URL
 * is opaque to our code — we just hand it to the player.
 *
 * @throws NotFoundError when Twilio returns a 404 for the composition.
 * @throws InternalError on any other Twilio failure or missing credentials.
 */
export async function mintCompositionSignedUrl(
  input: MintCompositionSignedUrlInput,
): Promise<MintCompositionSignedUrlResult> {
  if (mintSignedUrlOverride) {
    return mintSignedUrlOverride(input);
  }

  const trimmed = input.compositionSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-compositions: compositionSid is required');
  }
  const ttlSec = Math.max(60, Math.min(input.ttlSec ?? 900, 60 * 60));

  const { sid, token } = requireCredentials();
  const url = `${getComputedTwilioMediaUrl(trimmed)}?Ttl=${ttlSec}`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, {
      method:  'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept:        'application/json',
      },
      redirect: 'manual',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-compositions: media fetch network error for ${trimmed}: ${message}`,
    );
  }

  if (res.status === 404) {
    throw new NotFoundError(`Composition ${trimmed} not found`);
  }
  if (res.status < 200 || res.status >= 400) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* swallow */
    }
    throw new InternalError(
      `twilio-compositions: media fetch failed (${res.status}) for ${trimmed}: ${body.slice(0, 300)}`,
    );
  }

  // Twilio returns either a 302 with `Location: <signed-url>` (browser
  // path) OR a 200 with `{ redirect_to: '<signed-url>' }` (JSON path),
  // depending on `Accept` negotiation. Handle both — we asked for JSON
  // but a future Twilio change shouldn't break us silently.
  let signedUrl = res.headers.get('location') ?? '';
  if (!signedUrl) {
    try {
      const json = (await res.json()) as { redirect_to?: string };
      signedUrl = (json?.redirect_to ?? '').trim();
    } catch {
      // fallthrough
    }
  }
  if (!signedUrl) {
    throw new InternalError(
      `twilio-compositions: signed URL missing from media response for ${trimmed}`,
    );
  }

  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  logger.info(
    {
      compositionSid: trimmed,
      ttlSec,
      expiresAt: expiresAt.toISOString(),
    },
    'twilio-compositions: signed URL minted',
  );
  return { signedUrl, expiresAt };
}
