/**
 * ARM-07: Service staff review inbox types (aligned with GET /api/v1/service-staff-reviews).
 */

export type ServiceStaffReviewStatus =
  | "pending"
  | "confirmed"
  | "reassigned"
  | "cancelled_by_staff"
  | "cancelled_timeout";

export interface ServiceStaffReviewListItem {
  id: string;
  doctor_id: string;
  conversation_id: string;
  patient_id: string | null;
  correlation_id: string | null;
  status: ServiceStaffReviewStatus;
  proposed_catalog_service_key: string;
  proposed_catalog_service_id: string | null;
  proposed_consultation_modality: "text" | "voice" | "video" | null;
  match_confidence: string;
  match_reason_codes: unknown;
  candidate_labels: unknown;
  sla_deadline_at: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  final_catalog_service_key: string | null;
  final_catalog_service_id: string | null;
  final_consultation_modality: string | null;
  resolution_internal_note: string | null;
  patient_display_name: string | null;
  reason_for_visit_preview: string | null;
}
