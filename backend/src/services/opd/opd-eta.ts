/**
 * Pure ETA helpers for queue-mode OPD (e-task-opd-03).
 * No PHI; used for rolling-average based wait estimates.
 */

export interface EtaFromRollingAverageResult {
  /** Estimated wait in whole minutes (ceiling). */
  etaMinutes: number;
  /** Average consult length in minutes used for the calculation. */
  avgMinutesUsed: number;
}

/**
 * ETA ≈ aheadCount × average consult duration (minutes).
 * Cold-start uses default minutes when there is no telemetry yet.
 */
export function computeEtaMinutesFromRollingAverage(
  aheadCount: number,
  avgConsultationSeconds: number | null | undefined,
  coldStartMinutes: number
): EtaFromRollingAverageResult {
  const safeAhead = Math.max(0, aheadCount);
  const avgMin =
    avgConsultationSeconds != null && avgConsultationSeconds > 0
      ? avgConsultationSeconds / 60
      : coldStartMinutes;
  const etaMinutes = Math.ceil(safeAhead * avgMin);
  return { etaMinutes, avgMinutesUsed: avgMin };
}
