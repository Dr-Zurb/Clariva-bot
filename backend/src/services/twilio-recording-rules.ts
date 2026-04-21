/**
 * Twilio Recording Rules — merge-aware wrapper (Plan 07 · Task 28).
 *
 * Twilio's `RecordingRules.update()` is a **wholesale-replace** primitive:
 * the rules array you send overwrites whatever was previously set for
 * the room. That's a trap for a shared surface — if Plan 07 pauses
 * `audio` inclusion with `[{ type: 'exclude', all: true, kind: 'audio' }]`
 * it would accidentally clobber a Plan 08 video-inclusion rule that was
 * previously added for an in-progress escalation. Conversely, resuming
 * audio without knowing the current video state would silently re-enable
 * video if Plan 08 had turned it off.
 *
 * This wrapper centralises the "fetch → merge → send" ritual so every
 * caller says "exclude audio" / "include audio" / "exclude video" /
 * "include video" without having to know what the other `kind` is
 * currently set to. The merge semantics:
 *
 *   - Each (kind, `all=true`) pair gets AT MOST ONE entry in the rules
 *     array — we normalise to that shape on every update.
 *   - `include` and `exclude` for the same kind are mutually exclusive;
 *     the last-write-wins.
 *   - Other rule shapes (per-participant rules via `publisher` /
 *     `participant_identity`) are passed through unchanged. Plan 07/08
 *     don't emit them today, but a future per-patient selective
 *     recording rule would.
 *
 * **Idempotency:** a second `excludeAllParticipantsFromRecording(room,
 * 'audio')` after a successful first call is a no-op — the merge
 * produces an identical rules array and Twilio's own API handles the
 * idempotent replace.
 *
 * **Testability:** the client is resolved via `getTwilioClient()` so
 * unit tests can mock it at the module level. The two exported helpers
 * return void on success; they throw `InternalError` on any Twilio
 * failure (the recording-pause-service catches this and writes a
 * `status: 'failed'` audit row).
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-28-recording-pause-resume-mid-consult.md
 * @see backend/src/services/video-session-twilio.ts · applyAudioOnlyRecordingRules (the create-time baseline this wrapper extends)
 */

import Twilio from 'twilio';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export type RecordingRuleKind = 'audio' | 'video';
export type RecordingRuleType = 'include' | 'exclude';

/**
 * Subset of Twilio's `RecordingRule` shape that this wrapper knows how
 * to merge. The `all` flag means "applies to all participants";
 * per-participant rules (`publisher`, `participant_identity`) are
 * passed through untouched via the `unknown[]` sidecar.
 */
interface AllParticipantsRule {
  type: RecordingRuleType;
  all: true;
  kind: RecordingRuleKind;
}

function isAllParticipantsRule(rule: unknown): rule is AllParticipantsRule {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as Record<string, unknown>;
  return (
    (r.type === 'include' || r.type === 'exclude') &&
    r.all === true &&
    (r.kind === 'audio' || r.kind === 'video')
  );
}

// ============================================================================
// Twilio client
// ============================================================================

/**
 * Twilio client for Recording Rules calls. Resolved lazily so unit
 * tests can mock the `twilio` module at import time; also so the
 * wrapper module doesn't error at load time when credentials are
 * absent (local dev / CI without Twilio).
 */
function getTwilioClient(): Twilio.Twilio | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

// ============================================================================
// Rule merge
// ============================================================================

/**
 * Fetch the current rules array for `roomSid` and merge a new
 * (type, kind, all=true) rule into it. Preserves any non-all rules
 * unchanged. De-duplicates by `kind` so at most one `all=true` rule
 * exists per kind after the merge.
 *
 * Exported for unit-test access; callers in this file go through the
 * exclude/include helpers.
 */
export async function mergeAllParticipantsRule(
  client: Twilio.Twilio,
  roomSid: string,
  next: AllParticipantsRule,
): Promise<unknown[]> {
  // Twilio's SDK returns `{ rules: RecordingRule[] }` on fetch; shape
  // varies slightly by SDK version so we widen to `unknown[]` for
  // resilience and re-narrow via `isAllParticipantsRule`.
  let currentRules: unknown[] = [];
  try {
    const current = await client.video.v1.rooms(roomSid).recordingRules.fetch();
    const rulesUnknown = (current as { rules?: unknown }).rules;
    if (Array.isArray(rulesUnknown)) {
      currentRules = rulesUnknown;
    }
  } catch (err) {
    // A fresh room that never had rules applied returns a default shape;
    // treat any fetch failure as "no prior rules" and proceed with the
    // replacement. We log at warn to surface persistent fetch issues.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { roomSid, error: message },
      'twilio-recording-rules: fetch failed; proceeding with merge from empty',
    );
  }

  const merged: unknown[] = [];
  for (const rule of currentRules) {
    if (isAllParticipantsRule(rule)) {
      if (rule.kind === next.kind) continue;
      merged.push(rule);
    } else {
      merged.push(rule);
    }
  }
  merged.push(next);
  return merged;
}

// ============================================================================
// Public helpers
// ============================================================================

