/**
 * Patient-identity helpers for the prescription PDF card.
 * Never log names, phones, addresses, or MRNs.
 */

import { DateTime } from 'luxon';

export function formatAgeYearsLabel(years: number | null | undefined): string | null {
  if (years == null || !Number.isFinite(years)) return null;
  const whole = Math.floor(years);
  if (whole < 0 || whole > 130) return null;
  if (whole < 1) return '< 1 y';
  return `${whole} y`;
}

export function computeAgeYearsFromDob(
  dob: string | Date | null | undefined
): number | null {
  if (dob == null || dob === '') return null;
  let from: DateTime;
  if (dob instanceof Date) {
    if (Number.isNaN(dob.getTime())) return null;
    from = DateTime.fromJSDate(dob);
  } else {
    const iso = DateTime.fromISO(dob);
    from = iso.isValid ? iso : DateTime.fromJSDate(new Date(dob));
  }
  if (!from.isValid) return null;
  const years = Math.floor(DateTime.now().diff(from, 'years').years);
  if (years < 0 || years > 130) return null;
  return years;
}

export function computeAgeLabel(dob: string | Date | null | undefined): string | null {
  return formatAgeYearsLabel(computeAgeYearsFromDob(dob));
}

/** DOB wins; walk-in / chart age (years) fills in when DOB was never stored. */
export function resolvePatientAgeLabel(
  dob: string | Date | null | undefined,
  storedAgeYears?: number | null
): string | null {
  return computeAgeLabel(dob) ?? formatAgeYearsLabel(storedAgeYears);
}

export function formatAgeGender(
  ageLabel: string | null | undefined,
  gender: string | null | undefined
): string | null {
  const age = ageLabel?.trim() || '';
  const g = (gender ?? '').trim().toLowerCase();
  let abbrev = '';
  if (g === 'male' || g === 'm') abbrev = 'M';
  else if (g === 'female' || g === 'f') abbrev = 'F';
  else if (g === 'other') abbrev = 'Other';
  else if (g) abbrev = gender!.trim();
  if (age && abbrev) return `${age} · ${abbrev}`;
  if (age) return age;
  if (abbrev) return abbrev;
  return null;
}

/** Compact Indian-register form: s/o, d/o, w/o, c/o. */
export function formatGuardianLine(
  name: string | null | undefined,
  relation: string | null | undefined,
  gender: string | null | undefined
): string | null {
  const trimmed = name?.trim() || '';
  if (!trimmed) return null;
  const rel = (relation ?? '').trim().toLowerCase();
  const sex = (gender ?? '').trim().toLowerCase();
  if (rel === 'father') {
    return sex === 'female' || sex === 'f' ? `d/o ${trimmed}` : `s/o ${trimmed}`;
  }
  if (rel === 'spouse') return `w/o ${trimmed}`;
  if (rel === 'mother' || rel === 'son' || rel === 'daughter') return `c/o ${trimmed}`;
  return trimmed;
}
