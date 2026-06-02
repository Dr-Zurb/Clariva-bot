/**
 * twilio-stats-parse — pure parsers for Twilio's `Room.getStats()` output.
 *
 * Sub-batch E · task-video-E6 (`task-video-E6-qos-health-metrics.md`).
 *
 * Why a shared module
 * -------------------
 * Two callers need the same field-extraction logic on the same Twilio
 * `StatsReport` shape:
 *
 *   1. `frontend/hooks/useVideoCallStats.ts` (Sub-batch A · A8) — 2s
 *      polling for the in-call stats tooltip / debug panel.
 *   2. `frontend/lib/video/quality-reporter.ts` (this batch · E.6) —
 *      10s/30s cadence sampler that buffers + posts to
 *      `video_call_quality` for ops analytics.
 *
 * Both must:
 *   - Tolerate twilio-video TS-defs being narrower than the runtime
 *     shape (the SDK includes `roundTripTime` / `jitter` / `frameRate` /
 *     `audioLevel` fields that aren't always in the type defs of older
 *     versions). We read defensively through a permissive structural
 *     type and fall through to `null` on missing fields.
 *   - Convert seconds-vs-milliseconds heuristically (Twilio's API
 *     returns RTT + jitter in seconds for newer SDKs, ms for older).
 *   - Compute kbps from byte deltas (Twilio reports cumulative
 *     `bytesSent` / `bytesReceived`; the FIRST sample has no prior to
 *     delta against → returns null).
 *
 * E.6 also needs `audioInputLevel` + `audioOutputLevel` (linear PCM
 * amplitude 0..1 in newer SDKs, scaled here to the 0..100 Twilio
 * Network Quality output convention to match the
 * `voice_call_quality.audio_input_level NUMERIC(5,2)` shape that voice
 * C2 sibling will use).
 *
 * Design constraints
 * ------------------
 * - **Pure**: every exported function is `(input) => output` with no
 *   side effects. Easy to unit-test (deferred per spec — voice C2
 *   ships its own QoS reporter tests; same parsers).
 * - **Defensive**: every field read goes through `typeof === 'number' &&
 *   Number.isFinite(...)` because Twilio's stats array sometimes
 *   contains stale per-track entries that have been "torn down" but
 *   not yet GC'd, and those carry NaN / undefined fields.
 * - **No SDK imports**: we use a structural `LooseStatsReport` type
 *   instead of importing twilio-video's `StatsReport` so this module
 *   can be unit-tested without spinning up a Twilio mock.
 *
 * @see frontend/hooks/useVideoCallStats.ts (existing consumer)
 * @see frontend/lib/video/quality-reporter.ts (E.6 reporter — the
 *      reason we factored this out)
 */

// ============================================================================
// Public types
// ============================================================================

/**
 * Permissive structural type — twilio-video's TS defs aren't always
 * exhaustive across SDK versions (we run @^2.34.0). Reading fields
 * defensively here so the hook + reporter work whether the SDK
 * populates `roundTripTime` (newer) or `roundTripTimeMS` (older).
 *
 * Exported so consumers can cast `room.getStats()` results without
 * pulling in this module's parsers if they have a one-off field need
 * (rare — most callers want the parsers).
 */
export interface LooseTrackStats {
  bytesSent?: number;
  bytesReceived?: number;
  /** Newer SDK: RTT in seconds. Older SDK: RTT in ms via `roundTripTimeMS`. */
  roundTripTime?: number;
  /** Older SDK alt — RTT already in ms. */
  roundTripTimeMS?: number;
  /** Newer SDK: jitter in seconds. */
  jitter?: number;
  /** Older SDK alt — jitter in ms. */
  jitterBufferMs?: number;
  /** Twilio's normalised audio level (0..1 newer SDKs; 0..32767 raw older). */
  audioLevel?: number;
  /** Total packet loss count (cumulative). */
  packetsLost?: number;
  /** Total packet count (cumulative). For loss-pct = packetsLost / packetsSent. */
  packetsSent?: number;
  packetsReceived?: number;
  dimensions?: { width?: number; height?: number };
  frameRate?: number;
  timestamp?: number;
}

