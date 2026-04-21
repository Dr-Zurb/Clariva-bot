"use client";

import { useRouter } from "next/navigation";
import type { Appointment } from "@/types/appointment";
import ConsultationLauncher from "./ConsultationLauncher";
import MarkCompletedForm from "./MarkCompletedForm";
import PrescriptionForm from "./PrescriptionForm";
import PreviousPrescriptions from "./PreviousPrescriptions";

interface AppointmentConsultationActionsProps {
  appointment: Appointment;
  token: string;
}

/**
 * Appointment-detail-page consultation surface.
 *
 * Plan 03 · Task 20 split this component:
 *   - The "Start consultation" CTA + token fetch + room mount + patient join
 *     link moved into `<ConsultationLauncher>` so the new modality buttons
 *     row + future Text/Voice rooms have a clean home.
 *   - The clinical write-up surfaces (PrescriptionForm, MarkCompletedForm,
 *     PreviousPrescriptions) stay here — they are post-consult write paths,
 *     not consultation-launcher concerns, and exposing them when the
 *     appointment is in a sane status (independent of any in-memory session
 *     state) preserves today's behaviour.
 *
 * Task-20 spec called this a "thin pass-through wrapper", but a literal
 * pass-through would regress the prescription / mark-completed surfaces this
 * file already hosts. The launcher-at-top + write-surfaces-below split keeps
 * the diff surgical without breaking those flows.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-20-consultation-launcher-and-live-panel.md
 * @see e-task-6 (original component history)
 */
export default function AppointmentConsultationActions({
  appointment,
  token,
}: AppointmentConsultationActionsProps) {
  const router = useRouter();
  const handleRefresh = () => router.refresh();

  // `consultation_session.provider_session_id` is the persistent server-side
  // flag (post-Task-35 replacement for the dropped `consultation_room_sid`
  // column). We use it (not in-memory state) to decide whether write
  // surfaces should be visible for an appointment that's already had a
  // consultation started — survives page refresh and matches the legacy
  // behaviour of the OR'd boolean that previously combined this with the
  // in-memory `consultationData`.
  const consultationStarted = !!appointment.consultation_session?.provider_session_id;

  return (
    <div className="mt-6 space-y-6">
      <ConsultationLauncher appointment={appointment} token={token} />

      {appointment.patient_id && (
        <PreviousPrescriptions
          patientId={appointment.patient_id}
          appointmentId={appointment.id}
          token={token}
          limit={3}
        />
      )}

      {(consultationStarted ||
        appointment.status === "pending" ||
        appointment.status === "confirmed" ||
        appointment.status === "completed") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Prescription &amp; clinical note
          </h2>
          <PrescriptionForm
            appointmentId={appointment.id}
            patientId={appointment.patient_id ?? null}
            token={token}
            onSuccess={handleRefresh}
          />
        </div>
      )}

      {(consultationStarted || appointment.status !== "completed") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Mark as completed</h2>
          <MarkCompletedForm
            appointmentId={appointment.id}
            token={token}
            onSuccess={handleRefresh}
          />
        </div>
      )}
    </div>
  );
}
