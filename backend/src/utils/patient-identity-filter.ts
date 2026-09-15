import { ageYearsFromIsoDate } from './validation';

export const DESK_AGE_TOLERANCE_YEARS = 3;

export type PatientIdentityFilter = {
  name?: string;
  guardianName?: string;
  age?: number;
  gender?: string;
};

export function effectiveAgeYears(
  age: number | null | undefined,
  dateOfBirth: string | Date | null | undefined
): number | null {
  if (dateOfBirth) {
    const iso =
      typeof dateOfBirth === 'string'
        ? dateOfBirth.slice(0, 10)
        : `${dateOfBirth.getFullYear()}-${String(dateOfBirth.getMonth() + 1).padStart(2, '0')}-${String(dateOfBirth.getDate()).padStart(2, '0')}`;
    const fromDob = ageYearsFromIsoDate(iso);
    if (fromDob != null) return fromDob;
  }
  return age ?? null;
}

function includesInsensitive(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase());
}

/** AND of whichever identity fields are present. */
export function matchesPatientIdentityFilter(
  row: {
    name: string;
    guardian_name?: string | null;
    age?: number | null;
    date_of_birth?: string | Date | null;
    gender?: string | null;
  },
  filters: PatientIdentityFilter
): boolean {
  if (filters.name && !includesInsensitive(row.name, filters.name)) return false;
  if (filters.guardianName && !includesInsensitive(row.guardian_name, filters.guardianName)) {
    return false;
  }
  if (filters.age != null) {
    const years = effectiveAgeYears(row.age, row.date_of_birth);
    if (years == null || Math.abs(years - filters.age) > DESK_AGE_TOLERANCE_YEARS) return false;
  }
  if (filters.gender) {
    if ((row.gender ?? '').trim().toLowerCase() !== filters.gender) return false;
  }
  return true;
}

export function hasPatientIdentityFilter(filters: PatientIdentityFilter): boolean {
  return Boolean(
    filters.name || filters.guardianName || filters.age != null || filters.gender
  );
}
