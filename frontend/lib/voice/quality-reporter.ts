/**
 * Voice Call Quality Reporter — Sub-batch C · task-voice-C2.
 *
 * Per-call QoS sampler that reads `room.getStats()` +
 * `room.localParticipant.networkQualityLevel` on a 10s/30s cadence,
 * buffers samples in memory, and flushes batched POSTs to the backend
 * `POST /api/v1/consultation/:sessionId/voice-quality` endpoint
 * (Migration 105 + `voice-call-quality-service.ts`).
 *
 * Voice analog of `frontend/lib/video/quality-reporter.ts`. Same
 * cadence + buffering doctrine, fewer fields (no resolution / fps /
 * kbps — voice is audio-only).
 *
 * Cadence (decision §13 — same as video E6 sibling)
 * --------------------------------------------------
 * The first 60 seconds of a call are when the user is most likely to
 * notice problems — they're switching networks and the SDK is warming
 * up. We sample EVERY 10 SECONDS for the first minute (6 samples) so
 * analytics captures the warmup curve. After 60s, we relax to 30s
 * cadence (~58 samples in the next 29min). Total per side per 30-min
 * call ≈ 64 samples, ≈ 128 across both sides — well under the 256
 * batch cap on the backend.
 *
 * Buffering + flush
 * -----------------
 * Samples accumulate in an in-memory buffer. A separate flush timer
 * drains the buffer every 60s, batching all available samples into one
 * POST. This:
 *   - Reduces request count by ~10× vs per-sample posting.
 *   - Survives transient network blips (the buffer keeps growing while
 *     the next flush is queued; one failed flush gets retried by the
 *     next interval, no data lost — subject to the high-watermark cap).
 *   - On `dispose()`, we do a final synchronous flush before the call
 *     teardown so the last 60s of samples land in the DB.
 *
 * Idempotent dispose
 * ------------------
 * `dispose()` can be called multiple times (parent `<VoiceConsultRoom>`
 * unmount + Twilio `disconnected` event can both fire). We track a
 * `disposed` flag and no-op subsequent calls. The final flush is
 * fire-and-forget (we don't await it; React unmount can't block).
 *
 * PHI hygiene (spec §"PHI hygiene")
 * ---------------------------------
 * Samples contain ONLY:
 *   - Network metrics (RTT, jitter, packet loss, network quality level)
 *   - Acoustic metrics (audio in/out level, scaled to 0..100)
 *   - Twilio room SID (for cross-referencing with Twilio's
 *     composition logs)
 *
 * NO transcript content, NO message bodies, NO identifiers beyond what
 * the backend already correlates via the sessionId path param.
 *
 * Why we reuse video's `twilio-stats-parse.ts`
 * --------------------------------------------
 * Twilio's `Room.getStats()` shape is identical for voice + video; the
 * audio parsers (RTT, jitter, packet loss, audio levels) are exactly
 * the same regardless of whether a video track is also published.
 * The video parsers (resolution, fps, kbps) are simply not called
 * here. Sharing the module avoids drift.
 *
 * @see frontend/lib/video/twilio-stats-parse.ts (the shared parsers)
 * @see frontend/lib/api.ts (postConsultationVoiceQuality — the POST helper)
 * @see backend/src/services/voice-call-quality-service.ts (the ingest endpoint)
 * @see frontend/components/consultation/VoiceConsultRoom.tsx (the mount site)
 */

import type { Room } from "twilio-video";
import {
  pickFirst,
  readAudioInputLevel,
  readAudioOutputLevel,
  readJitter,
  readPacketLossPct,
  readRtt,
  type LooseStatsReport,
} from "../video/twilio-stats-parse";

// ============================================================================
// Public types
// ============================================================================

/** Caller role — mirrors the backend's `CallerRole` enum. */
export type VoiceQualityReporterRole = "doctor" | "patient";

/**
 * One voice QoS sample. Field names mirror the column names in
 * `voice_call_quality` table (snake_case → camelCase). Backend
 * `validateSample` accepts these directly. All metrics are nullable —
 * Twilio doesn't always populate every field.
 */
export interface VoiceQualitySample {
  /** Per-(session, role) monotonic 0-indexed counter. */
  sampleSeq: number;
  networkQualityLevel: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  audioInputLevel: number | null;
  audioOutputLevel: number | null;
  twilioRoomSid: string | null;
}

/** What the backend POST helper takes — see `frontend/lib/api.ts`. */
export type VoiceSamplePoster = (samples: VoiceQualitySample[]) => Promise<unknown>;

export interface CreateVoiceQualityReporterOptions {
  /** Twilio Room — the source of all stats. */
  room: Room;
  /** Path-param sessionId for the POST URL. Forwarded to the poster. */
  sessionId: string;
  /** Caller role — doctor uses Supabase session JWT; patient uses companion JWT. */
  role: VoiceQualityReporterRole;
  /**
   * The fully-bound POST function — already knows sessionId + bearer.
   * Reporter just hands it the batched samples; it sends + handles errors.
   * `lib/api.ts#postConsultationVoiceQuality` is the canonical implementation.
   */
  poster: VoiceSamplePoster;
}

export interface VoiceQualityReporter {
  /** Manually trigger a flush — mostly for tests. Production callers don't need this. */
  flush: () => Promise<void>;
  /** Idempotent stop + final flush. Safe to call multiple times. */
  dispose: () => void;
}

// ============================================================================
// Cadence + buffer constants
// ============================================================================

