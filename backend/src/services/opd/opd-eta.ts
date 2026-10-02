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

export interface QueueWindow {
  start: string;
  end: string;
}

export interface QueueDayPreview {
  windows: QueueWindow[];
  nextToken: number;
  avgMinutes: number;
  expectedAt: string;
}

/**
 * Token 1 is the start of the first window. Later tokens walk through the
 * doctor's windows, then past the last one if the line runs long.
 */
export function buildQueueDayPreview(input: {
  windows: QueueWindow[];
  nextToken: number;
  avgConsultationSeconds: number | null;
  coldStartMinutes: number;
}): QueueDayPreview | null {
  const windows = input.windows.filter((window) => window.start && window.end);
  if (windows.length === 0 || input.nextToken < 1) return null;
  const aheadCount = Math.max(0, input.nextToken - 1);
  const { etaMinutes, avgMinutesUsed } = computeEtaMinutesFromRollingAverage(
    aheadCount,
    input.avgConsultationSeconds,
    input.coldStartMinutes
  );
  return {
    windows,
    nextToken: input.nextToken,
    avgMinutes: avgMinutesUsed,
    expectedAt: expectedAtFromWindows(windows, etaMinutes),
  };
}

function expectedAtFromWindows(windows: QueueWindow[], etaMinutes: number): string {
  let remainingMs = etaMinutes * 60 * 1000;
  for (const window of windows) {
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    const span = Math.max(0, end - start);
    if (remainingMs <= span) return new Date(start + remainingMs).toISOString();
    remainingMs -= span;
  }
  const last = windows[windows.length - 1]!;
  return new Date(new Date(last.end).getTime() + remainingMs).toISOString();
}
