/**
 * Patient-visible PDF filename (rxl-27 / RXL-DL-11).
 * Storage key stays `${doctorId}/${prescriptionId}.pdf`.
 */

import { DateTime } from 'luxon';
import { issuedInstantIso } from './prescription-replaces-line';

const DATE_SLUG = 'dLLLyyyy';

export function prescriptionPdfDateSlug(
  instantIso: string | null | undefined,
  timezone?: string | null,
  now: Date = new Date()
): string {
  const tz = timezone?.trim() || 'Asia/Kolkata';
  const fromIso = instantIso ? DateTime.fromISO(instantIso, { zone: tz }) : null;
  const dt = fromIso?.isValid
    ? fromIso
    : DateTime.fromJSDate(now).setZone(tz);
  return dt.toFormat(DATE_SLUG).toLowerCase();
}

export function buildPrescriptionPdfFilename(input: {
  instantIso?: string | null;
  version?: number | null;
  timezone?: string | null;
  now?: Date;
}): string {
  const datePart = prescriptionPdfDateSlug(
    input.instantIso,
    input.timezone,
    input.now
  );
  const version = input.version;
  if (typeof version === 'number' && Number.isFinite(version) && version >= 1) {
    return `prescription-${datePart}-v${version}.pdf`;
  }
  return `prescription-${datePart}.pdf`;
}

export function prescriptionPdfFilenameFromRow(
  row: {
    issued_at?: string | null;
    attested_at?: string | null;
    created_at?: string | null;
    version?: number | null;
  },
  timezone?: string | null,
  now?: Date
): string {
  return buildPrescriptionPdfFilename({
    instantIso:
      issuedInstantIso(row.issued_at, row.attested_at) ?? row.created_at ?? null,
    version: row.version,
    timezone,
    now,
  });
}
