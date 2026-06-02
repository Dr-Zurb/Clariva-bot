/**
 * DL-6 copy templates for OPD per-day mode conversion patient notifications (pdm-06).
 * English-only in this batch; PD-D6 defers per-doctor / per-locale customisation.
 */

import { DateTime } from 'luxon';
import type { OpdMode } from '../../types/doctor-settings';

export interface TemplateVars {
  doctorName: string;
  date: string;
  time?: string;
  tokenNumber?: number;
  /** Minutes from session start (formatted for display). */
  eta?: string;
  rescheduleUrl: string;
  isOverflow?: boolean;
}

export type OpdModeConversionTemplateKey =
  | 'slot_to_queue'
  | 'queue_to_slot_regular'
  | 'queue_to_slot_overflow';

/**
 * DL-6 template 1: slot → queue (any patient).
 */
export function slotToQueueTemplate(vars: TemplateVars): string {
  const eta = vars.eta ?? 'TBD';
  return (
    `Dr. ${vars.doctorName} has changed ${vars.date} to queue mode. ` +
    `Your slot at ${vars.time ?? 'TBD'} is now token #${vars.tokenNumber ?? '?'}. ` +
    `Estimated wait: ~${eta} min from session start. ` +
    `Reschedule: ${vars.rescheduleUrl}`
  );
}

/**
 * DL-6 template 2: queue → slot (regular-grid patient).
 */
export function queueToSlotRegularTemplate(vars: TemplateVars): string {
  const arrivalTime = formatArriveBy(vars.time);
  return (
    `Dr. ${vars.doctorName} has changed ${vars.date} to slot mode. ` +
    `Your token #${vars.tokenNumber ?? '?'} is now a fixed appointment at ${vars.time ?? 'TBD'}. ` +
    `Please plan to arrive by ${arrivalTime}. ` +
    `Reschedule: ${vars.rescheduleUrl}`
  );
}

/**
 * DL-6 template 3: queue → slot (overflow patient).
 */
export function queueToSlotOverflowTemplate(vars: TemplateVars): string {
  return (
    `Dr. ${vars.doctorName} has reorganised ${vars.date}. ` +
    `Your token #${vars.tokenNumber ?? '?'} is now an overflow slot at end of session (estimated ${vars.time ?? 'TBD'}). ` +
    `You'll be seen after all scheduled patients. ` +
    `Reschedule: ${vars.rescheduleUrl}`
  );
}

/**
 * Pick the right template for a given affected appointment.
 */
export function pickTemplate(
  latestMode: OpdMode,
  _previousMode: OpdMode | null,
  isOverflow: boolean
): OpdModeConversionTemplateKey {
  if (latestMode === 'queue') return 'slot_to_queue';
  return isOverflow ? 'queue_to_slot_overflow' : 'queue_to_slot_regular';
}

export function renderTemplate(
  key: OpdModeConversionTemplateKey,
  vars: TemplateVars
): string {
  switch (key) {
    case 'slot_to_queue':
      return slotToQueueTemplate(vars);
    case 'queue_to_slot_regular':
      return queueToSlotRegularTemplate(vars);
    case 'queue_to_slot_overflow':
      return queueToSlotOverflowTemplate(vars);
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/** Subtract 5 minutes from a display time string (HH:mm a) when ISO source is provided. */
export function formatArriveBy(time: string | undefined, timezone = 'Asia/Kolkata'): string {
  if (!time) return 'TBD';
  const parsed = DateTime.fromFormat(time, 'h:mm a', { zone: timezone });
  if (parsed.isValid) {
    return parsed.minus({ minutes: 5 }).toFormat('h:mm a');
  }
  return time;
}

export function formatSessionDateInDoctorTZ(date: string, timezone: string): string {
  const dt = DateTime.fromISO(date, { zone: timezone });
  if (!dt.isValid) return date;
  return dt.toFormat('ccc, LLL d');
}

export function formatTimeInDoctorTZ(iso: string, timezone: string): string {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
  if (!dt.isValid) return 'TBD';
  return dt.toFormat('h:mm a');
}

/**
 * Rough ETA minutes from session start for queue mode: (token - 1) × 15 min.
 */
export function estimateQueueEtaMinutes(tokenNumber: number | undefined): string {
  if (tokenNumber == null || tokenNumber < 1) return 'TBD';
  return String((tokenNumber - 1) * 15);
}
