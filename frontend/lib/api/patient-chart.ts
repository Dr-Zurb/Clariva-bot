/**
 * Patient chart API extensions (EHR Sub-batch D / T5.22–T5.25).
 *
 * Thin add-on to the chart endpoints already exposed by `frontend/lib/api.ts`.
 * The base file owns the CRUD + soft-delete helpers; this file owns the
 * trend-oriented helpers introduced by Sub-batch D (vitals history + the
 * trend-modal time-window queries that arrive in D.2) and the problem-list
 * helper (D.4 / T5.25).
 *
 * Re-exports the shared base helpers so callers can import everything
 * patient-chart-related from a single module:
 *
 *   import {
 *     listVitalsHistory,
 *     listPatientProblems,
 *     listPatientVitals,
 *     createPatientVitals,
 *   } from "@/lib/api/patient-chart";
 *
 * @see frontend/lib/api.ts (base CRUD)
 * @see frontend/components/ehr/sections/VitalsSection.tsx
 * @see frontend/components/ehr/VitalTrendModal.tsx (D.2 — consumer)
 * @see frontend/components/ehr/sections/ProblemListSection.tsx (D.4)
 */

import {
  archivePatientVitals,
  createPatientVitals,
  listPatientVitals,
  updatePatientVitals,
} from "@/lib/api";
import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type {
  PatientVitalsReading,
  ProblemsListData,
  VitalsListData,
} from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Re-exports — keep call-sites pointing at one module
// ---------------------------------------------------------------------------

export {
  archivePatientVitals,
  createPatientVitals,
  listPatientVitals,
  updatePatientVitals,
};

// ---------------------------------------------------------------------------
// New helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the most recent N vitals readings for a patient, oldest-first
 * (chronological) so consumers can drop the array straight into a chart
 * without re-sorting.
 *
 * The base `listPatientVitals` returns `recorded_at DESC` (newest first —
 * the chart-panel hot path). Trend rendering wants chronological order, so
 * we reverse here in the client. The DB index (idx_patient_vitals_chart_lookup
 * on (doctor_id, patient_id, recorded_at DESC) WHERE archived_at IS NULL)
 * already covers the underlying query.
 *
 * @param token     Doctor JWT.
 * @param patientId Patient UUID.
 * @param limit     Max rows to fetch (default 20). Hard ceiling enforced
 *                  server-side; very large values get truncated there.
 *                  D.1 / sparklines use 20; D.2 / trend modal can request
 *                  more (typically 200 — last 90 days at ~2 readings/day).
 * @returns Chronological (oldest → newest) array of readings.
 */
export async function listVitalsHistory(
  token: string,
  patientId: string,
  limit: number = 20,
): Promise<PatientVitalsReading[]> {
  const res: ApiSuccess<VitalsListData> = await listPatientVitals(
    token,
    patientId,
    { limit },
  );
  const rows = res.data.vitals ?? [];
  // Server returns DESC; flip for chronological consumption.
  return [...rows].reverse();
}

// ---------------------------------------------------------------------------
// Problem list (D.4 / T5.25)
// ---------------------------------------------------------------------------

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

/**
 * GET /api/v1/patients/:patientId/chart/problems
 *
 * Returns unified problem list rows from `patient_problem_list_v`:
 *   - chronic  — non-archived chronic conditions
 *   - episode  — active care episodes
 *   - recurring — diagnoses appearing ≥2× in last 6 months
 *
 * @param token     Doctor JWT.
 * @param patientId Patient UUID.
 */
export async function listPatientProblems(
  token: string,
  patientId: string,
): Promise<ApiSuccess<ProblemsListData>> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/patients/${patientId}/chart/problems`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<ProblemsListData>
    | ApiError;

  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    if (isApiError(json)) err.code = json.error.code;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return json as ApiSuccess<ProblemsListData>;
}