export interface LooseStatsReport {
  localAudioTrackStats?: LooseTrackStats[];
  localVideoTrackStats?: LooseTrackStats[];
  remoteAudioTrackStats?: LooseTrackStats[];
  remoteVideoTrackStats?: LooseTrackStats[];
}

// ============================================================================
// Pure parsers
// ============================================================================

/** Pick the first element of an array, defensively returning undefined for
 *  empty / undefined arrays. */
export function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length > 0 ? arr[0] : undefined;
}

/**
 * Extract round-trip time in milliseconds from the local audio track
 * stats. Audio is the most-reliable RTT source (video has buffering
 * effects). Returns null if the SDK hasn't populated the field yet.
 *
 * Heuristic for seconds-vs-ms: values < 10 are clearly seconds (a real
 * RTT is rarely below 10ms in production), values >= 10 are ms.
 */
export function readRtt(report: LooseStatsReport): number | null {
  const audio = pickFirst(report.localAudioTrackStats);
  if (!audio) return null;
  if (typeof audio.roundTripTime === "number" && Number.isFinite(audio.roundTripTime)) {
    return audio.roundTripTime < 10
      ? Math.round(audio.roundTripTime * 1000)
      : Math.round(audio.roundTripTime);
  }
  if (typeof audio.roundTripTimeMS === "number" && Number.isFinite(audio.roundTripTimeMS)) {
    return Math.round(audio.roundTripTimeMS);
  }
  return null;
}

/**
 * Extract jitter in milliseconds. Same seconds-vs-ms heuristic as
 * `readRtt` (Twilio's `jitter` is documented in seconds; values < 1 are
 * clearly seconds).
 */
export function readJitter(report: LooseStatsReport): number | null {
  const audio = pickFirst(report.localAudioTrackStats);
  if (!audio) return null;
  if (typeof audio.jitter === "number" && Number.isFinite(audio.jitter)) {
    return audio.jitter < 1
      ? Math.round(audio.jitter * 1000)
      : Math.round(audio.jitter);
  }
  if (typeof audio.jitterBufferMs === "number" && Number.isFinite(audio.jitterBufferMs)) {
    return Math.round(audio.jitterBufferMs);
  }
  return null;
}

/**
 * Local video track resolution (the dimensions WE'RE sending). Returns
 * null if no local video track or the SDK hasn't populated dimensions.
 *
 * Note: this is the SENT resolution, not the received. Twilio adapts
 * the encoding to network conditions, so this is the right number to
 * track for E1 adaptive-bitrate analytics.
 */
