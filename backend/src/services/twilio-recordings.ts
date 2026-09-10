/**
 * Twilio Recordings adapter — raw per-track media (cost-cut step 7).
 *
 * Sibling of `twilio-compositions.ts`. Where that module speaks to the
 * composed `CJ…` resource, this one speaks to the *source* `RT…`
 * Recording resource that Group Rooms produce automatically:
 *   - `client.video.v1.recordings.list({ groupingSid: [roomSid] })`
 *   - `client.video.v1.recordings(sid).fetch()`
 *   - `https://video.twilio.com/v1/Recordings/{sid}/Media` → 302 to a
 *     short-TTL signed URL, same negotiation as the Composition media
 *     endpoint.
 *   - `client.video.v1.recordings(sid).remove()`
 *
 * ## Container caveat — why nothing plays these directly
 *
 * Twilio raw Recordings are **Matroska**: `.mka` for audio (OPUS or
 * PCMU) and `.mkv` for video (VP8 or H264), served as
 * `audio/x-matroska` / `video/x-matroska`. Twilio documents them as
 * "not directly compatible with most standard media players", and they
 * are outside Groq's accepted upload set (flac, mp3, mp4, mpeg, mpga,
 * m4a, ogg, wav, webm). Deepgram does not document Matroska either.
 *
 * So a signed URL from this module is **not** something to hand to an
 * `<audio>` element or to an STT vendor. It is a download handle for a
 * local transcode step. Replay continues to be served from a composed
 * `CJ…` artifact.
 *
 * ## Why `offset` matters
 *
 * Every Recording carries `offset` — milliseconds between a point in
 * time common to all group rooms and the moment this track's room
 * started. That is Twilio's documented synchronisation mechanism for
 * recordings belonging to the same room, and it is what lets a mixer
 * align a doctor track against a patient track.
 *
 * ## Testability
 *
 * Every external call funnels through `listRecordingsForRoom`,
 * `fetchRecordingMetadata`, `mintRecordingSignedUrl`, or
 * `deleteRecording`, all mockable via `__setOverridesForTests`.
 * `getComputedTwilioRecordingMediaUrl` is pure. A test that issues a
 * real Recording DELETE is unrecoverable — the suite must never reach
 * the live path.
 *
 * @see backend/src/services/twilio-compositions.ts (sibling — composed media)
 * @see docs/Reference/engineering/operations/setup/stop-composition-hook-runbook.md
 */

import Twilio from 'twilio';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';

// ============================================================================
// Public types
// ============================================================================

export type TwilioRecordingStatus =
  | 'processing'
  | 'completed'
  | 'deleted'
  | 'failed';

/** Twilio's track type. `data` tracks carry no media we can transcode. */
export type TwilioRecordingType = 'audio' | 'video' | 'data';

export type TwilioRecordingContainerFormat = 'mka' | 'mkv';

export interface RecordingMetadata {
  status:          TwilioRecordingStatus;
  type:            TwilioRecordingType;
  containerFormat: TwilioRecordingContainerFormat | null;
  codec:           string | null;
  durationSec?:    number;
  sizeBytes?:      number;
  /** Canonical media URL prefix (no query params). */
  mediaUrlPrefix:  string;
}

/**
 * Summary row for one raw track Recording attached to a room.
 *
 * Cardinality is much higher than for compositions: Twilio emits one
 * Recording per published track, so a 1:1 audio consult yields two
 * (`doctor` + `patient`), and each pause/resume cycle closes the
 * current Recordings and opens new ones.
 */
export interface RoomRecordingSummary {
  recordingSid:    string;
  type:            TwilioRecordingType;
  containerFormat: TwilioRecordingContainerFormat | null;
  codec:           string | null;
  /** Participant that published the source track, when Twilio reports it. */
  participantSid:  string | null;
  trackName:       string | null;
  /** Twilio's cross-track sync key, in milliseconds. */
  offsetMs:        number | null;
  startedAt:       Date;
  durationSeconds: number | null;
  sizeBytes:       number | null;
  status:          TwilioRecordingStatus;
}