/** Sample every 10s for the first minute of the call. */
export const VOICE_FAST_CADENCE_MS = 10_000;
/** Then 30s thereafter. */
export const VOICE_SLOW_CADENCE_MS = 30_000;
/** Boundary — switch from fast to slow at 60s. */
export const VOICE_FAST_PHASE_DURATION_MS = 60_000;
/** Flush the buffer every 60s. */
export const VOICE_FLUSH_INTERVAL_MS = 60_000;
/**
 * Defensive cap — if the buffer ever exceeds this, drop oldest first.
 * Should never trigger in practice (~64 samples per 30-min call), but
 * guards against the unlikely scenario where flush fails for many
 * minutes in a row (network outage). Better to lose oldest data than
 * OOM the renderer.
 */
const BUFFER_HIGH_WATERMARK = 200;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a voice QoS reporter bound to a live Twilio room. Caller is
 * responsible for invoking `dispose()` on call teardown (the reporter
 * doesn't subscribe to room events — too many edge cases with
 * reconnects; the parent `<VoiceConsultRoom>` already owns the
 * lifecycle).
 *
 * Sampling starts immediately (first sample at t=0) and continues on
 * the cadence schedule until `dispose()` is called.
 */
export function createVoiceQualityReporter(
  options: CreateVoiceQualityReporterOptions,
): VoiceQualityReporter {
  const { room, sessionId, role, poster } = options;

  let disposed = false;
  let sampleSeq = 0;
  const buffer: VoiceQualitySample[] = [];
  const callStartMs = Date.now();

  let sampleTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Pick the next cadence based on call age. Fast (10s) for the first
   * 60s, slow (30s) thereafter. Pure function of elapsed time.
   */
  function nextCadenceMs(): number {
    const elapsed = Date.now() - callStartMs;
    return elapsed < VOICE_FAST_PHASE_DURATION_MS
      ? VOICE_FAST_CADENCE_MS
      : VOICE_SLOW_CADENCE_MS;
  }

  /**
   * Take one sample. Reads `room.getStats()` + the local participant's
   * `networkQualityLevel`, parses through the shared module, pushes
   * onto the buffer.
   *
   * Errors are swallowed — a single failed sample shouldn't crash the
   * sampler loop. The next tick recovers.
   */
  async function takeSample(): Promise<void> {
    if (disposed) return;
    try {
      const reports = (await room.getStats()) as unknown as LooseStatsReport[];
      const report = pickFirst(reports);
      if (!report) {
        // No peer connection yet (pre-connect); skip but still
        // increment the seq so the gap is visible in analytics.
        sampleSeq += 1;
        return;
      }

      const networkQualityLevel =
        typeof room.localParticipant?.networkQualityLevel === "number"
          ? room.localParticipant.networkQualityLevel
          : null;

      const sample: VoiceQualitySample = {
        sampleSeq: sampleSeq++,
        networkQualityLevel,
        rttMs: readRtt(report),
        jitterMs: readJitter(report),
        packetLossPct: readPacketLossPct(report),
        audioInputLevel: readAudioInputLevel(report),
        audioOutputLevel: readAudioOutputLevel(report),
        twilioRoomSid: typeof room.sid === "string" ? room.sid : null,
      };

      buffer.push(sample);

      // Defensive overflow guard — see BUFFER_HIGH_WATERMARK rationale.
      while (buffer.length > BUFFER_HIGH_WATERMARK) {
        buffer.shift();
      }
    } catch {
      // Swallow per docstring contract — next tick recovers.
    }
  }

  /**
   * Flush the buffer to the backend. Snapshots the current buffer (so
   * a sample taken mid-POST goes into the next batch instead of being
   * lost), POSTs, and clears the snapshotted slice on success. On
   * failure, restores the snapshot to the front of the buffer so the
   * next flush retries (subject to the high-watermark cap).
   */
  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    // Snapshot + clear. If the POST fails, we re-prepend.
    const batch = buffer.splice(0, buffer.length);
    try {
      await poster(batch);
    } catch {
      // POST failed — restore to front of buffer so the next flush
      // retries. Subject to the high-watermark cap on takeSample.
      buffer.unshift(...batch);
    }
  }

  /**
   * Schedule the next sample tick. We use a recursive setTimeout
   * (instead of setInterval) so the cadence can switch from fast to
   * slow at the 60s boundary without a separate boundary-detection
   * loop. Each tick re-asks `nextCadenceMs()`.
   */
  function scheduleNextSample(): void {
    if (disposed) return;
    sampleTimer = setTimeout(async () => {
      await takeSample();
      scheduleNextSample();
    }, nextCadenceMs());
  }

  // Start sampling immediately so the first sample lands at t=0
  // (analytics need the early-call snapshot for warmup analysis).
  void takeSample().then(() => scheduleNextSample());

  // Flush every 60s. The first flush fires at t=60s by design — the
  // first batch picks up the 6 fast-phase samples + the first
  // 30s-cadence sample, ~7 samples. Cheap, and aligns batches with
  // the cadence boundary so per-batch sample counts are predictable.
  flushTimer = setInterval(() => {
    void flush();
  }, VOICE_FLUSH_INTERVAL_MS);

  return {
    flush,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (sampleTimer != null) {
        clearTimeout(sampleTimer);
        sampleTimer = null;
      }
      if (flushTimer != null) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      // Final flush — fire-and-forget. React unmount can't block.
      // The poster's own error handling kicks in if the network is
      // already torn down (e.g. tab close); we accept losing the last
      // 60s of samples in the worst case.
      void flush();
      // Suppress unused-variable warning for `role` + `sessionId` —
      // they're forwarded into the poster closure at construction
      // time (the poster is bound by the caller — see lib/api.ts).
      void role;
      void sessionId;
    },
  };
}
