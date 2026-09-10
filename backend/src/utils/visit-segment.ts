/**
 * Visit-based New / Revisit (30d) — PKD-D3 / PKD-D4.
 * Uses completed appointments only; mutually exclusive.
 */

export const VISIT_SEGMENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type VisitSegmentKind = 'new-30d' | 'revisit-30d' | null;

/**
 * Classify a patient from their completed appointment timestamps (ms).
 * Empty / no visits in window → null.
 */
export function classifyVisitSegment(
  completedAppointmentMs: number[],
  nowMs: number,
  windowMs: number = VISIT_SEGMENT_WINDOW_MS
): VisitSegmentKind {
  const windowStart = nowMs - windowMs;
  const inWindow = completedAppointmentMs.filter((t) => t >= windowStart && t <= nowMs);
  if (inWindow.length === 0) return null;
  const beforeWindow = completedAppointmentMs.some((t) => t < windowStart);
  return beforeWindow ? 'revisit-30d' : 'new-30d';
}
