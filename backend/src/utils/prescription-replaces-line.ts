/**
 * Pharmacist replaces-line for a revised slip (rxl-26 / RXL-DL-11).
 * Paper copy, not engineer-speak. Version 1 never gets a line.
 */

import { DateTime } from 'luxon';

export const REPLACES_LINE_TIME = 'h:mm a';
export const REPLACES_LINE_REVISED = "h:mm a, d LLL yyyy";

export function issuedInstantIso(
  issuedAt: string | null | undefined,
  attestedAt: string | null | undefined
): string | null {
  if (typeof issuedAt === 'string' && issuedAt.length > 0) return issuedAt;
  if (typeof attestedAt === 'string' && attestedAt.length > 0) return attestedAt;
  return null;
}

function formatInZone(iso: string, timezone: string, fmt: string): string | null {
  const dt = DateTime.fromISO(iso, { zone: timezone });
  return dt.isValid ? dt.toFormat(fmt) : null;
}

export function buildPrescriptionReplacesLine(input: {
  version: number | null | undefined;
  revisedAtIso: string | null | undefined;
  previousIssuedAtIso: string | null | undefined;
  timezone?: string | null;
}): string | null {
  const version = input.version ?? 1;
  if (version < 2) return null;
  const timezone = input.timezone?.trim() || 'Asia/Kolkata';
  const revisedAt = input.revisedAtIso
    ? formatInZone(input.revisedAtIso, timezone, REPLACES_LINE_REVISED)
    : null;
  if (!revisedAt) return null;
  const previous = input.previousIssuedAtIso
    ? formatInZone(input.previousIssuedAtIso, timezone, REPLACES_LINE_TIME)
    : null;
  if (previous) {
    return `Revised ${revisedAt} — replaces the slip issued ${previous}. Version ${version}.`;
  }
  return `Revised ${revisedAt}. Version ${version}.`;
}
