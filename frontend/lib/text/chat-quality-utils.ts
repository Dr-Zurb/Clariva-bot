/**
 * Pure helpers for text chat quality telemetry (task-text-D4).
 */

export type ConnectionQualityTier = "excellent" | "fair" | "poor";

export interface TextChatQualitySampleRow {
  roundtrip_p95_ms: number | null;
  realtime_reconnects: number;
  presence_flaps: number;
}

/** Nearest-rank p95 over a list of RTT samples (ms). */
export function computeP95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function deriveConnectionQualityTier(
  sample: TextChatQualitySampleRow,
): ConnectionQualityTier {
  const p95 = sample.roundtrip_p95_ms;
  const passesP95 = (max: number) => p95 == null || p95 < max;

  if (
    passesP95(500) &&
    sample.realtime_reconnects === 0 &&
    sample.presence_flaps <= 1
  ) {
    return "excellent";
  }
  if (
    passesP95(2000) &&
    sample.realtime_reconnects <= 1 &&
    sample.presence_flaps <= 3
  ) {
    return "fair";
  }
  return "poor";
}

export const CONNECTION_QUALITY_LABEL: Record<ConnectionQualityTier, string> = {
  excellent: "Excellent",
  fair: "Fair",
  poor: "Poor",
};
