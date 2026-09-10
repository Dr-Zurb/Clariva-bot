/**
 * Doctor-facing profile links for an Inbox interaction.
 * Mirrors backend `resolveInteractionProfileLinks` (interaction-service).
 *
 * - Chatter "Patient profile" only when registered (has MRN).
 * - Separate "Booked for" when appointment patient ≠ IG/FB chatter
 *   (booking for a family member — their row has no platform identity).
 */

export function resolveInteractionProfileLinks(item: {
  patient_id: string | null;
  medical_record_number: string | null;
  appointment_patient_id: string | null;
  appointment_patient_display_name: string | null;
  appointment_patient_mrn: string | null;
}): {
  chatterProfilePatientId: string | null;
  bookedForPatientId: string | null;
  bookedForLabel: string | null;
} {
  const chatterMrn = item.medical_record_number?.trim() || null;
  const chatterProfilePatientId =
    item.patient_id && chatterMrn ? item.patient_id : null;

  const aptPid = item.appointment_patient_id?.trim() || null;
  const bookedForSomeoneElse = Boolean(
    aptPid && (!item.patient_id || aptPid !== item.patient_id)
  );

  if (!bookedForSomeoneElse) {
    return {
      chatterProfilePatientId,
      bookedForPatientId: null,
      bookedForLabel: null,
    };
  }

  const name = item.appointment_patient_display_name?.trim() || null;
  const mrn = item.appointment_patient_mrn?.trim() || null;
  const bookedForLabel = name || mrn || "Patient";

  return {
    chatterProfilePatientId,
    bookedForPatientId: aptPid,
    bookedForLabel,
  };
}
