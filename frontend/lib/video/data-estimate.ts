/**
 * Sub-batch E · task-video-E7 — pure helpers for the cellular-data
 * warning modal.
 *
 * Two responsibilities, both pure (so they're trivially testable + safe
 * for SSR):
 *
 *   1. **Cellular detection** — wrap `navigator.connection` (Network
 *      Information API) into a tri-state result: cellular / not cellular
 *      / unknown. Safari has no support whatsoever; Chrome / Edge ship
 *      it on Android but only behind a flag on desktop (and even then
 *      `connection.type` is often `'unknown'`). The unknown branch
 *      means "skip the warning" — we'd rather under-warn than blast a
 *      data-cost dialog at a Wi-Fi user.
 *
 *   2. **MB-per-minute estimates** — map a `QualityOption` (B8) to a
 *      coarse MB/min figure, then to total MB for a given duration.
 *      Numbers are deliberate undershoots vs Twilio's adaptive ceiling
 *      so the user isn't blindsided when actual usage is higher than
 *      the estimate (the warning is meant to make the user think, not
 *      to produce a billing-grade meter).
 *
 * Decision §30 — figures align with the task spec:
 *   1080p → ~10 MB/min
 *   720p  → ~6 MB/min
 *   480p  → ~3 MB/min
 *   audio-only → ~0.5 MB/min
 *   auto  → treat as 720p (Twilio's connect-time default; matches the
 *           comment in `<VideoRoom>` near `readPersistedVideoQuality`)
 *
 * No DOM access in this file beyond the narrow `navigator.connection`
 * read; everything else is pure arithmetic / branching.
 */

import type { QualityOption } from "@/components/consultation/VideoQualityPicker";

/**
 * Tri-state cellular detection result.
 *
 *   - `'cellular'`   → connection.type === 'cellular' OR effectiveType
 *                      ∈ {2g, 3g, 4g, 5g}.
 *   - `'non-cellular'` → connection.type ∈ {wifi, ethernet, ...} OR
 *                      effectiveType is unknown but `type` is
 *                      explicitly non-cellular.
 *   - `'unknown'`    → `navigator.connection` undefined OR `type` is
 *                      `'unknown'` AND no usable `effectiveType`. Treat
 *                      as "don't warn" (Decision: under-warn beats
 *                      over-warn).
 */
export type CellularDetection = "cellular" | "non-cellular" | "unknown";

/**
 * Minimal shape of `navigator.connection` we actually read. Typed
 * narrowly so the test file can pass plain objects without faking the
 * full Network Information API.
 *
 * `type` is the W3C "Connection Type" (wifi / cellular / ethernet /
 * none / unknown / …). `effectiveType` is the "Effective Connection
 * Type" (slow-2g / 2g / 3g / 4g / 5g) which Chrome derives from RTT +
 * downlink heuristics — present on more browsers than `type` is.
 */
export interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
}

const CELLULAR_EFFECTIVE_TYPES = new Set([
  "slow-2g",
  "2g",
  "3g",
  "4g",
  "5g",
]);

/**
 * Pure detection — given a `NetworkInformationLike` (or `null` /
 * `undefined` for "API unsupported"), return one of the three states.
 * The runtime wrapper `detectCellularConnection()` reads
 * `navigator.connection` and forwards to this function so the wrapper
 * stays SSR-safe AND the heuristic logic is testable in isolation.
 */
export function classifyConnection(
  conn: NetworkInformationLike | null | undefined,
): CellularDetection {
  if (!conn) return "unknown";
  const type = typeof conn.type === "string" ? conn.type.toLowerCase() : "";
  const effectiveType =
    typeof conn.effectiveType === "string" ? conn.effectiveType.toLowerCase() : "";

  // `type` is the strongest signal when present. Chrome/Android +
  // some embedded browsers populate it; desktop Chrome rarely does.
  if (type === "cellular") return "cellular";
  if (type === "wifi" || type === "ethernet" || type === "wimax") {
    return "non-cellular";
  }
  if (type === "none") {
    // Offline — there's no consult to warn about, so "unknown" is the
    // honest answer (the join flow itself will fail elsewhere).
    return "unknown";
  }

  // Fall back to `effectiveType`. This is the path most cellular Android
  // users actually take because Chrome populates `effectiveType` more
  // reliably than `type`. We treat any 2g/3g/4g/5g signal as cellular.
  if (effectiveType && CELLULAR_EFFECTIVE_TYPES.has(effectiveType)) {
    return "cellular";
  }

  return "unknown";
}

/**
 * Runtime wrapper — reads `navigator.connection` defensively and
 * forwards to `classifyConnection`. SSR-safe (returns `'unknown'`
 * outside the browser). Safari (no Network Information API) returns
 * `'unknown'` and the consumer should suppress the warning entirely.
 */
export function detectCellularConnection(): CellularDetection {
  if (typeof navigator === "undefined") return "unknown";
  // The API is non-standard; the cast keeps the file portable across
  // TS lib targets that don't ship the type yet.
  const conn = (
    navigator as unknown as { connection?: NetworkInformationLike }
  ).connection;
  return classifyConnection(conn ?? null);
}

/**
 * Coarse MB/min estimate per B8 quality option. Numbers are the spec's
 * §T5.37 "Estimated MB/min figure" mapping; `'auto'` treats the call
 * as 720p (Twilio's connect-time default — see `<VideoRoom>`).
 */
export function mbPerMinuteForQuality(quality: QualityOption): number {
  switch (quality) {
    case "1080p":
      return 10;
    case "720p":
      return 6;
    case "480p":
      return 3;
    case "audio-only":
      return 0.5;
    case "auto":
    default:
      // `'auto'` ≈ Twilio's 720p default. Keep this in sync with
      // `<VideoRoom>`'s connect-time defaults if Twilio's ceiling
      // changes.
      return 6;
  }
}

/**
 * Total MB for a given quality + duration (minutes). Returned as a
 * number so the caller can format / round however it likes.
 *
 * Negative / NaN durations clamp to `0` so the UI never renders
 * "−42 MB" if a parent passes garbage.
 */
export function estimatedMbForDuration(
  quality: QualityOption,
  durationMinutes: number,
): number {
  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return 0;
  }
  return mbPerMinuteForQuality(quality) * durationMinutes;
}

/**
 * Friendly MB string for the modal copy. Uses `~` prefix to make the
 * approximation explicit. < 1 MB rounds to one decimal so audio-only
 * over a 30-min consult ("~15 MB") doesn't read as "~0 MB".
 */
export function formatMbEstimate(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "~0 MB";
  if (mb < 10) return `~${mb.toFixed(1)} MB`;
  return `~${Math.round(mb)} MB`;
}
