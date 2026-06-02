/**
 * Cockpit back-navigation targets (nav-back-01, 2026-05-27).
 *
 * Originators tag navigations with `?from=<origin>` so the cockpit header's
 * ← link returns the doctor to OPD, Today, or Patients as appropriate.
 *
 * nav-back-02 (2026-05-28): optional `?date=` preserves the OPD session
 * date the doctor had selected before opening a patient row.
 */

export type CockpitOrigin = "opd-today" | "today" | "patients-v2";

export const COCKPIT_ORIGIN_PARAM = "from";
export const COCKPIT_PATIENT_ID_PARAM = "pid";
export const COCKPIT_DATE_PARAM = "date";

export interface BackTarget {
  label: string;
  href: string;
}

const VALID_ORIGINS: readonly CockpitOrigin[] = [
  "opd-today",
  "today",
  "patients-v2",
];

export function parseCockpitOrigin(
  value: string | null | undefined,
): CockpitOrigin | null {
  if (!value) return null;
  return (VALID_ORIGINS as readonly string[]).includes(value)
    ? (value as CockpitOrigin)
    : null;
}

function opdTodayHref(opdDate?: string | null): string {
  if (!opdDate) return "/dashboard/opd-today";
  return `/dashboard/opd-today?${COCKPIT_DATE_PARAM}=${encodeURIComponent(opdDate)}`;
}

export function resolveBackTarget(
  origin: CockpitOrigin | null,
  patientId?: string | null,
  opdDate?: string | null,
): BackTarget {
  switch (origin) {
    case "opd-today":
      return { label: "OPD", href: opdTodayHref(opdDate) };
    case "today":
      return { label: "Today", href: "/dashboard" };
    case "patients-v2":
      return {
        label: "Patient profile",
        href: patientId
          ? `/dashboard/patients-v2/${patientId}`
          : "/dashboard/patients-v2",
      };
    default:
      return { label: "OPD", href: opdTodayHref(opdDate) };
  }
}

type SearchParamsLike = { get(name: string): string | null };

export function readCockpitOriginFromSearchParams(
  searchParams: SearchParamsLike,
): {
  origin: CockpitOrigin | null;
  patientId: string | null;
  opdDate: string | null;
} {
  return {
    origin: parseCockpitOrigin(searchParams.get(COCKPIT_ORIGIN_PARAM)),
    patientId: searchParams.get(COCKPIT_PATIENT_ID_PARAM),
    opdDate: searchParams.get(COCKPIT_DATE_PARAM),
  };
}

function appendOriginParams(
  params: URLSearchParams,
  options?: { patientId?: string | null; opdDate?: string | null },
): void {
  if (options?.patientId) {
    params.set(COCKPIT_PATIENT_ID_PARAM, options.patientId);
  }
  if (options?.opdDate) {
    params.set(COCKPIT_DATE_PARAM, options.opdDate);
  }
}

export function buildCockpitAppointmentPath(
  appointmentId: string,
  origin: CockpitOrigin,
  options?: { patientId?: string | null; opdDate?: string | null },
): string {
  const params = new URLSearchParams();
  params.set(COCKPIT_ORIGIN_PARAM, origin);
  appendOriginParams(params, options);
  return `/dashboard/appointments/${appointmentId}?${params.toString()}`;
}

/** Preserve `from` / `pid` / `date` when hopping between appointments inside the cockpit. */
export function buildCockpitAppointmentPathFromCurrentOrigin(
  appointmentId: string,
  searchParams: SearchParamsLike,
): string {
  const { origin, patientId, opdDate } =
    readCockpitOriginFromSearchParams(searchParams);
  if (origin) {
    return buildCockpitAppointmentPath(appointmentId, origin, {
      patientId,
      opdDate,
    });
  }
  return `/dashboard/appointments/${appointmentId}`;
}

/** Append origin query params to an arbitrary cockpit sub-path (e.g. chat-history). */
export function appendCockpitOriginParams(
  path: string,
  origin: CockpitOrigin | null,
  options?: { patientId?: string | null; opdDate?: string | null },
): string {
  if (!origin) return path;
  const params = new URLSearchParams();
  params.set(COCKPIT_ORIGIN_PARAM, origin);
  appendOriginParams(params, options);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${params.toString()}`;
}

export function appendCockpitOriginFromSearchParams(
  path: string,
  searchParams: SearchParamsLike,
): string {
  const { origin, patientId, opdDate } =
    readCockpitOriginFromSearchParams(searchParams);
  return appendCockpitOriginParams(path, origin, { patientId, opdDate });
}