export function readResolution(
  report: LooseStatsReport,
): { width: number; height: number } | null {
  const video = pickFirst(report.localVideoTrackStats);
  if (!video?.dimensions) return null;
  const { width, height } = video.dimensions;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Local video frame rate (fps we're sending). Same caveat as
 * `readResolution` — this is SEND fps, the right metric for E1
 * adaptive-bitrate + C2 virtual-background impact analytics.
 */
export function readFps(report: LooseStatsReport): number | null {
  const video = pickFirst(report.localVideoTrackStats);
  if (!video || typeof video.frameRate !== "number" || !Number.isFinite(video.frameRate)) {
    return null;
  }
  return Math.round(video.frameRate);
}

/**
 * Audio input level (microphone amplitude WE'RE sending). Twilio
 * reports `audioLevel` as a 0..1 normalised value in newer SDKs; we
 * scale to 0..100 to match the
 * `voice_call_quality.audio_input_level NUMERIC(5,2)` shape that voice
 * C2 will use. Truncates to 2 decimal places to fit the column scale.
 *
 * Used by E.6 reporter only (the in-call tooltip in `useVideoCallStats`
 * doesn't surface audio levels — that's the noise-suppression badge's
 * job, C1).
 */
export function readAudioInputLevel(report: LooseStatsReport): number | null {
  const audio = pickFirst(report.localAudioTrackStats);
  if (!audio) return null;
  return scaleAudioLevel(audio.audioLevel);
}

/**
 * Audio output level (speaker amplitude WE'RE receiving). Same scaling
 * as `readAudioInputLevel`. Tracks "is the patient speaking?" / "is
 * the doctor's voice coming through?" diagnostics post-call.
 */
export function readAudioOutputLevel(report: LooseStatsReport): number | null {
  const audio = pickFirst(report.remoteAudioTrackStats);
  if (!audio) return null;
  return scaleAudioLevel(audio.audioLevel);
}

/**
 * Packet loss percentage from the local audio track (audio is the
 * most-reliable signal — video drops packets aggressively as part of
 * normal degradation, audio drops are the real "did the user hear it?"
 * indicator).
 *
 * Computed as `packetsLost / (packetsSent + packetsLost) * 100`. Clamped
 * to [0, 100]. Returns null if either counter is absent.
 *
 * Note: cumulative counters mean this metric is a LIFETIME loss-pct,
 * not a per-window loss-pct. For the analytics use case ("did this
 * call have lossy audio?") that's the right number; for real-time
 * adaptive control we'd need per-window deltas (E.3 already handles
 * that via Twilio's `networkQualityLevel`).
 */
export function readPacketLossPct(report: LooseStatsReport): number | null {
  const audio = pickFirst(report.localAudioTrackStats);
  if (!audio) return null;
  const lost = audio.packetsLost;
  const sent = audio.packetsSent;
  if (
    typeof lost !== "number" ||
    typeof sent !== "number" ||
    !Number.isFinite(lost) ||
    !Number.isFinite(sent)
  ) {
    return null;
  }
  const total = lost + sent;
  if (total <= 0) return null;
  const pct = (lost / total) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

/**
 * Compute kbps from a cumulative byte counter. Returns `null` for the
 * first sample (no prior to delta against), real values thereafter.
 *
 * Bytes-per-millisecond * 1000 = bytes-per-second. Bytes-per-second
 * * 8 = bits-per-second. Bits-per-second / 1000 = kilobits-per-second.
 *
 * Defensive: clamp to 0 if Twilio resets the counter mid-sample (e.g.
 * peer reconnect). A negative delta would render as a huge negative
 * bitrate which is meaningless to consumers.
 */
export function computeKbps(
  currentBytes: number | null,
  prevBytes: number | null,
  deltaMs: number,
): number | null {
  if (currentBytes == null || prevBytes == null || deltaMs <= 0) return null;
  if (!Number.isFinite(currentBytes) || !Number.isFinite(prevBytes) || !Number.isFinite(deltaMs)) {
    return null;
  }
  const deltaBytes = currentBytes - prevBytes;
  if (deltaBytes < 0) return 0;
  const bytesPerSec = (deltaBytes * 1000) / deltaMs;
  return Math.round((bytesPerSec * 8) / 1000);
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Scale Twilio's audio level into the 0..100 NUMERIC(5,2) shape used
 * by the DB columns. Returns null on absent / non-numeric / non-finite
 * input. Two scaling regimes:
 *   - Newer SDKs report 0..1 (most common today).
 *   - Older SDKs report 0..32767 (16-bit raw).
 * Heuristic: values <= 1 → newer regime → multiply by 100. Values > 1
 * → older regime → multiply by (100/32767). This matches Twilio's own
 * level-bar UI normalisation.
 */
function scaleAudioLevel(level: number | undefined): number | null {
  if (typeof level !== "number" || !Number.isFinite(level)) return null;
  if (level <= 0) return 0;
  const scaled = level <= 1 ? level * 100 : (level * 100) / 32767;
  // Fit NUMERIC(5,2) — three integer digits + two decimals max.
  // Clamp to [0, 100] and round to 2 decimal places.
  const clamped = Math.max(0, Math.min(100, scaled));
  return Math.round(clamped * 100) / 100;
}
