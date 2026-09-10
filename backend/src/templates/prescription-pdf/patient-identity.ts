/**
 * Patient-identity helpers for the prescription PDF card.
 * Never log names, phones, addresses, or MRNs.
 */

import { DateTime } from 'luxon';

export function computeAgeLabel(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const dt = DateTime.fromISO(dob);
  if (!dt.isValid) return null;
  const years = Math.floor(DateTime.now().diff(dt, 'years').years);
  if (years < 0 || years > 130) return null;
  return `${years} y`;
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
