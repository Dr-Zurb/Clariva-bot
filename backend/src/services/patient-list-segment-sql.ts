/**
 * Segment predicate fragments for GET /api/v1/patients (pr-02 / DL-4).
 * Used for unit-test assertions and documentation; runtime filtering is applied
 * in patient-service via equivalent TypeScript logic (Supabase client).
 */

import type { PatientListSortId, PatientSegmentId } from './patient-list-types';

export const PATIENT_SEGMENT_IDS = [
  'active-90d',
  'new-30d',
  'at-risk-followup',
  'no-show-prone',
  'has-allergies',
  'has-open-episodes',
  'untagged',
] as const satisfies readonly PatientSegmentId[];

export const PATIENT_LIST_SORT_IDS = [
  'last-visit-desc',
  'last-visit-asc',
  'created-at-desc',
  'created-at-asc',
  'name-asc',
] as const satisfies readonly PatientListSortId[];

/** Whether structured follow-up columns exist (cv2-04 / migration 103+). */
export const PRESCRIPTION_FOLLOW_UP_VALUE_SUPPORTED = false;

export function segmentWherePredicate(
  segment: PatientSegmentId,
  doctorIdParam = '$1'
): string {
  switch (segment) {
    case 'active-90d':
      return `AND last_appointment_date >= now() - INTERVAL '90 days'`;
    case 'new-30d':
      return `AND created_at >= now() - INTERVAL '30 days'`;
    case 'at-risk-followup':
      return `AND id IN (SELECT p.patient_id FROM prescriptions p WHERE p.doctor_id = ${doctorIdParam} AND p.follow_up_value IS NOT NULL AND (p.created_at + (p.follow_up_value || ' ' || COALESCE(p.follow_up_unit, 'days'))::INTERVAL) < now() AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.patient_id AND a.doctor_id = ${doctorIdParam} AND a.appointment_date > (p.created_at + (p.follow_up_value || ' ' || COALESCE(p.follow_up_unit, 'days'))::INTERVAL) AND a.status IN ('completed', 'confirmed')))`;
    case 'no-show-prone':
      return `AND (SELECT COUNT(*) FILTER (WHERE status = 'no_show') FROM (SELECT status FROM appointments WHERE patient_id = patients.id AND doctor_id = ${doctorIdParam} ORDER BY appointment_date DESC LIMIT 4) AS recent) >= 2`;
    case 'has-allergies':
      return `AND EXISTS (SELECT 1 FROM patient_allergies WHERE patient_id = patients.id AND doctor_id = ${doctorIdParam} AND archived_at IS NULL)`;
    case 'has-open-episodes':
      return `AND EXISTS (SELECT 1 FROM patient_problem_list_v WHERE patient_id = patients.id AND doctor_id = ${doctorIdParam} AND source = 'episode' AND episode_status IS DISTINCT FROM 'closed')`;
    case 'untagged':
      return `AND (patient_tag IS NULL OR patient_tag = '')`;
    default: {
      const _exhaustive: never = segment;
      return _exhaustive;
    }
  }
}

export function textSearchWherePredicate(qParam = '$q_pat'): string {
  return `AND (LOWER(name) LIKE LOWER(${qParam}) OR phone LIKE ${qParam} OR LOWER(medical_record_number) LIKE LOWER(${qParam}) OR LOWER(platform_external_id) LIKE LOWER(${qParam}))`;
}

export function sortOrderByClause(sort: PatientListSortId | undefined): string {
  switch (sort) {
    case 'last-visit-asc':
      return `ORDER BY last_appointment_date ASC NULLS LAST, name ASC`;
    case 'created-at-desc':
      return `ORDER BY created_at DESC`;
    case 'created-at-asc':
      return `ORDER BY created_at ASC`;
    case 'name-asc':
      return `ORDER BY LOWER(name) ASC`;
    case 'last-visit-desc':
    default:
      return `ORDER BY last_appointment_date DESC NULLS LAST, name ASC`;
  }
}
