/**
 * Last subjective for carry-forward (subjective-tab · subj-07)
 * GET /api/v1/prescriptions/last-subjective?patientId=&appointmentId=
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { Complaint } from "@/types/prescription";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
import type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";
import type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";

export interface LastSubjectiveForPatient {
  sourcePrescriptionId: string;
  sourceCreatedAt: string;
  complaints: Complaint[];
  familyHistory: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
}

export interface LastSubjectiveData {
  subjective: LastSubjectiveForPatient | null;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

export async function getLastSubjectiveForPatient(
  token: string,
  patientId: string,
  appointmentId: string,
): Promise<ApiSuccess<LastSubjectiveData>> {
  const params = new URLSearchParams({
    patientId,
    appointmentId,
  });

  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/prescriptions/last-subjective?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const json = (await res.json().catch(() => ({}))) as ApiSuccess<LastSubjectiveData> | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number };
    err.status = json.error.statusCode ?? 500;
    throw err;
  }

  return json as ApiSuccess<LastSubjectiveData>;
}