/**
 * Set a `{ type: 'exclude', all: true, kind }` rule on the room,
 * merging with whatever else was there. Used by
 * `recording-pause-service.pauseRecording`.
 *
 * @throws InternalError on missing credentials or Twilio API failure.
 */
export async function excludeAllParticipantsFromRecording(
  roomSid: string,
  kind: RecordingRuleKind,
  correlationId: string,
): Promise<void> {
  await applyAllParticipantsRule(roomSid, { type: 'exclude', all: true, kind }, correlationId);
}

/**
 * Set a `{ type: 'include', all: true, kind }` rule on the room,
 * merging with whatever else was there. Used by
 * `recording-pause-service.resumeRecording`.
 *
 * @throws InternalError on missing credentials or Twilio API failure.
 */
export async function includeAllParticipantsInRecording(
  roomSid: string,
  kind: RecordingRuleKind,
  correlationId: string,
): Promise<void> {
  await applyAllParticipantsRule(roomSid, { type: 'include', all: true, kind }, correlationId);
}

async function applyAllParticipantsRule(
  roomSid: string,
  rule: AllParticipantsRule,
  correlationId: string,
): Promise<void> {
  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recording-rules: roomSid is required');
  }

  const client = getTwilioClient();
  if (!client) {
    throw new InternalError(
      'twilio-recording-rules: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }

  const merged = await mergeAllParticipantsRule(client, trimmed, rule);

  try {
    await client.video.v1.rooms(trimmed).recordingRules.update({
      rules: merged as Parameters<
        ReturnType<typeof client.video.v1.rooms>['recordingRules']['update']
      >[0]['rules'],
    });
    logger.info(
      {
        correlationId,
        roomSid: trimmed,
        ruleType: rule.type,
        kind: rule.kind,
        ruleCount: merged.length,
      },
      'twilio-recording-rules: applied',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        correlationId,
        roomSid: trimmed,
        ruleType: rule.type,
        kind: rule.kind,
        error: message,
      },
      'twilio-recording-rules: update failed',
    );
    throw new InternalError(
      `Failed to ${rule.type} ${rule.kind} on room ${trimmed}: ${message}`,
    );
  }
}

// ============================================================================
// Mode-level helpers (Plan 08 · Task 43)
// ============================================================================

/**
 * Twilio returned 404 on the Recording Rules endpoint — either the room
 * was never created, or it has been completed + garbage-collected.
 * Thrown from `getCurrentRecordingMode` / the mode setters so callers
 * (recording-track-service) can decide whether to fail the consult or
 * recover (e.g. skip the ledger's `completed` row and emit a session-
 * already-ended path).
 *
 * Keep the class narrow — no `cause` / no code field — so it's cheap
 * for callers to `err instanceof TwilioRoomNotFoundError`.
 */
export class TwilioRoomNotFoundError extends Error {
  readonly roomSid: string;

  constructor(roomSid: string, cause?: string) {
    super(
      cause
        ? `Twilio room ${roomSid} not found: ${cause}`
        : `Twilio room ${roomSid} not found`,
    );
    this.name = 'TwilioRoomNotFoundError';
    this.roomSid = roomSid;
  }
}

/**
 * Mode-level view of the Recording Rules on a room. Plan 08 Decision 10
 * LOCKED the three runtime states (audio-only default → audio+video on
 * escalation → back to audio-only). The `RecordingMode` type flattens
 * the per-kind include/exclude grammar into those three states.
 *
 *   · `'audio_only'`       — audio included (or no explicit rule) AND
 *                            video NOT included (explicitly excluded
 *                            OR implicitly absent).
 *   · `'audio_and_video'`  — BOTH audio and video have an
 *                            `{ type: 'include', all: true, kind }`
 *                            rule in effect.
 *   · `'other'`            — the current rules don't match either
 *                            canonical shape (e.g. video is included
 *                            but audio is explicitly excluded — a state
 *                            Plan 08 never produces). Defensive value
 *                            so the caller can fail-closed rather than
 *                            silently coercing.
 *
 * The interpretation is **permissive about the default audio-only
 * shape** — Twilio's out-of-the-box "no rules" behaviour records all
 * published tracks, but our video adapter + voice adapter both call
 * `applyAudioOnlyRecordingRules` at room-create time so by the point
 * Task 43 reads rules, an `audio_only` shape should always be present.
 * Even so we treat "no rules" as `'other'` rather than `'audio_only'`
 * to force the caller through the explicit set-audio-only path and
 * land a ledger row.
 */
export type RecordingMode = 'audio_only' | 'audio_and_video' | 'other';

interface InterpretedRules {
  audioState: 'include' | 'exclude' | 'absent';
  videoState: 'include' | 'exclude' | 'absent';
  rawRules:   unknown[];
}

async function fetchCurrentRules(
  client: Twilio.Twilio,
  roomSid: string,
): Promise<unknown[]> {
  try {
    const current = await client.video.v1.rooms(roomSid).recordingRules.fetch();
    const rulesUnknown = (current as { rules?: unknown }).rules;
    return Array.isArray(rulesUnknown) ? rulesUnknown : [];
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TwilioRoomNotFoundError(roomSid, message);
    }
    throw err;
  }
}

