export const DESK_AGE_MODES = ["years", "months", "days", "dob"] as const;

export type DeskAgeMode = (typeof DESK_AGE_MODES)[number];

export const DESK_AGE_MODE_OPTIONS = [
  { value: "years" as const, label: "Years" },
  { value: "months" as const, label: "Months" },
  { value: "days" as const, label: "Days" },
  { value: "dob" as const, label: "DOB" },
];

export const DESK_AGE_UNIT_LIMITS = {
  years: { min: 1, max: 120, placeholder: "Yrs", error: "Enter age in years (1–120)" },
  months: { min: 1, max: 36, placeholder: "Mo", error: "Enter age in months (1–36)" },
  days: { min: 1, max: 90, placeholder: "Days", error: "Enter age in days (1–90)" },
} as const;

/** Calendar YYYY-MM-DD in the local timezone. */
export function deskTodayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDeskAgeCount(mode: Exclude<DeskAgeMode, "dob">, raw: string): boolean {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(n)) return false;
  const limits = DESK_AGE_UNIT_LIMITS[mode];
  return n >= limits.min && n <= limits.max;
}

/**
 * Whole calendar years from a YYYY-MM-DD date. 0 if under one year.
 * Null when unparseable, in the future, or older than 130.
 */
export function ageYearsFromIsoDate(iso: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const birthY = Number(match[1]);
  const birthM = Number(match[2]);
  const birthD = Number(match[3]);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  let years = y - birthY;
  if (m < birthM || (m === birthM && d < birthD)) years -= 1;
  if (years < 0 || years > 130) return null;
  return years;
}

export function isValidDeskDob(iso: string, now = new Date()): boolean {
  return ageYearsFromIsoDate(iso, now) != null;
}

/** Years for desk chips. Infants under one year show as `<1`. */
export function formatDeskAgeYears(age: number | null | undefined): string {
  if (age == null || age < 0) return "—";
  if (age === 0) return "<1";
  return String(age);
}
