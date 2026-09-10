/**
 * Client-side patients list filter/sort/page — mirrors server segment rules
 * for fields already present on enriched `PatientSummary` rows.
 *
 * Used so KPI/chip toggles don't wait on another full list API round-trip.
 */

import type {
  PatientListFilters,
  PatientListSortId,
  PatientSegmentId,
  PatientSummary,
  PatientsListPagedData,
} from "@/types/patient";
import { coercePatientTags, patientHasTag } from "@/lib/patients-v2/patient-tags";

const MS_90D = 90 * 24 * 60 * 60 * 1000;

/** Stable compare key for filter objects (URL sync + query memo deps). */
export function patientListFiltersKey(filters: PatientListFilters): string {
  return JSON.stringify({
    q: filters.q ?? "",
    segment: filters.segment ?? "",
    tag: filters.tag ?? "",
    sort: filters.sort ?? "",
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 50,
  });
}

/** Case-insensitive membership on patient_tags. */
export function applyClientTagFilter(
  patients: PatientSummary[],
  tag: string,
): PatientSummary[] {
  if (!tag.trim()) return patients;
  return patients.filter((p) =>
    patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), tag),
  );
}

/** Segments that cannot be derived from enriched list rows alone. */
export function segmentNeedsServerFetch(
  segment: PatientSegmentId | undefined,
): boolean {
  return (
    segment === "no-show-prone" ||
    segment === "incomplete-consult" ||
    segment === "revisit-30d" ||
    // Visit-based new (PKD-D3) needs completed-visit history.
    segment === "new-30d"
  );
}

export function applyClientSegment(
  patients: PatientSummary[],
  segment: PatientSegmentId,
  nowMs = Date.now(),
): PatientSummary[] {
  switch (segment) {
    case "active-90d":
      return patients.filter((p) => {
        if (!p.last_appointment_date) return false;
        return nowMs - new Date(p.last_appointment_date).getTime() <= MS_90D;
      });
    case "new-30d":
    case "revisit-30d":
    case "incomplete-consult":
    case "no-show-prone":
      // Not available on summary — caller must use server fetch.
      return patients;
    case "untagged":
      return patients.filter(
        (p) => coercePatientTags(p.patient_tags, p.patient_tag).length === 0,
      );
    case "has-allergies":
      return patients.filter((p) => Boolean(p.has_allergies));
    case "has-open-episodes":
      return patients.filter((p) => (p.open_episodes_count ?? 0) > 0);
    case "at-risk-followup":
      // Server segment currently no-ops; enriched flag is the useful signal.
      return patients.filter((p) => Boolean(p.overdue_followup));
    default: {
      const _exhaustive: never = segment;
      return _exhaustive;
    }
  }
}

function applyClientSearch(
  patients: PatientSummary[],
  q: string,
): PatientSummary[] {
  const needle = q.toLowerCase();
  return patients.filter((p) => {
    const nameMatch = p.name.toLowerCase().includes(needle);
    const phoneMatch = p.phone.includes(q);
    const mrnMatch = (p.medical_record_number ?? "").toLowerCase().includes(needle);
    const handleMatch = (p.platform_external_id ?? "").toLowerCase().includes(needle);
    return nameMatch || phoneMatch || mrnMatch || handleMatch;
  });
}

function applyClientSort(
  patients: PatientSummary[],
  sort: PatientListSortId | undefined,
): PatientSummary[] {
  const rows = [...patients];
  const byLastVisitDesc = (a: PatientSummary, b: PatientSummary) => {
    const at = a.last_appointment_date
      ? new Date(a.last_appointment_date).getTime()
      : 0;
    const bt = b.last_appointment_date
      ? new Date(b.last_appointment_date).getTime()
      : 0;
    if (bt !== at) return bt - at;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

  switch (sort) {
    case "last-visit-asc":
      rows.sort((a, b) => -byLastVisitDesc(a, b));
      break;
    case "created-at-desc":
      rows.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      break;
    case "created-at-asc":
      rows.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      break;
    case "name-asc":
      rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      break;
    case "last-visit-desc":
    case undefined:
    default:
      rows.sort(byLastVisitDesc);
      break;
  }
  return rows;
}

/**
 * Filter / sort / page an already-fetched enriched roster.
 * Returns null when the roster is incomplete (total > loaded) so caller
 * can fall back to a server-filtered request.
 */
export function projectPatientsListClientSide(
  roster: PatientsListPagedData,
  filters: PatientListFilters,
): PatientsListPagedData | null {
  if (roster.total > roster.patients.length) {
    return null;
  }

  if (segmentNeedsServerFetch(filters.segment)) {
    return null;
  }

  let rows = roster.patients;
  if (filters.q?.trim()) {
    rows = applyClientSearch(rows, filters.q.trim());
  }
  if (filters.segment) {
    rows = applyClientSegment(rows, filters.segment);
  }
  if (filters.tag?.trim()) {
    rows = applyClientTagFilter(rows, filters.tag);
  }
  rows = applyClientSort(rows, filters.sort);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const total = rows.length;
  const offset = (page - 1) * pageSize;

  return {
    patients: rows.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
  };
}