function interpretRules(rawRules: unknown[]): InterpretedRules {
  let audioState: InterpretedRules['audioState'] = 'absent';
  let videoState: InterpretedRules['videoState'] = 'absent';
  for (const rule of rawRules) {
    if (!isAllParticipantsRule(rule)) continue;
    if (rule.kind === 'audio') {
      audioState = rule.type === 'include' ? 'include' : 'exclude';
    } else if (rule.kind === 'video') {
      videoState = rule.type === 'include' ? 'include' : 'exclude';
    }
  }
  return { audioState, videoState, rawRules };
}

function modeFrom(interp: InterpretedRules): RecordingMode {
  const audioIncluded = interp.audioState === 'include';
  const videoIncluded = interp.videoState === 'include';
  const videoSuppressed = interp.videoState === 'exclude';
  if (audioIncluded && videoSuppressed) return 'audio_only';
  if (audioIncluded && videoIncluded) return 'audio_and_video';
  return 'other';
}

/**
 * Read the current Recording Rules for a room and return its canonical
 * mode. Side-effect free (does NOT fetch multiple times / mutate
 * anything). Useful for the mode setters' idempotency short-circuit
 * and for debugging scripts.
 *
 * @throws TwilioRoomNotFoundError when Twilio returns 404.
 * @throws InternalError when Twilio is not configured, or on any other
 *         Twilio fetch failure.
 */
export async function getCurrentRecordingMode(roomSid: string): Promise<RecordingMode> {
  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recording-rules: roomSid is required');
  }
  const client = getTwilioClient();
  if (!client) {
    throw new InternalError(
      'twilio-recording-rules: Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN missing)',
    );
  }

  try {
    const rawRules = await fetchCurrentRules(client, trimmed);
    return modeFrom(interpretRules(rawRules));
  } catch (err) {
    if (err instanceof TwilioRoomNotFoundError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new InternalError(
      `twilio-recording-rules: fetch failed for room ${trimmed}: ${message}`,
    );
  }
}

/**
 * Plan 08 Task 43 — set Recording Rules on a room to the canonical
 * `audio_only` shape (`include audio` + `exclude video`).
 *
 * **Idempotent.** Reads current rules first; short-circuits (no PATCH)
 * when already in `audio_only` mode. Every call is one Twilio fetch;
 * flipping calls are one fetch + one PATCH.
 *
 * Under the hood this composes two merge-aware rule applications
 * (audio include, video exclude) so any per-participant rules that a
 * future plan adds are preserved.
 *
 * @throws TwilioRoomNotFoundError when Twilio returns 404.
 * @throws InternalError on any other Twilio failure.
 */
export async function setRecordingRulesToAudioOnly(
  roomSid: string,
  correlationId: string,
): Promise<void> {
  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recording-rules: roomSid is required');
  }

  const currentMode = await getCurrentRecordingMode(trimmed);
  if (currentMode === 'audio_only') {
    logger.info(
      { correlationId, roomSid: trimmed, currentMode },
      'twilio-recording-rules: setRecordingRulesToAudioOnly short-circuit (already audio_only)',
    );
    return;
  }

  await includeAllParticipantsInRecording(trimmed, 'audio', correlationId);
  await excludeAllParticipantsFromRecording(trimmed, 'video', correlationId);

  logger.info(
    { correlationId, roomSid: trimmed, from: currentMode, to: 'audio_only' },
    'twilio-recording-rules: mode flipped to audio_only',
  );
}

/**
 * Plan 08 Task 43 — set Recording Rules on a room to the canonical
 * `audio_and_video` shape (both `include audio` and `include video`).
 *
 * **Idempotent.** Reads current rules first; short-circuits (no PATCH)
 * when already in `audio_and_video` mode.
 *
 * Under the hood this composes two merge-aware rule applications
 * (audio include, video include) so any per-participant rules that a
 * future plan adds are preserved.
 *
 * @throws TwilioRoomNotFoundError when Twilio returns 404.
 * @throws InternalError on any other Twilio failure.
 */
export async function setRecordingRulesToAudioAndVideo(
  roomSid: string,
  correlationId: string,
): Promise<void> {
  const trimmed = roomSid?.trim();
  if (!trimmed) {
    throw new InternalError('twilio-recording-rules: roomSid is required');
  }

  const currentMode = await getCurrentRecordingMode(trimmed);
  if (currentMode === 'audio_and_video') {
    logger.info(
      { correlationId, roomSid: trimmed, currentMode },
      'twilio-recording-rules: setRecordingRulesToAudioAndVideo short-circuit (already audio_and_video)',
    );
    return;
  }

  await includeAllParticipantsInRecording(trimmed, 'audio', correlationId);
  await includeAllParticipantsInRecording(trimmed, 'video', correlationId);

  logger.info(
    { correlationId, roomSid: trimmed, from: currentMode, to: 'audio_and_video' },
    'twilio-recording-rules: mode flipped to audio_and_video',
  );
}
