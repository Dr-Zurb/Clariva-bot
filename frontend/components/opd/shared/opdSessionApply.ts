import type { OpdSessionPayload } from "@/types/opd-session";

/**
 * True when a session snapshot is safe to paint for the selected day.
 * Used to ignore React Query `keepPreviousData` placeholders from another date.
 */
export function isOpdSessionPayloadForDate(
  payload: OpdSessionPayload | null | undefined,
  sessionDate: string,
): payload is OpdSessionPayload {
  return payload != null && payload.date === sessionDate;
}
