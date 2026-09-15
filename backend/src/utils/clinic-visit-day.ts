/**
 * Clinic-local visit day (RXL-DL-14 / RXL-Q7).
 *
 * A session day starts at 06:00 in the doctor's IANA timezone and runs
 * until 06:00 the next morning, so an evening OPD past midnight stays
 * on the same slip. Desk "today" (`localDayUtcRange`) is midnight-to-midnight
 * — do not reuse that helper here.
 */

import { DateTime } from 'luxon';

/** Local hour when the previous clinic day ends and the next begins. */
export const CLINIC_DAY_CUTOVER_HOUR = 6;

export function clinicVisitDayYmd(instant: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(instant).setZone(timezone);
  const shifted = dt.hour < CLINIC_DAY_CUTOVER_HOUR ? dt.minus({ days: 1 }) : dt;
  return shifted.toISODate()!;
}

export function isSameClinicVisitDay(
  issuedAt: Date,
  now: Date,
  timezone: string
): boolean {
  return clinicVisitDayYmd(issuedAt, timezone) === clinicVisitDayYmd(now, timezone);
}