export interface MintRecordingSignedUrlInput {
  recordingSid: string;
  /** Requested TTL in seconds. Clamped to [60, 3600]; default 900. */
  ttlSec?:      number;
}

export interface MintRecordingSignedUrlResult {
  signedUrl: string;
  expiresAt: Date;
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

function requireClient(): Twilio.Twilio {
  const client = getTwilioClient();
  if (!client) {
    throw new InternalError(
      'twilio-recordings: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }
  return client;
}

function requireCredentials(): { sid: string; token: string } {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new InternalError(
      'twilio-recordings: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }
  return { sid, token };
}

// ============================================================================
// Pure helper — recording media URL prefix
// ============================================================================

/**
 * Build the canonical Recording media URL (no query string). Pure;
 * exported so callers can compute a revocation-list lookup prefix
 * without hitting Twilio.
 */
export function getComputedTwilioRecordingMediaUrl(recordingSid: string): string {
  const trimmed = recordingSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recordings: recordingSid is required');
  }
  return `https://video.twilio.com/v1/Recordings/${trimmed}/Media`;
}

// ============================================================================
// Module-level overrides for unit tests
// ============================================================================

type ListByRoomOverride = (roomSid: string) => Promise<RoomRecordingSummary[]>;
type FetchOverride = (recordingSid: string) => Promise<RecordingMetadata>;
type MintOverride = (
  input: MintRecordingSignedUrlInput,
) => Promise<MintRecordingSignedUrlResult>;
type DeleteOverride = (recordingSid: string) => Promise<void>;

let listByRoomOverride: ListByRoomOverride | null = null;
let fetchMetadataOverride: FetchOverride | null = null;
let mintSignedUrlOverride: MintOverride | null = null;
let deleteRecordingOverride: DeleteOverride | null = null;

/**
 * Test hook. Pass `null` to clear an override and restore the default
 * (Twilio-backed) implementation.
 */
export function __setOverridesForTests(overrides: {
  listByRoom?:      ListByRoomOverride | null;
  fetchMetadata?:   FetchOverride | null;
  mintSignedUrl?:   MintOverride | null;
  deleteRecording?: DeleteOverride | null;
}): void {
  if (overrides.listByRoom !== undefined)      listByRoomOverride      = overrides.listByRoom;
  if (overrides.fetchMetadata !== undefined)   fetchMetadataOverride   = overrides.fetchMetadata;
  if (overrides.mintSignedUrl !== undefined)   mintSignedUrlOverride   = overrides.mintSignedUrl;
  if (overrides.deleteRecording !== undefined) deleteRecordingOverride = overrides.deleteRecording;
}

// ============================================================================
// Row mapping
// ============================================================================

const CONTAINER_FORMATS: readonly string[] = ['mka', 'mkv'];
const RECORDING_TYPES: readonly string[] = ['audio', 'video', 'data'];

function toContainerFormat(raw: unknown): TwilioRecordingContainerFormat | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return CONTAINER_FORMATS.includes(value)
    ? (value as TwilioRecordingContainerFormat)
    : null;
}

function toRecordingType(raw: unknown): TwilioRecordingType {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return RECORDING_TYPES.includes(value) ? (value as TwilioRecordingType) : 'data';
}

function toParticipantSid(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const sid = (raw as { participant_sid?: unknown; participantSid?: unknown });
  const value = sid.participant_sid ?? sid.participantSid;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toDate(raw: unknown): Date {
  if (raw instanceof Date) return raw;
  return new Date(String(raw));
}

function toNumberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function mapRecordingRow(row: Record<string, unknown>): RoomRecordingSummary {
  const rawTrackName = (row as { trackName?: unknown }).trackName;
  return {
    recordingSid:    String((row as { sid?: unknown }).sid ?? ''),
    type:            toRecordingType((row as { type?: unknown }).type),
    containerFormat: toContainerFormat((row as { containerFormat?: unknown }).containerFormat),
    codec:
      typeof (row as { codec?: unknown }).codec === 'string'
        ? String((row as { codec?: unknown }).codec)
        : null,
    participantSid:  toParticipantSid((row as { groupingSids?: unknown }).groupingSids),
    trackName:
      typeof rawTrackName === 'string' && rawTrackName.trim() ? rawTrackName.trim() : null,
    offsetMs:        toNumberOrNull((row as { offset?: unknown }).offset),
    startedAt:       toDate((row as { dateCreated?: unknown }).dateCreated),
    durationSeconds: toNumberOrNull((row as { duration?: unknown }).duration),
    sizeBytes:       toNumberOrNull((row as { size?: unknown }).size),
    status:
      ((row as { status?: unknown }).status as TwilioRecordingStatus | undefined) ??
      'processing',
  } satisfies RoomRecordingSummary;
}

// ============================================================================
// Public: listRecordingsForRoom
// ============================================================================

/**
 * List every raw track Recording Twilio holds for a given room, sorted
 * by `offsetMs` ascending so a mixer can walk them in timeline order
 * (rows without an offset sort last, preserving Twilio's ordering).
 *
 * Twilio scopes Recordings to a room through `groupingSid`, which
 * accepts both room and participant SIDs. An unknown room yields an
 * empty array rather than a 404.
 *
 * Cardinality is materially higher than the composition list: two
 * participants publishing audio and video across two pause/resume
 * cycles is already eight rows, so the cap is 100 rather than 20.
 *
 * @throws InternalError when Twilio is not configured or the list call
 *         fails for any reason.
 */
export async function listRecordingsForRoom(
  roomSid: string,
): Promise<RoomRecordingSummary[]> {
  if (listByRoomOverride) {
    return listByRoomOverride(roomSid);
  }

  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recordings: roomSid is required');
  }

  const client = requireClient();

  let recordings: Array<Record<string, unknown>>;
  try {
    recordings = (await client.video.v1.recordings.list({
      groupingSid: [trimmed],
      limit:       100,
    })) as unknown as Array<Record<string, unknown>>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-recordings: list-by-room failed for ${trimmed}: ${message}`,
    );
  }

  if (recordings.length >= 100) {
    logger.warn(
      { roomSid: trimmed, count: recordings.length },
      'twilio-recordings: list-by-room hit the 100-recording cap; pagination may be needed',
    );
  }

  return recordings.map(mapRecordingRow).sort((a, b) => {
    if (a.offsetMs === b.offsetMs) return 0;
    if (a.offsetMs === null) return 1;
    if (b.offsetMs === null) return -1;
    return a.offsetMs - b.offsetMs;
  });
}

// ============================================================================
// Public: fetchRecordingMetadata
// ============================================================================

/**
 * Fetch live status, container, and size metadata for one Recording.
 *
 * @throws NotFoundError when Twilio returns a 404.
 * @throws InternalError on any other Twilio failure.
 */
export async function fetchRecordingMetadata(
  recordingSid: string,
): Promise<RecordingMetadata> {
  if (fetchMetadataOverride) {
    return fetchMetadataOverride(recordingSid);
  }

  const trimmed = recordingSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recordings: recordingSid is required');
  }

  const client = requireClient();

  try {
    const recording = await client.video.v1.recordings(trimmed).fetch();
    return {
      status:          recording.status as TwilioRecordingStatus,
      type:            toRecordingType(recording.type),
      containerFormat: toContainerFormat(recording.containerFormat),
      codec:           typeof recording.codec === 'string' ? recording.codec : null,
      durationSec:
        typeof recording.duration === 'number' ? recording.duration : undefined,
      sizeBytes:
        typeof recording.size === 'number' ? recording.size : undefined,
      mediaUrlPrefix:  getComputedTwilioRecordingMediaUrl(trimmed),
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new NotFoundError(`Recording ${trimmed} not found`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-recordings: fetch failed for ${trimmed}: ${message}`,
    );
  }
}

// ============================================================================
// Public: mintRecordingSignedUrl
// ============================================================================

/**
 * Mint a short-TTL signed URL for one raw track's media.
 *
 * The target is Matroska and is meant to be downloaded for transcoding,
 * never handed to a browser element or an STT vendor directly. See the
 * container caveat in the module header.
 *
 * @throws NotFoundError when Twilio returns a 404 for the recording.
 * @throws InternalError on any other Twilio failure or missing credentials.
 */
export async function mintRecordingSignedUrl(
  input: MintRecordingSignedUrlInput,
): Promise<MintRecordingSignedUrlResult> {
  if (mintSignedUrlOverride) {
    return mintSignedUrlOverride(input);
  }

  const trimmed = input.recordingSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recordings: recordingSid is required');
  }
  const ttlSec = Math.max(60, Math.min(input.ttlSec ?? 900, 60 * 60));

