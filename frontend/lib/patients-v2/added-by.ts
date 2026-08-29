import type { Patient } from "@/types/patient";

/**
 * One-line provenance for the patient header.
 * Uses created_by vs viewer to say "you"; otherwise the channel + label.
 */
export function formatPatientAddedBy(
  patient: Pick<Patient, "registered_via" | "created_by" | "created_by_label">,
  viewerId?: string | null
): string | null {
  const via = patient.registered_via ?? null;
  if (!via) return null;

  const byYou =
    Boolean(patient.created_by) &&
    Boolean(viewerId) &&
    patient.created_by === viewerId;
  if (byYou) return "Added by you";

  if (via === "front_desk") {
    const label = patient.created_by_label?.trim();
    return label ? `Added by front desk (${label})` : "Added by front desk";
  }
  if (via === "doctor") return "Added by doctor";
  if (via === "bot") return "Added via chat";
  if (via === "booking_for_other") return "Added via booking for someone else";
  if (via === "import") return "Imported";
  return null;
}
