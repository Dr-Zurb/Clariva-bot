/**
 * Clinic-local visit day (RXL-DL-14 / RXL-Q7).
 * Mirrors backend/src/utils/clinic-visit-day.ts — 06:00 cutover, not
 * desk midnight (`clinicYmd` / `localDayUtcRange`).
 */

export const CLINIC_DAY_CUTOVER_HOUR = 6;

function zonedParts(
  instant: Date,
  timezone: string,
): { ymd: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

export function clinicVisitDayYmd(instant: Date, timezone: string): string {
  const { ymd, hour } = zonedParts(instant, timezone);
  if (hour >= CLINIC_DAY_CUTOVER_HOUR) return ymd;
  const shifted = new Date(instant.getTime() - 24 * 60 * 60 * 1000);
  return zonedParts(shifted, timezone).ymd;
}

export function isSameClinicVisitDay(
  issuedAt: Date,
  now: Date,
  timezone: string,
): boolean {
  return clinicVisitDayYmd(issuedAt, timezone) === clinicVisitDayYmd(now, timezone);
}
