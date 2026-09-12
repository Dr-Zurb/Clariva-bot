/**
 * Last visit summary for cockpit strips (last-visit-context · lvc-01)
 * GET /api/v1/patients/:patientId/last-visit-summary?appointmentId=
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiError, ApiSuccess } from "@/lib/api";
import type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";
import type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";
import type { SocialHistoryStructured } from "@/lib/cockpit/social-history";
import type {
  Complaint,
  CustomSubsection,
  DiagnosisRow,
  DoseUnit,
  DurationUnit,
  ExamSystemFinding,
  FollowUpUnit,
  FoodTiming,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";

export interface LastVisitMedicine {
  medicineName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  drugMasterId: string | null;
  frequencyCode: FrequencyCode | null;
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  routeCode: RouteCode | null;
  doseQty: number | null;
  doseUnit: DoseUnit | null;
  form: string | null;
  foodTiming: FoodTiming | null;
}

export interface LastVisitSummary {
  sourcePrescriptionId: string;
  sourceCreatedAt: string;
  complaints: Complaint[];
  diagnoses: DiagnosisRow[];
  provisionalDiagnosis: string | null;
  medicines: LastVisitMedicine[];
  /** Column vitals from the prior slip (lvc-14). Absent or empty → no ghosts. */
  vitals?: Partial<
    Record<
      | "vitalsBpSystolic"
      | "vitalsBpDiastolic"
      | "vitalsHr"
      | "vitalsRr"
      | "vitalsTempC"
      | "vitalsSpo2"
      | "vitalsWtKg"
      | "vitalsHtCm"
      | "vitalsPainScore"
      | "vitalsGlucoseMgDl"
      | "vitalsGcsTotal"
      | "vitalsHeadCircumferenceCm"
      | "vitalsMuacCm"
      | "vitalsWaistCm",
      number
    >
  > | null;
  investigationsOrders: string | null;
  advice: string | null;
  followUp: string | null;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
  hopi?: string | null;
  familyHistory?: string | null;
  familyHistoryStructured?: FamilyHistoryStructured | null;
  socialHistory?: string | null;
  socialHistoryStructured?: SocialHistoryStructured | null;
  pastSurgicalHistory?: string | null;
  pastSurgicalHistoryStructured?: PastSurgicalHistoryStructured | null;
  examinationFindings?: string | null;
  examinationJson?: ExamSystemFinding[];
  assessmentNote?: string | null;
  clinicalNotes?: string | null;
  referral?: string | null;
  customSubsections?: CustomSubsection[];
  assessmentCustomSections?: CustomSubsection[];
  planCustomSections?: CustomSubsection[];
}

export interface LastVisitSummaryData {
  summary: LastVisitSummary | null;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

export async function getLastVisitSummary(
  token: string,
  patientId: string,
  appointmentId: string
): Promise<ApiSuccess<LastVisitSummaryData>> {
  const params = new URLSearchParams({ appointmentId });
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/patients/${encodeURIComponent(patientId)}/last-visit-summary?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const json = (await res.json().catch(() => ({}))) as
    ApiSuccess<LastVisitSummaryData> | ApiError;
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

  return json as ApiSuccess<LastVisitSummaryData>;
}