  const { sid, token } = requireCredentials();
  const url = `${getComputedTwilioRecordingMediaUrl(trimmed)}?Ttl=${ttlSec}`;
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
      `twilio-recordings: media fetch network error for ${trimmed}: ${message}`,
    );
  }

  if (res.status === 404) {
    throw new NotFoundError(`Recording ${trimmed} not found`);
  }
  if (res.status < 200 || res.status >= 400) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* swallow */
    }
    throw new InternalError(
      `twilio-recordings: media fetch failed (${res.status}) for ${trimmed}: ${body.slice(0, 300)}`,
    );
  }

  // Twilio answers with either a 302 carrying `Location` or a 200
  // carrying `{ redirect_to }`, depending on Accept negotiation.
  let signedUrl = res.headers.get('location') ?? '';
  if (!signedUrl) {
    try {
      const json = (await res.json()) as { redirect_to?: string };
      signedUrl = (json?.redirect_to ?? '').trim();
    } catch {
      /* fallthrough */
    }
  }
  if (!signedUrl) {
    throw new InternalError(
      `twilio-recordings: signed URL missing from media response for ${trimmed}`,
    );
  }

  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  logger.info(
    { recordingSid: trimmed, ttlSec, expiresAt: expiresAt.toISOString() },
    'twilio-recordings: signed URL minted',
  );
  return { signedUrl, expiresAt };
}

// ============================================================================
// Public: deleteRecording
// ============================================================================

/**
 * Delete one raw track Recording's media at Twilio
 * (`DELETE /v1/Recordings/{sid}`).
 *
 * Irreversible for the media file. Twilio keeps the REST metadata with
 * `status=deleted` for 30 days. Deleting a Recording does **not** remove
 * any Composition derived from it, and deleting a Composition does not
 * remove its source Recordings — the archival and erasure paths have to
 * walk both artifact kinds.
 *
 * @throws NotFoundError when Twilio returns a 404. Callers needing an
 *         idempotent retry map 404 to success at their own layer.
 * @throws InternalError on any other Twilio failure or missing credentials.
 */
export async function deleteRecording(recordingSid: string): Promise<void> {
  if (deleteRecordingOverride) {
    return deleteRecordingOverride(recordingSid);
  }

  const trimmed = recordingSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recordings: recordingSid is required');
  }

  const client = requireClient();

  try {
    await client.video.v1.recordings(trimmed).remove();
    logger.info(
      { recordingSid: trimmed, outcome: 'deleted' },
      'twilio-recordings: recording deleted',
    );
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      logger.info(
        { recordingSid: trimmed, outcome: 'not_found' },
        'twilio-recordings: recording delete not found',
      );
      throw new NotFoundError(`Recording ${trimmed} not found`);
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { recordingSid: trimmed, outcome: 'failed', error: message },
      'twilio-recordings: recording delete failed',
    );
    throw new InternalError(
      `twilio-recordings: delete failed for ${trimmed}: ${message}`,
    );
  }
}
